import Anthropic from "@anthropic-ai/sdk";
import { demoResponse } from "@/lib/demo";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/prompt";
import type { FileMap, StoreListing } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.APPMAKER_MODEL || "claude-opus-5";

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

export async function POST(req: Request) {
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
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

  const client = new Anthropic();
  const history: Anthropic.Beta.BetaMessageParam[] = (body.history ?? [])
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
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
