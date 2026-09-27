import Anthropic from "@anthropic-ai/sdk";
import { demoResponse } from "@/lib/demo";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/prompt";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAllowedPath } from "@/lib/validate";
import type { FileMap, StoreListing } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.APPMAKER_MODEL || "claude-opus-5";
/** AI generations allowed per client IP per hour. */
const HOURLY_LIMIT = Number(process.env.APPMAKER_RATE_LIMIT) || 30;

const MAX_PROMPT_CHARS = 8_000;
const MAX_FILES = 60;
const MAX_FILES_BYTES = 600_000;
const MAX_HISTORY_CHARS = 4_000;

interface GenerateRequest {
  prompt: string;
  files?: FileMap;
  listing?: Partial<StoreListing>;
  /** Earlier turns as plain text, oldest first. */
  history?: { role: "user" | "assistant"; content: string }[];
}

function hasCredentials(): boolean {
  if (process.env.APPMAKER_DEMO === "1") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function textStream(produce: (write: (s: string) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        await produce(write);
      } catch (err) {
        write(`\n<error>${errorMessage(err)}</error>`);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Appmaker-Mode": hasCredentials() ? "ai" : "demo",
    },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the AI provider — wait a moment and try again.";
  if (err instanceof Anthropic.APIError) return `AI provider error (${err.status ?? "network"}): ${err.message}`;
  return err instanceof Error ? err.message : "Unknown error";
}

function validateRequest(body: GenerateRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid request body";
  if (typeof body.prompt !== "string" || !body.prompt.trim()) return "prompt is required";
  if (body.prompt.length > MAX_PROMPT_CHARS) return `prompt must be at most ${MAX_PROMPT_CHARS} characters`;
  if (body.files != null) {
    if (typeof body.files !== "object" || Array.isArray(body.files)) return "files must be an object";
    const entries = Object.entries(body.files);
    if (entries.length > MAX_FILES) return `an app can have at most ${MAX_FILES} files`;
    let bytes = 0;
    for (const [path, code] of entries) {
      if (typeof code !== "string" || !isAllowedPath(path)) return `invalid file: ${path}`;
      bytes += code.length;
    }
    if (bytes > MAX_FILES_BYTES) return "the app is too large to edit in one request";
  }
  if (body.listing != null) {
    if (typeof body.listing !== "object" || Array.isArray(body.listing)) return "listing must be an object";
    if (JSON.stringify(body.listing).length > 10_000) return "listing is too large";
  }
  if (body.history != null) {
    if (!Array.isArray(body.history) || body.history.length > 200) return "history must be an array of at most 200 messages";
    for (const m of body.history) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "invalid history entry";
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const invalid = validateRequest(body);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const prompt = body.prompt.trim();
  const files = body.files ?? {};
  const isEdit = Object.keys(files).length > 0;

  if (!hasCredentials()) {
    const text = demoResponse(prompt, isEdit);
    return textStream(async (write) => {
      // Stream in chunks so the demo feels like live generation.
      for (let i = 0; i < text.length; i += 400) {
        write(text.slice(i, i + 400));
        await new Promise((r) => setTimeout(r, 25));
      }
    });
  }

  const limit = rateLimit(clientIp(req), HOURLY_LIMIT, 60 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: `You've reached the limit of ${HOURLY_LIMIT} generations per hour. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const client = new Anthropic();
  const history: Anthropic.Beta.BetaMessageParam[] = (body.history ?? [])
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
  // The API requires the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length && history[history.length - 1].role === "user") history.pop();

  return textStream(async (write) => {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [...history, { role: "user", content: buildUserMessage(prompt, files, body.listing) }],
      },
      { signal: req.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        write(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      write("\n<error>The AI declined this request. Try rephrasing your app idea.</error>");
    } else if (final.stop_reason === "max_tokens") {
      write("\n<error>The app was too large to finish in one pass. Ask for a smaller first version, then add features step by step.</error>");
    }
  });
}
