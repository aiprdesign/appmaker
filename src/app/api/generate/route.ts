import { getProvider, type AiChoice } from "@/lib/ai/providers";
import { aiErrorMessage, AiConfigError, canSeeImages, resolveAi, streamGeneration, type ResolvedAi } from "@/lib/ai/server";
import { demoResponse } from "@/lib/demo";
import { buildUserMessage, systemPrompt } from "@/lib/prompt";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { APP_MAX_BYTES, APP_MAX_FILES, isAllowedPath } from "@/lib/validate";
import { charge, CreditsError, creditsResponse, refund } from "@/lib/server/credits";
import { unexpectedErrorResponse } from "@/lib/server/errors";
import { ALIVE_EVERY_MS, ALIVE_MARK, THINKING_MARK } from "@/lib/progress";
import type { FileMap, SiteSummary, StoreListing } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** AI generations on the site owner's keys allowed per client IP per hour. */
const HOURLY_LIMIT = Number(process.env.APPMAKER_RATE_LIMIT) || 30;
/** Generations with the user's own key, which only need abuse protection. */
const BYOK_HOURLY_LIMIT = Number(process.env.APPMAKER_BYOK_RATE_LIMIT) || 300;

const MAX_PROMPT_CHARS = 8_000;
const MAX_FILES = APP_MAX_FILES;
const MAX_FILES_BYTES = APP_MAX_BYTES;
const MAX_HISTORY_CHARS = 4_000;
/** Screenshots for "Polish design": a couple of screens, JPEG or PNG. */
const MAX_IMAGES = 2;
const MAX_IMAGE_CHARS = 4_000_000;

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
  /** "claim-safe" (default) keeps app text free of marketing claims. */
  wording?: "claim-safe" | "standard";
  /** Sent by the builder's automatic quality fixes (free within a limit when credits are on). */
  auto?: boolean;
  /** Screenshots of the app (data URLs) for the AI to look at, used by "Polish design". */
  images?: string[];
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
  if (body.wording != null && body.wording !== "claim-safe" && body.wording !== "standard") return "wording must be claim-safe or standard";
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
  if (body.images != null) {
    if (!Array.isArray(body.images) || body.images.length > MAX_IMAGES) return `images must be an array of at most ${MAX_IMAGES} screenshots`;
    for (const img of body.images) {
      if (typeof img !== "string" || !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(img)) return "images must be JPEG or PNG data URLs";
      if (img.length > MAX_IMAGE_CHARS) return "The screenshot is too large to send. Try Polish design on a simpler screen.";
    }
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
  try {
    return await generate(req);
  } catch (e) {
    return unexpectedErrorResponse(e, "start building your app");
  }
}

async function generate(req: Request): Promise<Response> {
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

  const images = body.images?.length ? body.images : undefined;
  if (images && !canSeeImages(ai)) {
    return Response.json({ error: "This model can't look at screenshots. Choose another model in AI settings." }, { status: 400 });
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

  // Credits (when the site takes payments): only for the site's own AI key.
  let paid: { userId: string | null; charged: boolean } = { userId: null, charged: false };
  // A new app costs more than a change: the AI writes the whole app.
  const kind = isEdit ? "edit" : "newApp";
  if (ai.usingServerKey) {
    try {
      paid = await charge(req, kind, { auto: body.auto === true, reason: isEdit ? "AI edit" : "New app" });
    } catch (e) {
      if (e instanceof CreditsError) return creditsResponse(e);
      throw e;
    }
  }

  const resolved = ai;
  return textStream(resolved, async (write) => {
    let wrote = false;
    // Whether the reply changed the app; a reply that only asks a question costs nothing.
    let madeFiles = false;
    let tail = "";
    let lastThought = 0;
    // Keep the connection alive (and show the page we're still here) while the AI is quiet.
    const alive = setInterval(() => {
      try {
        write(ALIVE_MARK);
      } catch {
        clearInterval(alive);
      }
    }, ALIVE_EVERY_MS);
    let outcome: Awaited<ReturnType<typeof streamGeneration>>;
    try {
      outcome = await streamGeneration({
        ai: resolved,
        system: systemPrompt(body.wording === "standard" ? "standard" : "claim-safe"),
        messages: [...history, { role: "user", content: buildUserMessage(prompt, files, body.listing, body.site) }],
        signal: req.signal,
        images,
        // A tiny "still thinking" signal at most every 1.5s, so the page can show the AI is busy.
        onThinking: () => {
          const now = Date.now();
          if (now - lastThought < 1500) return;
          lastThought = now;
          write(THINKING_MARK);
        },
        write: (t) => {
          wrote = true;
          if (!madeFiles) {
            tail = (tail + t).slice(-(t.length + 16));
            madeFiles = /<(?:file|delete)\s/.test(tail);
          }
          write(t);
        },
      });
    } catch (e) {
      // Nothing was written: give the credit back.
      if (!wrote && paid.charged && paid.userId) await refund(paid.userId, kind, "Refund: the AI didn't answer").catch(() => {});
      throw e;
    } finally {
      clearInterval(alive);
    }
    if (outcome === "done" && !madeFiles && paid.charged && paid.userId) {
      await refund(paid.userId, kind, "Refund: the AI asked a question").catch(() => {});
    }
    if (outcome === "refusal") {
      write("\n<error>The AI declined this request. Try rephrasing your app idea.</error>");
    } else if (outcome === "length") {
      write("\n<error>The app was too large to finish in one pass. Ask for a smaller first version, or choose a model with a larger output limit in AI settings.</error>");
    }
  });
}
