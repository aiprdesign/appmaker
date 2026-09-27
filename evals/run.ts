/**
 * Appmaker app-quality evaluation.
 *
 *   npm run eval                       # all 100 prompts, site default model
 *   npm run eval -- --count 10         # first 10 prompts
 *   npm run eval -- --provider openai --model gpt-5.5
 *   npm run eval -- --demo             # no API key: grades the demo apps (tests the harness)
 *
 * Writes evals/results/<timestamp>/report.md, report.json and a screenshot
 * of every app.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { getProvider, type ProviderId } from "../src/lib/ai/providers";
import { resolveAi, type ResolvedAi } from "../src/lib/ai/server";
import { runTurn, type AppState, type TurnStats } from "./generate";
import { gradeApp, type GradeResult } from "./grade";
import { EVAL_CASES, type EvalCase } from "./prompts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const demo = args.includes("--demo");
const count = Number(flag("count") ?? EVAL_CASES.length);
const only = flag("only");
const concurrency = Math.max(1, Number(flag("concurrency") ?? 3));

interface CaseResult {
  case: EvalCase;
  stats: TurnStats[];
  grade: GradeResult;
  followUpGrade?: GradeResult;
}

async function main() {
  let ai: ResolvedAi | null = null;
  if (!demo) {
    ai = resolveAi({ provider: flag("provider") as ProviderId | undefined, model: flag("model") });
    if (!ai) {
      console.error("No API key found. Add one to .env.local (e.g. ANTHROPIC_API_KEY=...) or run with --demo to test the harness.");
      process.exit(1);
    }
  }
  const label = ai ? `${getProvider(ai.provider)!.name} · ${ai.model}` : "demo mode (built-in starter apps)";
  const cases = (only ? EVAL_CASES.filter((c) => c.id === only) : EVAL_CASES).slice(0, count);
  const outDir = path.join("evals", "results", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(path.join(outDir, "screenshots"), { recursive: true });
  console.log(`Evaluating ${cases.length} apps with ${label}\n→ ${outDir}\n`);

  const browser = await chromium.launch();
  const results: CaseResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++];
      const empty: AppState = { files: {}, listing: {}, history: [] };
      const first = await runTurn(ai, browser, c.prompt, empty);
      const stats = [first.stats];
      const grade = await gradeApp(browser, first.state.files, first.state.listing);
      if (grade.screenshot) writeFileSync(path.join(outDir, "screenshots", `${c.id}.png`), grade.screenshot);
      let followUpGrade: GradeResult | undefined;
      if (c.followUp && ai && Object.keys(first.state.files).length) {
        const second = await runTurn(ai, browser, c.followUp, first.state);
        stats.push(second.stats);
        followUpGrade = await gradeApp(browser, second.state.files, second.state.listing);
        if (followUpGrade.screenshot) writeFileSync(path.join(outDir, "screenshots", `${c.id}-followup.png`), followUpGrade.screenshot);
      }
      results.push({ case: c, stats, grade, followUpGrade });
      const failed = grade.checks.filter((k) => !k.pass).map((k) => k.id);
      console.log(
        `${grade.shippable ? "✅" : "❌"} ${c.id} ${String(grade.score).padStart(3)}  ${c.prompt.slice(0, 60)}${failed.length ? `  [${failed.join(", ")}]` : ""}${
          followUpGrade ? `  → follow-up ${followUpGrade.score}` : ""
        }`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  await browser.close();

  results.sort((a, b) => a.case.id.localeCompare(b.case.id));
  const report = summarize(results, label);
  writeFileSync(path.join(outDir, "report.md"), report);
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      results.map((r) => ({ ...r, grade: { ...r.grade, screenshot: undefined }, followUpGrade: r.followUpGrade && { ...r.followUpGrade, screenshot: undefined } })),
      null,
      2,
    ),
  );
  console.log(`\n${report.split("\n## Every app")[0]}`);
  console.log(`Full report: ${path.join(outDir, "report.md")}`);
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

function summarize(results: CaseResult[], label: string): string {
  const n = results.length;
  const shippable = results.filter((r) => r.grade.shippable).length;
  const avg = Math.round(results.reduce((s, r) => s + r.grade.score, 0) / Math.max(n, 1));
  const firstClean = results.filter((r) => r.stats[0].firstPassClean).length;
  const repairs = results.reduce((s, r) => s + r.stats[0].repairs, 0);
  const genErrors = results.filter((r) => r.stats.some((s) => s.error));
  const secs = results.map((r) => r.stats[0].seconds).sort((a, b) => a - b);
  const follow = results.filter((r) => r.followUpGrade);

  const checkIds = [...new Set(results.flatMap((r) => r.grade.checks.map((c) => c.id)))];
  const checkRows = checkIds.map((id) => {
    const withCheck = results.filter((r) => r.grade.checks.some((c) => c.id === id));
    const passed = withCheck.filter((r) => r.grade.checks.find((c) => c.id === id)!.pass).length;
    const label = withCheck[0].grade.checks.find((c) => c.id === id)!.label;
    return `| ${label} | ${passed}/${withCheck.length} | ${pct(passed, withCheck.length)} |`;
  });
  const categories = [...new Set(results.map((r) => r.case.category))];
  const catRows = categories.map((cat) => {
    const rs = results.filter((r) => r.case.category === cat);
    return `| ${cat} | ${rs.length} | ${pct(rs.filter((r) => r.grade.shippable).length, rs.length)} | ${Math.round(rs.reduce((s, r) => s + r.grade.score, 0) / rs.length)} |`;
  });

  return `# Appmaker app-quality report

**Model:** ${label}
**Apps:** ${n} · **Date:** ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC

## Summary

| Metric | Result |
| --- | --- |
| Shippable apps (all critical checks pass, score ≥ 80) | **${shippable}/${n} (${pct(shippable, n)})** |
| Average quality score | **${avg}/100** |
| Clean on the first try (no automatic repair needed) | ${firstClean}/${n} (${pct(firstClean, n)}) |
| Automatic repairs used | ${repairs} (${(repairs / Math.max(n, 1)).toFixed(2)} per app) |
| Generation failures (API error, refusal, output limit) | ${genErrors.length} |
| Median generation time | ${secs.length ? `${Math.round(secs[Math.floor(secs.length / 2)])}s` : "–"} |
${follow.length ? `| Follow-up edits still shippable | ${follow.filter((r) => r.followUpGrade!.shippable).length}/${follow.length} |\n` : ""}
## Pass rate per check

| Check | Passed | Rate |
| --- | --- | --- |
${checkRows.join("\n")}

## By category

| Category | Apps | Shippable | Avg score |
| --- | --- | --- | --- |
${catRows.join("\n")}

## Every app

| App | Score | Shippable | Repairs | Failed checks |
| --- | --- | --- | --- | --- |
${results
  .map((r) => {
    const failed = r.grade.checks.filter((c) => !c.pass).map((c) => `${c.label}${c.detail ? ` (${c.detail.slice(0, 80)})` : ""}`);
    const err = r.stats.find((s) => s.error)?.error;
    return `| ${r.case.id}: ${r.case.prompt.slice(0, 50)} | ${r.grade.score}${r.followUpGrade ? ` → ${r.followUpGrade.score}` : ""} | ${r.grade.shippable ? "✅" : "❌"} | ${r.stats[0].repairs} | ${[...(err ? [`generation: ${err}`] : []), ...failed].join("; ").replace(/\|/g, "/") || "–"} |`;
  })
  .join("\n")}
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
