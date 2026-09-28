import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as generate } from "@/app/api/generate/route";
import { POST as models } from "@/app/api/ai/models/route";
import { KNOWN_ENDPOINTS, PROVIDERS, detectApiFormat, detectProviderFromKey, isValidModelId, normalizeBaseURL } from "@/lib/ai/providers";
import { AiConfigError, aiErrorMessage, listModels, resolveAi, serverConfig, streamGeneration } from "@/lib/ai/server";
import { makeSafeLookup } from "@/lib/net-guard";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "APPMAKER_DEMO",
  "APPMAKER_PROVIDER",
  "APPMAKER_MODEL",
  "APPMAKER_ALLOW_CUSTOM_ENDPOINTS",
  "APPMAKER_ALLOW_PRIVATE_ENDPOINTS",
  "APPMAKER_DISABLE_CUSTOM_ENDPOINTS",
  "CUSTOM_AI_BASE_URL",
  "CUSTOM_AI_API_KEY",
];
const saved: Record<string, string | undefined> = {};
beforeAll(() => ENV_KEYS.forEach((k) => (saved[k] = process.env[k])));
afterEach(() => ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));
const clearKeys = () => ENV_KEYS.forEach((k) => delete process.env[k]);

// --- Fake provider servers -------------------------------------------------

interface Captured {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}
let captured: Captured[] = [];
let mode: "ok" | "length" | "unauthorized" = "ok";

const sse = (res: http.ServerResponse, events: [string | null, unknown][]) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const [event, data] of events) res.write(`${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
  res.end();
};

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    captured.push({ path: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : {} });
    if (mode === "unauthorized") {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    }
    // Anthropic Messages API
    if (req.url!.startsWith("/v1/messages")) {
      const text = "<plan>Hi</plan>";
      return sse(res, [
        ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: mode === "length" ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    }
    if (req.url!.startsWith("/v1/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      const data = req.headers["x-api-key"]
        ? [{ type: "model", id: "claude-opus-5", display_name: "Claude Opus 5", created_at: "2026-01-01T00:00:00Z" }]
        : [{ id: "llama3" }, { id: "text-embedding-3" }, { id: "models/gemini-x" }].map((m) => ({ ...m, object: "model", created: 0, owned_by: "x" }));
      return res.end(JSON.stringify({ data, object: "list", has_more: false, first_id: null, last_id: null }));
    }
    // OpenAI-compatible chat completions
    if (req.url!.includes("/chat/completions")) {
      const chunk = (content: string | null, finish: string | null) => ({
        id: "c1",
        object: "chat.completion.chunk",
        created: 0,
        model: "m",
        choices: [{ index: 0, delta: content == null ? {} : { content }, finish_reason: finish }],
      });
      return sse(res, [
        [null, chunk("<plan>", null)],
        [null, chunk("Hello</plan>", null)],
        [null, chunk(null, mode === "length" ? "length" : "stop")],
        [null, "[DONE]"],
      ]);
    }
    res.writeHead(404).end();
  });
});
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
afterEach(() => {
  captured = [];
  mode = "ok";
});

const run = async (ai: NonNullable<ReturnType<typeof resolveAi>>) => {
  let out = "";
  const outcome = await streamGeneration({
    ai,
    system: "SYS",
    messages: [{ role: "user", content: "build it" }],
    signal: new AbortController().signal,
    write: (t) => (out += t),
  });
  return { out, outcome };
};

// --- Tests -------------------------------------------------------------------

describe("provider registry", () => {
  it("has unique ids and valid suggested model ids", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) for (const m of p.models) expect(isValidModelId(m.id)).toBe(true);
  });
  it.each(["gpt-5.5", "openrouter/auto", "meta-llama/llama-3.3-70b-instruct:free", "llama3:8b"])("accepts model id %s", (id) =>
    expect(isValidModelId(id)).toBe(true),
  );
  it.each(["", "a b", "../../x", "x\ny", "a".repeat(200)])("rejects model id %j", (id) => expect(isValidModelId(id)).toBe(false));
});

describe("resolveAi", () => {
  it("is demo mode when no key exists anywhere", () => {
    clearKeys();
    expect(resolveAi(undefined)).toBeNull();
    expect(resolveAi({ provider: "openai" })).toBeNull();
  });

  it("defaults to Claude Opus 5 on the server key", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "server-key";
    expect(resolveAi(undefined)).toMatchObject({ provider: "anthropic", model: "claude-opus-5", apiKey: "server-key", usingServerKey: true });
    expect(serverConfig().serverKeys).toEqual(["anthropic"]);
  });

  it("uses the user's own key and model", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "server-key";
    const ai = resolveAi({ provider: "openai", model: "gpt-5.5", apiKey: "user-key" });
    expect(ai).toMatchObject({ provider: "openai", model: "gpt-5.5", apiKey: "user-key", usingServerKey: false });
  });

  it("asks for a key when the chosen provider has none but others do", () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "server-key";
    expect(() => resolveAi({ provider: "openai" })).toThrow(AiConfigError);
  });

  it("honours APPMAKER_PROVIDER / APPMAKER_MODEL and picks a configured provider by default", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "k";
    expect(serverConfig()).toMatchObject({ defaultProvider: "openai", defaultModel: "gpt-5.5" });
    process.env.APPMAKER_PROVIDER = "openai";
    process.env.APPMAKER_MODEL = "gpt-5.4";
    expect(resolveAi(undefined)).toMatchObject({ provider: "openai", model: "gpt-5.4" });
  });

  it("rejects bad models and unknown providers", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(() => resolveAi({ model: "bad model" })).toThrow(AiConfigError);
    expect(() => resolveAi({ provider: "nope" as never })).toThrow(AiConfigError);
  });

  it("lets users connect any public https endpoint", () => {
    clearKeys();
    const ai = resolveAi({ provider: "custom", model: "qwen-max", apiKey: "user", baseURL: "https://llm.example.com/v1/", apiFormat: "anthropic" });
    // Anthropic-style clients add /v1 themselves, so it's trimmed from the address.
    expect(ai).toMatchObject({ provider: "custom", baseURL: "https://llm.example.com", apiKey: "user", apiFormat: "anthropic", guarded: true, usingServerKey: false });
    expect(resolveAi({ provider: "custom", model: "m", baseURL: "https://llm.example.com/v1" })).toMatchObject({ apiKey: "none", apiFormat: "openai" });
  });

  it.each([
    ["http://127.0.0.1:11434/v1", /private network/],
    ["http://localhost:11434/v1", /private network/],
    ["https://169.254.169.254/latest", /private network/],
    ["http://llm.example.com/v1", /https/],
    ["https://user:pw@llm.example.com/v1", /key field/],
    ["ftp://llm.example.com", /https/],
    ["not a url", /valid base URL/],
  ])("refuses unsafe endpoint %s", (baseURL, message) => {
    clearKeys();
    expect(() => resolveAi({ provider: "custom", model: "m", baseURL })).toThrow(message);
  });

  it("allows private endpoints only on self-hosted installs", () => {
    clearKeys();
    process.env.APPMAKER_ALLOW_PRIVATE_ENDPOINTS = "1";
    expect(resolveAi({ provider: "custom", model: "llama3", baseURL: "http://localhost:11434/v1" })).toMatchObject({ baseURL: "http://localhost:11434/v1" });
  });

  it("can be switched off by the site owner", () => {
    clearKeys();
    process.env.APPMAKER_DISABLE_CUSTOM_ENDPOINTS = "1";
    expect(() => resolveAi({ provider: "custom", model: "m", baseURL: "https://llm.example.com/v1" })).toThrow(/disabled/);
    expect(serverConfig().customEndpointsAllowed).toBe(false);
  });

  it("never sends the site owner's custom key to an address a user typed", () => {
    clearKeys();
    process.env.CUSTOM_AI_BASE_URL = "https://owner.example.com/v1";
    process.env.CUSTOM_AI_API_KEY = "owner-secret";
    expect(resolveAi({ provider: "custom", model: "m", baseURL: "https://attacker.example.com/v1" })).toMatchObject({ apiKey: "none" });
    expect(resolveAi({ provider: "custom", model: "m", baseURL: "https://owner.example.com/v1" })).toMatchObject({ apiKey: "owner-secret", usingServerKey: true });
    const owner = resolveAi({ provider: "custom", model: "m" })!;
    expect(owner).toMatchObject({ apiKey: "owner-secret", baseURL: "https://owner.example.com/v1" });
    // The owner's own endpoint is trusted configuration, so it isn't forced through the guard.
    expect(owner.guarded).toBeFalsy();
  });
});

describe("private-network guard", () => {
  it("blocks hostnames that resolve to private addresses", async () => {
    const lookup = makeSafeLookup(() => false);
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => lookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("EBLOCKED");
    const ok = await new Promise<NodeJS.ErrnoException | null>((resolve) => makeSafeLookup(() => true)("localhost", {}, (e) => resolve(e)));
    expect(ok).toBeNull();
  });
});

describe("streamGeneration", () => {
  it("streams from Claude with adaptive thinking, effort, caching and refusal fallbacks", async () => {
    clearKeys();
    process.env.ANTHROPIC_BASE_URL = base;
    const { out, outcome } = await run({ provider: "anthropic", model: "claude-opus-5", apiKey: "k", usingServerKey: true });
    expect(out).toBe("<plan>Hi</plan>");
    expect(outcome).toBe("done");
    const req = captured[0];
    expect(req.path).toMatch(/^\/v1\/messages/);
    expect(req.headers["x-api-key"]).toBe("k");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(req.body).toMatchObject({
      model: "claude-opus-5",
      max_tokens: 64000,
      stream: true,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      fallbacks: "default",
      system: [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }],
    });
  });

  it("omits thinking, effort and fallbacks on models that don't support them", async () => {
    process.env.ANTHROPIC_BASE_URL = base;
    await run({ provider: "anthropic", model: "claude-haiku-4-5", apiKey: "k", usingServerKey: true });
    expect(captured[0].body).not.toHaveProperty("thinking");
    expect(captured[0].body).not.toHaveProperty("output_config");
    expect(captured[0].body).not.toHaveProperty("fallbacks");
    expect(captured[0].headers["anthropic-beta"]).toBeUndefined();
    captured = [];
    await run({ provider: "anthropic", model: "claude-sonnet-5", apiKey: "k", usingServerKey: true });
    expect(captured[0].body).toMatchObject({ thinking: { type: "adaptive" } });
    expect(captured[0].body).not.toHaveProperty("fallbacks");
  });

  it("reports when Claude hits the output limit", async () => {
    process.env.ANTHROPIC_BASE_URL = base;
    mode = "length";
    expect((await run({ provider: "anthropic", model: "claude-opus-5", apiKey: "k", usingServerKey: true })).outcome).toBe("length");
  });

  it("streams from OpenAI-compatible providers", async () => {
    const { out, outcome } = await run({ provider: "deepseek", model: "deepseek-chat", apiKey: "user", baseURL: `${base}/v1`, usingServerKey: false });
    expect(out).toBe("<plan>Hello</plan>");
    expect(outcome).toBe("done");
    expect(captured[0].headers.authorization).toBe("Bearer user");
    expect(captured[0].body).toMatchObject({
      model: "deepseek-chat",
      stream: true,
      max_tokens: 8192,
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "build it" },
      ],
    });
    mode = "length";
    expect((await run({ provider: "openai", model: "gpt-5.5", apiKey: "u", baseURL: `${base}/v1`, usingServerKey: false })).outcome).toBe("length");
    expect(captured[1].body).not.toHaveProperty("max_tokens");
  });

  it("streams from a custom endpoint through the guarded connection, in both API formats", async () => {
    process.env.APPMAKER_ALLOW_PRIVATE_ENDPOINTS = "1";
    const openaiStyle = resolveAi({ provider: "custom", model: "my-model", apiKey: "u", baseURL: `${base}/v1` })!;
    expect(openaiStyle.guarded).toBe(true);
    expect(await run(openaiStyle)).toEqual({ out: "<plan>Hello</plan>", outcome: "done" });
    expect(captured.at(-1)!.path).toBe("/v1/chat/completions");

    const anthropicStyle = resolveAi({ provider: "custom", model: "claude-opus-5", apiKey: "u", baseURL: base, apiFormat: "anthropic" })!;
    expect(await run(anthropicStyle)).toEqual({ out: "<plan>Hi</plan>", outcome: "done" });
    const req = captured.at(-1)!;
    expect(req.path).toMatch(/^\/v1\/messages/);
    expect(req.headers["x-api-key"]).toBe("u");
    // Anthropic-only extras (refusal fallbacks beta) are not sent to third-party endpoints.
    expect(req.body).not.toHaveProperty("fallbacks");
    expect(await listModels(openaiStyle)).toEqual(["gemini-x", "llama3"]);
  });

  it("refuses a custom endpoint whose host resolves to a private address", async () => {
    const ai = { provider: "custom" as const, model: "m", apiKey: "u", baseURL: `http://localhost:${new URL(base).port}/v1`, usingServerKey: false, guarded: true };
    const err = await run(ai).catch((e) => e);
    expect(aiErrorMessage(err, "Custom")).toMatch(/private network/);
    expect(captured).toHaveLength(0);
  });

  it("turns provider errors into friendly messages", async () => {
    mode = "unauthorized";
    const err = await run({ provider: "openai", model: "gpt-5.5", apiKey: "bad", baseURL: `${base}/v1`, usingServerKey: false }).catch((e) => e);
    expect(aiErrorMessage(err, "OpenAI")).toMatch(/OpenAI rejected the API key/);
  });
});

describe("listModels", () => {
  it("lists Claude models", async () => {
    process.env.ANTHROPIC_BASE_URL = base;
    expect(await listModels({ provider: "anthropic", model: "x", apiKey: "k", usingServerKey: false })).toEqual(["claude-opus-5"]);
  });
  it("lists and filters OpenAI-compatible models", async () => {
    const ids = await listModels({ provider: "openrouter", model: "x", apiKey: "k", baseURL: `${base}/v1`, usingServerKey: false });
    expect(ids).toEqual(["gemini-x", "llama3"]);
  });
});

describe("API routes", () => {
  it("generate: uses demo mode with no keys, and asks for a key when needed", async () => {
    clearKeys();
    const call = (body: unknown) => generate(new Request("http://x/api/generate", { method: "POST", body: JSON.stringify(body) }));
    const demo = await call({ prompt: "habit tracker", ai: { provider: "openai", model: "gpt-5.5" } });
    expect(demo.headers.get("X-Appmaker-Mode")).toBe("demo");
    process.env.ANTHROPIC_API_KEY = "server";
    const res = await call({ prompt: "habit tracker", ai: { provider: "openai", model: "gpt-5.5" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Add your OpenAI API key/);
    expect((await call({ prompt: "x", ai: { provider: "openai", apiKey: 123 } })).status).toBe(400);
  });

  it("generate: streams a real (fake-server) Claude response end to end", async () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "server";
    process.env.ANTHROPIC_BASE_URL = base;
    const res = await generate(new Request("http://x/api/generate", { method: "POST", body: JSON.stringify({ prompt: "a habit tracker" }) }));
    expect(res.headers.get("X-Appmaker-Mode")).toBe("ai");
    expect(res.headers.get("X-Appmaker-Model")).toBe("anthropic/claude-opus-5");
    expect(await res.text()).toBe("<plan>Hi</plan>");
    const sent = captured[0].body as { messages: { role: string; content: string }[] };
    expect(sent.messages.at(-1)?.content).toContain("Build this app:\n\na habit tracker");
  });

  it("models: validates input", async () => {
    clearKeys();
    const call = (body: unknown) => models(new Request("http://x/api/ai/models", { method: "POST", body: JSON.stringify(body) }));
    expect((await call({ provider: "nope" })).status).toBe(400);
    expect((await call({ provider: "openai" })).status).toBe(400);
  });
});

describe("zero-effort setup helpers", () => {
  it.each([
    ["sk-ant-api03-abcdefghijk", "anthropic"],
    ["sk-or-v1-abcdefghijklmn", "openrouter"],
    ["sk-proj-abcdefghijklmnop", "openai"],
    ["r8_abcdefghijklmnopqrst", "replicate"],
    ["hf_abcdefghijklmnopqrst", "huggingface"],
    ["AIzaSyAbcdefghijklmnop", "gemini"],
    ["gsk_abcdefghijklmnopqrs", "groq"],
    ["xai-abcdefghijklmnopqrs", "xai"],
    ["pplx-abcdefghijklmnopqr", "perplexity"],
    ["nvapi-abcdefghijklmnopq", "nvidia"],
    ["fw_abcdefghijklmnopqrst", "fireworks"],
    ["csk-abcdefghijklmnopqrs", "cerebras"],
  ])("recognises %s as %s", (key, provider) => expect(detectProviderFromKey(key)).toBe(provider));

  it("leaves ambiguous or short keys alone", () => {
    expect(detectProviderFromKey("sk-abcdefghijklmnopqrst")).toBeNull();
    expect(detectProviderFromKey("sk-ant-")).toBeNull();
  });

  it.each([
    ["api.example.com", "openai", "https://api.example.com/v1"],
    ["https://api.example.com/", "openai", "https://api.example.com/v1"],
    ["https://api.example.com/v1/", "openai", "https://api.example.com/v1"],
    ["https://api.example.com/custom/path", "openai", "https://api.example.com/custom/path"],
    ["https://api.anthropic.com/v1", "anthropic", "https://api.anthropic.com"],
    ["https://gateway.example.com/anthropic", "anthropic", "https://gateway.example.com/anthropic"],
    ["localhost:11434", "openai", "https://localhost:11434/v1"],
  ])("normalizes %s (%s) to %s", (input, format, expected) =>
    expect(normalizeBaseURL(input, format as "openai" | "anthropic")).toBe(expected),
  );

  it("detects the API format of pasted addresses", () => {
    expect(detectApiFormat("https://api.anthropic.com/v1")).toBe("anthropic");
    expect(detectApiFormat("https://openrouter.ai/api/v1")).toBe("openai");
    expect(detectApiFormat("https://my-proxy.example.com/claude")).toBe("anthropic");
    expect(detectApiFormat("https://llm.example.com")).toBe("openai");
  });

  it("keeps known services' exact addresses", () => {
    expect(normalizeBaseURL("https://api.perplexity.ai", "openai")).toBe("https://api.perplexity.ai");
    expect(normalizeBaseURL("https://api.deepseek.com/", "openai")).toBe("https://api.deepseek.com");
  });

  it("offers valid, unique known endpoints", () => {
    const urls = KNOWN_ENDPOINTS.map((e) => e.baseURL);
    expect(new Set(urls).size).toBe(urls.length);
    for (const e of KNOWN_ENDPOINTS) {
      expect(() => new URL(e.baseURL)).not.toThrow();
      expect(normalizeBaseURL(e.baseURL, e.apiFormat)).toBe(e.baseURL);
    }
    expect(KNOWN_ENDPOINTS.filter((e) => e.local).map((e) => e.label).join()).toMatch(/Ollama/);
  });

  it("uses the normalized address when resolving a custom endpoint", () => {
    clearKeys();
    expect(resolveAi({ provider: "custom", model: "m", baseURL: "llm.example.com" })).toMatchObject({ baseURL: "https://llm.example.com/v1" });
    expect(resolveAi({ provider: "custom", model: "m", baseURL: "https://api.anthropic.com/v1", apiFormat: "anthropic" })).toMatchObject({
      baseURL: "https://api.anthropic.com",
    });
  });
});

describe("Replicate", () => {
  let replicate: http.Server;
  let rbase = "";
  const seen: { path: string; body: Record<string, unknown>; auth?: string }[] = [];
  beforeAll(async () => {
    replicate = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        seen.push({ path: req.url!, body, auth: req.headers.authorization });
        const input = body.input as Record<string, unknown> | undefined;
        if (req.url!.startsWith("/v1/models/strict/")) {
          if (input && "system_prompt" in input) return res.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ detail: "unexpected input" }));
        }
        if (req.url!.endsWith("/predictions")) {
          res.writeHead(201, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ id: "p1", urls: { stream: `${rbase}/stream/p1` } }));
        }
        if (req.url === "/stream/p1") {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          res.write("event: output\ndata: <plan>Hi\n\n");
          res.write("event: output\ndata: </plan>\n\n");
          res.write("event: output\ndata: line one\ndata: line two\n\n");
          return res.end("event: done\ndata: {}\n\n");
        }
        if (req.url === "/v1/collections/language-models") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ models: [{ owner: "meta", name: "llama" }, { owner: "acme", name: "chat" }] }));
        }
        res.writeHead(404).end();
      });
    });
    await new Promise<void>((r) => replicate.listen(0, "127.0.0.1", r));
    rbase = `http://127.0.0.1:${(replicate.address() as AddressInfo).port}`;
  });
  afterAll(() => replicate.close());

  const replicateAi = (model: string) => ({ provider: "replicate" as const, model, apiKey: "r8_test", baseURL: `${rbase}/v1`, usingServerKey: false });

  it("streams a model's output through predictions + SSE", async () => {
    seen.length = 0;
    const { out, outcome } = await run(replicateAi("meta/meta-llama-3-70b-instruct"));
    expect(outcome).toBe("done");
    expect(out).toBe("<plan>Hi</plan>line one\nline two");
    expect(seen[0].path).toBe("/v1/models/meta/meta-llama-3-70b-instruct/predictions");
    expect(seen[0].auth).toBe("Bearer r8_test");
    expect(seen[0].body).toMatchObject({ stream: true, input: { system_prompt: "SYS", max_tokens: 16000 } });
    expect((seen[0].body.input as { prompt: string }).prompt).toMatch(/User: build it\n\nAssistant:$/);
  });

  it("retries with a plain prompt when a model rejects extra inputs", async () => {
    seen.length = 0;
    const { out } = await run(replicateAi("strict/model"));
    expect(out).toContain("<plan>Hi</plan>");
    const retry = seen.filter((r) => r.path.endsWith("/predictions"))[1].body.input as Record<string, unknown>;
    expect(Object.keys(retry)).toEqual(["prompt"]);
    expect(retry.prompt).toMatch(/^SYS\n\nUser: build it/);
  });

  it("supports pinned versions and lists language models", async () => {
    seen.length = 0;
    await run(replicateAi("acme/chat:abc123"));
    expect(seen[0].path).toBe("/v1/predictions");
    expect(seen[0].body).toMatchObject({ version: "abc123" });
    expect(await listModels(replicateAi("x"))).toEqual(["acme/chat", "meta/llama"]);
  });

  it("uses the site's REPLICATE_API_TOKEN", () => {
    clearKeys();
    process.env.REPLICATE_API_TOKEN = "r8_server";
    expect(resolveAi({ provider: "replicate", model: "meta/meta-llama-3-70b-instruct" })).toMatchObject({ apiKey: "r8_server", usingServerKey: true });
    delete process.env.REPLICATE_API_TOKEN;
  });
});
