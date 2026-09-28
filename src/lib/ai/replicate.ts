/**
 * Replicate connector. Replicate runs thousands of community models behind
 * one API that is not OpenAI-compatible: you create a "prediction" for a
 * model, then read its output from a server-sent-events stream.
 *
 * Model inputs differ per model, so the conversation is sent as a single
 * `prompt` (with `system_prompt` and `max_tokens`, which most language models
 * accept); if a model rejects those extras we retry with the prompt alone.
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

export async function streamReplicate(o: Options): Promise<"done" | "length" | "refusal"> {
  const prompt = buildPrompt(o.messages);
  let res = await createPrediction(o, { prompt, system_prompt: o.system, max_tokens: o.maxTokens ?? 16000 });
  if (res.status === 422) {
    // This model doesn't take system_prompt/max_tokens: fold the system prompt in.
    res = await createPrediction(o, { prompt: `${o.system}\n\n${prompt}` });
  }
  if (!res.ok) await fail(res);
  const prediction = (await res.json()) as { urls?: { stream?: string }; error?: string };
  const streamUrl = prediction.urls?.stream;
  if (!streamUrl) throw new ProviderHttpError(prediction.error || "This Replicate model doesn't support streaming.", 400);

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
      if (event === "output") o.write(payload);
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
