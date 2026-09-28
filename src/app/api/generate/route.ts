import { getProvider, type AiChoice } from "@/lib/ai/providers";
import { aiErrorMessage, AiConfigError, resolveAi, streamGeneration, type ResolvedAi } from "@/lib/ai/server";
import { demoResponse } from "@/lib/demo";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/prompt";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAllowedPath } from "@/lib/validate";
import type { FileMap, SiteSummary, StoreListing } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** AI generations on the site owner's keys allowed per client IP per hour. */
const HOURLY_LIMIT = Number(process.env.APPMAKER_RATE_LIMIT) || 30;
/** Generations with the user's own key, which only need abuse protection. */
const BYOK_HOURLY_LIMIT = Number(process.env.APPMAKER_BYOK_RATE_LIMIT) || 300;

const MAX_PROMPT_CHARS = 8_000;
const MAX_FILES = 60;
const MAX_FILES_BYTES = 600_000;
const MAX_HISTORY_CHARS = 4_000;

interface GenerateRequest {
  prompt: string;
  files?: FileMap;
  listing?: Partial<StoreListing>;
  /** Imported website the app is based on. */
  site?: SiteSummary;
  /** Earlier turns as plain text, oldest first. */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Provider, model and optional user-supplied key. */
  ai?: Partial<AiChoice>;
}

function textStream(ai: ResolvedAi | null, produce: (write: (s: string) => void) => Promise<void>): Response {
  const providerName = ai ? getProvider(ai.provider)!.name : undefined;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        await produce(write);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") write(`\n<error>${aiErrorMessage(err, providerName)}</error>`);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Appmaker-Mode": ai ? "ai" : "demo",
      ...(ai ? { "X-Appmaker-Model": `${ai.provider}/${ai.model}` } : {}),
    },
  });
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
  if (body.site != null) {
    const site = body.site;
    if (typeof site !== "object" || Array.isArray(site) || typeof site.url !== "string" || !Array.isArray(site.pages)) {
      return "site is invalid";
    }
    if (JSON.stringify(site).length > 40_000) return "site content is too large";
  }
  if (body.ai != null) {
    const ai = body.ai;
    if (typeof ai !== "object" || Array.isArray(ai)) return "ai must be an object";
    for (const k of ["provider", "model", "apiKey", "baseURL"] as const) {
      if (ai[k] != null && (typeof ai[k] !== "string" || ai[k]!.length > 500)) return `ai.${k} is invalid`;
    }
    if (ai.apiFormat != null && ai.apiFormat !== "openai" && ai.apiFormat !== "anthropic") return "ai.apiFormat is invalid";
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

  let ai: ResolvedAi | null;
  try {
    ai = resolveAi(body.ai);
  } catch (e) {
    if (e instanceof AiConfigError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }

  if (!ai) {
    const text = demoResponse(prompt, isEdit, body.site);
    return textStream(null, async (write) => {
      // Stream in chunks so the demo feels like live generation. Chunk by
      // code point so emoji (surrogate pairs) are never split in half.
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i += 400) {
        write(chars.slice(i, i + 400).join(""));
        await new Promise((r) => setTimeout(r, 25));
      }
    });
  }

  const hourly = ai.usingServerKey ? HOURLY_LIMIT : BYOK_HOURLY_LIMIT;
  const limit = rateLimit(`${ai.usingServerKey ? "gen" : "byok"}:${clientIp(req)}`, hourly, 60 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: `You've reached the limit of ${hourly} generations per hour. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const history: { role: "user" | "assistant"; content: string }[] = (body.history ?? [])
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
  // The API requires the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length && history[history.length - 1].role === "user") history.pop();

  const resolved = ai;
  return textStream(resolved, async (write) => {
    const outcome = await streamGeneration({
      ai: resolved,
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: buildUserMessage(prompt, files, body.listing, body.site) }],
      signal: req.signal,
      write,
    });
    if (outcome === "refusal") {
      write("\n<error>The AI declined this request. Try rephrasing your app idea.</error>");
    } else if (outcome === "length") {
      write("\n<error>The app was too large to finish in one pass. Ask for a smaller first version, or choose a model with a larger output limit in AI settings.</error>");
    }
  });
}
