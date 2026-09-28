/**
 * Replicate connector. Replicate runs thousands of community models behind
 * one API that is not OpenAI-compatible: you create a "prediction" for a
 * model, then read its output from a server-sent-events stream.
 *
 * Model inputs differ per model, so the model's input schema decides how the
 * conversation is sent (chat `messages`, or a `prompt` with or without
 * `system_prompt`); if a model rejects or fails on that shape before writing
 * anything, simpler shapes are tried.
 */

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Msg = { role: "user" | "assistant"; content: string };

export function buildPrompt(messages: Msg[]): string {
  return `${messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}\n\nAssistant:`;
}

async function fail(res: Response): Promise<never> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body.detail || body.title || JSON.stringify(body);
  } catch {
    detail = res.statusText;
  }
  throw new ProviderHttpError(detail, res.status);
}

interface Options {
  apiKey: string;
  baseURL: string;
  model: string;
  system: string;
  messages: Msg[];
  signal: AbortSignal;
  write: (text: string) => void;
  maxTokens?: number;
}

async function createPrediction(o: Options, input: Record<string, unknown>) {
  const [name, version] = o.model.split(":");
  const url = version ? `${o.baseURL}/predictions` : `${o.baseURL}/models/${name}/predictions`;
  return fetch(url, {
    method: "POST",
    signal: o.signal,
    headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...(version ? { version } : {}), input, stream: true }),
  });
}

type SchemaProps = Record<string, { type?: string; maximum?: number }>;

const schemaCache = new Map<string, { props: SchemaProps | null; at: number }>();

/** The model's input fields, from its OpenAPI schema on Replicate (cached for an hour). */
async function inputSchema(o: Options): Promise<SchemaProps | null> {
  const key = `${o.baseURL}|${o.model}`;
  const hit = schemaCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.props;
  const [name, version] = o.model.split(":");
  let props: SchemaProps | null = null;
  try {
    const res = await fetch(`${o.baseURL}/models/${name}${version ? `/versions/${version}` : ""}`, {
      signal: o.signal,
      headers: { Authorization: `Bearer ${o.apiKey}` },
    });
    if (res.ok) {
      const body = (await res.json()) as {
        openapi_schema?: Schema;
        latest_version?: { openapi_schema?: Schema };
      };
      props = (version ? body.openapi_schema : body.latest_version?.openapi_schema)?.components?.schemas?.Input?.properties ?? null;
    }
  } catch (e) {
    if (o.signal.aborted) throw e;
  }
  schemaCache.set(key, { props, at: Date.now() });
  return props;
}
type Schema = { components?: { schemas?: { Input?: { properties?: SchemaProps } } } };

const TOKEN_FIELDS = ["max_tokens", "max_new_tokens", "max_completion_tokens", "max_length"];

/**
 * Inputs to try, best first. Models name their inputs differently (some take
 * chat `messages`, some a `prompt` with or without `system_prompt`), so the
 * model's own schema decides when Replicate has it; plain prompts follow as
 * fallbacks for models that fail on the first shape.
 */
export function replicateInputs(props: SchemaProps | null, system: string, messages: Msg[], maxTokens = 16000): Record<string, unknown>[] {
  const prompt = buildPrompt(messages);
  const folded = `${system}\n\n${prompt}`;
  const list: Record<string, unknown>[] = [];
  if (props) {
    const input: Record<string, unknown> = {};
    if (props.messages) {
      const chat = [{ role: "system", content: system }, ...messages];
      input.messages = props.messages.type === "string" ? JSON.stringify(chat) : chat;
    } else if (props.prompt) {
      if (props.system_prompt) Object.assign(input, { prompt, system_prompt: system });
      else input.prompt = folded;
    }
    const tokens = TOKEN_FIELDS.find((f) => props[f]);
    if (Object.keys(input).length && tokens) input[tokens] = Math.min(maxTokens, props[tokens].maximum ?? maxTokens);
    if (Object.keys(input).length) list.push(input);
  }
  list.push({ prompt, system_prompt: system, max_tokens: maxTokens }, { prompt: folded });
  const seen = new Set<string>();
  return list.filter((i) => !seen.has(JSON.stringify(i)) && seen.add(JSON.stringify(i)));
}

export async function streamReplicate(o: Options): Promise<"done" | "length" | "refusal"> {
  const inputs = replicateInputs(await inputSchema(o), o.system, o.messages, o.maxTokens ?? 16000);
  for (let i = 0; ; i++) {
    const last = i === inputs.length - 1;
    const res = await createPrediction(o, inputs[i]);
    // 422: the model rejected these input fields; try the next shape.
    if (res.status === 422 && !last) continue;
    if (!res.ok) await fail(res);
    const prediction = (await res.json()) as { urls?: { stream?: string }; error?: string };
    const streamUrl = prediction.urls?.stream;
    if (!streamUrl) {
      if (prediction.error && !last) continue;
      throw new ProviderHttpError(prediction.error || "This Replicate model doesn't support streaming.", 400);
    }
    let wrote = false;
    try {
      return await readStream(o, streamUrl, (text) => {
        wrote = true;
        o.write(text);
      });
    } catch (e) {
      // The model failed before writing anything (often an input it can't
      // handle): try the next input shape rather than giving up.
      if (e instanceof ProviderHttpError && e.status === 502 && !wrote && !last && !o.signal.aborted) continue;
      throw e;
    }
  }
}

async function readStream(o: Options, streamUrl: string, write: (text: string) => void): Promise<"done"> {
  const stream = await fetch(streamUrl, {
    signal: o.signal,
    headers: { Accept: "text/event-stream", "Cache-Control": "no-store", Authorization: `Bearer ${o.apiKey}` },
  });
  if (!stream.ok || !stream.body) await fail(stream);

  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return "done";
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
      }
      const payload = data.join("\n");
      if (event === "output") write(payload);
      else if (event === "error") {
        let message = payload;
        try {
          message = JSON.parse(payload).detail ?? payload;
        } catch {
          // plain-text error
        }
        throw new ProviderHttpError(message || "The model failed.", 502);
      } else if (event === "done") {
        await reader.cancel().catch(() => {});
        return "done";
      }
    }
  }
}

/** Language models from Replicate's curated collection. */
export async function listReplicateModels(apiKey: string, baseURL: string): Promise<string[]> {
  const res = await fetch(`${baseURL}/collections/language-models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) await fail(res);
  const body = (await res.json()) as { models?: { owner: string; name: string }[] };
  return (body.models ?? []).map((m) => `${m.owner}/${m.name}`).sort();
}
