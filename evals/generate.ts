import type { Browser } from "@playwright/test";
import type { ResolvedAi } from "../src/lib/ai/server";
import { streamGeneration } from "../src/lib/ai/server";
import { demoResponse } from "../src/lib/demo";
import { parseGeneration } from "../src/lib/parse";
import { SYSTEM_PROMPT, buildUserMessage } from "../src/lib/prompt";
import type { FileMap, StoreListing } from "../src/lib/types";
import { describeIssues, isAllowedPath, validateApp } from "../src/lib/validate";
import { loadError } from "./grade";

/**
 * Runs one request exactly like the builder does: generate, then up to two
 * automatic repair passes for static issues or a crash on load.
 */
export interface AppState {
  files: FileMap;
  listing: Partial<StoreListing>;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface TurnStats {
  firstPassClean: boolean;
  repairs: number;
  seconds: number;
  outputChars: number;
  error?: string;
}

const AUTO_FIX_BUDGET = 2;

async function once(ai: ResolvedAi | null, prompt: string, state: AppState): Promise<{ text: string; error?: string }> {
  if (!ai) return { text: demoResponse(prompt, Object.keys(state.files).length > 0) };
  let text = "";
  try {
    const outcome = await streamGeneration({
      ai,
      system: SYSTEM_PROMPT,
      messages: [
        ...state.history.slice(-8),
        { role: "user", content: buildUserMessage(prompt, state.files, Object.keys(state.files).length ? state.listing : undefined) },
      ],
      signal: AbortSignal.timeout(15 * 60 * 1000),
      write: (t) => (text += t),
    });
    if (outcome !== "done") return { text, error: outcome === "length" ? "output limit reached" : "model refused" };
  } catch (e) {
    return { text, error: (e as Error).message };
  }
  return { text };
}

function apply(state: AppState, text: string, prompt: string): { state: AppState; rejected: string[] } {
  const parsed = parseGeneration(text);
  const files = { ...state.files };
  const rejected: string[] = [];
  for (const [p, code] of Object.entries(parsed.files)) {
    if (p === parsed.writing) continue;
    if (isAllowedPath(p)) files[p] = code;
    else rejected.push(`- ${p}: was ignored; only App.js and files under src/ are allowed`);
  }
  for (const p of parsed.deleted) if (isAllowedPath(p)) delete files[p];
  return {
    state: {
      files,
      listing: parsed.listing ? { ...state.listing, ...parsed.listing } : state.listing,
      history: [...state.history, { role: "user", content: prompt }, { role: "assistant", content: parsed.summary || parsed.plan }],
    },
    rejected,
  };
}

export async function runTurn(ai: ResolvedAi | null, browser: Browser, prompt: string, start: AppState): Promise<{ state: AppState; stats: TurnStats }> {
  const t0 = Date.now();
  let state = start;
  let request = prompt;
  let repairs = 0;
  let firstPassClean = false;
  let outputChars = 0;
  for (let attempt = 0; attempt <= AUTO_FIX_BUDGET; attempt++) {
    const { text, error } = await once(ai, request, state);
    outputChars += text.length;
    if (error && !text) return { state, stats: { firstPassClean, repairs, seconds: (Date.now() - t0) / 1000, outputChars, error } };
    const applied = apply(state, text, request);
    state = applied.state;
    if (error) return { state, stats: { firstPassClean, repairs, seconds: (Date.now() - t0) / 1000, outputChars, error } };

    const issues = validateApp(state.files);
    const problems = [...applied.rejected, ...(issues.length ? [describeIssues(issues)] : [])];
    let fix = problems.length
      ? `Automatic quality check found problems:\n${problems.join("\n")}\n\nFix all of them.`
      : "";
    if (!fix) {
      const crash = await loadError(browser, state.files);
      if (crash) fix = `Automatic quality check: the app crashed in the preview with this error:\n\n${crash}\n\nFind the root cause and fix it.`;
    }
    if (attempt === 0) firstPassClean = !fix;
    if (!fix || !ai || attempt === AUTO_FIX_BUDGET) break;
    repairs++;
    request = fix;
  }
  return { state, stats: { firstPassClean, repairs, seconds: (Date.now() - t0) / 1000, outputChars } };
}
