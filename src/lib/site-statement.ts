import type { FileMap } from "./types";

/**
 * The accessibility statement every redesigned website gets (accessibility.html),
 * in the shape W3C recommends: the goal (WCAG 2.2 level AA), what the site does,
 * the latest check and what it found, known limits, and how to report a problem.
 * It never claims full conformance from automated checks alone, which find only
 * part of the issues; the owner can update it after a manual review.
 */

export const STATEMENT_FILE = "accessibility.html";
const MARK = "<!-- appmaker:accessibility-statement -->";

export interface A11yReport {
  /** When the check ran (ms since 1970). */
  checkedAt: number;
  /** Each page and what axe-core (WCAG 2.2 A and AA rules) found on it; null when it couldn't be checked. */
  pages: { page: string; issues: { id: string; impact: string | null; help: string; count: number }[] | null }[];
}

export interface StatementInfo {
  siteName: string;
  email?: string;
  phone?: string;
  report?: A11yReport;
  /** Language of the site (the statement is in English; this is kept for the <html lang>). */
  lang?: string;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** What the latest check found, in plain words. */
export function conformanceText(report?: A11yReport): { status: string; detail: string } {
  if (!report || !report.pages.length) {
    return {
      status: "Partially conformant",
      detail:
        "This website has been designed and built to meet WCAG 2.2 at level AA, but it has not yet been fully tested. Until a complete review has been done, we describe it as partially conformant: some parts may not yet fully meet the standard.",
    };
  }
  const checked = report.pages.filter((p) => p.issues);
  const failing = checked.filter((p) => p.issues!.length);
  const issues = failing.reduce((n, p) => n + p.issues!.reduce((m, i) => m + i.count, 0), 0);
  const when = day(report.checkedAt);
  if (!failing.length) {
    return {
      status: "Partially conformant",
      detail: `On ${when}, automated checks of all ${checked.length} page${checked.length === 1 ? "" : "s"} against WCAG 2.2 level A and AA (with axe-core) found no failures. Automated tools can only detect some accessibility problems, so we describe the site as partially conformant until a manual review has confirmed full conformance.`,
    };
  }
  return {
    status: "Partially conformant",
    detail: `On ${when}, automated checks against WCAG 2.2 level A and AA (with axe-core) found ${issues} issue${issues === 1 ? "" : "s"} on ${failing.length} of ${checked.length} page${checked.length === 1 ? "" : "s"}. We are fixing them. Automated tools can only detect some accessibility problems, so a manual review is also planned.`,
  };
}

function statementBody(info: StatementInfo, today: number): string {
  const name = esc(info.siteName || "This website");
  const { status, detail } = conformanceText(info.report);
  const contact = [
    info.email && `<li>Email: <a href="mailto:${esc(info.email)}" class="underline underline-offset-4">${esc(info.email)}</a></li>`,
    info.phone && `<li>Phone: <a href="tel:${esc(info.phone.replace(/[^\d+]/g, ""))}" class="underline underline-offset-4">${esc(info.phone)}</a></li>`,
  ].filter(Boolean);
  return `
<article class="mx-auto max-w-3xl px-6 py-16 sm:py-24 space-y-10 text-lg leading-relaxed">
  <header class="space-y-4">
    <p class="text-sm font-semibold uppercase tracking-widest opacity-70">Accessibility</p>
    <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Accessibility statement</h1>
    <p>${name} wants everyone to be able to use this website, including people who use a screen reader, a keyboard, voice control or magnification, and people with low vision, colour blindness, hearing loss or cognitive differences.</p>
  </header>

  <section aria-labelledby="a11y-status" class="space-y-3">
    <h2 id="a11y-status" class="text-2xl font-semibold">Conformance status</h2>
    <p>The <a href="https://www.w3.org/TR/WCAG22/" class="underline underline-offset-4">Web Content Accessibility Guidelines (WCAG) 2.2</a> describe how to make websites accessible. This website aims to meet <strong>WCAG 2.2 level AA</strong>.</p>
    <p><strong>Status: ${status}.</strong> ${esc(detail)}</p>
  </section>

  <section aria-labelledby="a11y-measures" class="space-y-3">
    <h2 id="a11y-measures" class="text-2xl font-semibold">What this website does</h2>
    <ul class="list-disc space-y-1 pl-6">
      <li>Every page can be used with a keyboard alone, with a visible focus outline and a "Skip to content" link.</li>
      <li>Pages have a clear structure: one main heading, headings in order, and labelled regions (header, navigation, main content, footer).</li>
      <li>Text and controls meet WCAG AA colour contrast, and nothing relies on colour alone.</li>
      <li>Text can be enlarged to 200% and the layout adapts to small screens without scrolling sideways.</li>
      <li>Images have text alternatives; decorative images are hidden from screen readers.</li>
      <li>Form fields have visible labels, and errors are explained in text.</li>
      <li>Buttons and links are large enough to tap (at least 24 by 24 pixels).</li>
      <li>Animations respect the "reduce motion" setting, moving content can be paused, and videos never play with sound by themselves.</li>
      <li>An accessibility settings button on every page lets you enlarge text, increase contrast, highlight links, use a readable font and stop animations.</li>
    </ul>
  </section>

  <section aria-labelledby="a11y-limits" class="space-y-3">
    <h2 id="a11y-limits" class="text-2xl font-semibold">Known limitations</h2>
    <ul class="list-disc space-y-1 pl-6">
      <li>Embedded content from other services, such as videos, maps and social media posts, is provided by those services and may not fully meet WCAG 2.2. Where possible, the same information is also given as text on the page.</li>
      <li>Some older documents or images taken from our previous website may not be fully accessible. Contact us and we will provide the information in another format.</li>
    </ul>
  </section>

  <section aria-labelledby="a11y-feedback" class="space-y-3">
    <h2 id="a11y-feedback" class="text-2xl font-semibold">Feedback and contact</h2>
    <p>If you find a part of this website hard to use, or need information in a different format, please tell us. We aim to reply within 5 working days.</p>
    ${contact.length ? `<ul class="list-disc space-y-1 pl-6">${contact.join("")}</ul>` : "<p>Please use the contact details on our contact page.</p>"}
  </section>

  <section aria-labelledby="a11y-technical" class="space-y-3">
    <h2 id="a11y-technical" class="text-2xl font-semibold">Technical information</h2>
    <p>This website is built with HTML, CSS and JavaScript, and is designed to work with current versions of major browsers and assistive technologies. It was checked with automated testing (axe-core, WCAG 2.2 A and AA rules) and by following an accessibility checklist during design.</p>
  </section>

  <p class="text-base opacity-75">This statement was prepared on ${day(today)}${info.report ? ` and last updated after the check on ${day(info.report.checkedAt)}` : ""}.</p>
</article>`;
}

/** A complete page: the site's own head, header and footer from index.html, with the statement as its main content. */
export function statementPage(files: FileMap, info: StatementInfo, today = Date.now()): string {
  const home = files["index.html"] ?? "";
  const body = statementBody(info, today);
  const main = /<main\b[^>]*>[\s\S]*<\/main>/i.exec(home);
  const title = `Accessibility statement · ${esc(info.siteName || "Website")}`;
  const description = `How ${esc(info.siteName || "this website")} meets WCAG 2.2 level AA, and how to report an accessibility problem.`;
  if (main) {
    let page = home.slice(0, main.index) + `<main id="main">${body}\n</main>` + home.slice(main.index + main[0].length);
    page = page
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
      .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`)
      .replace(/<link\s+rel=["']canonical["'][^>]*>/i, "")
      .replace(/\saria-current=["']page["']/gi, "");
    return page.includes(MARK) ? page : page.replace(/<html/i, `${MARK}\n<html`);
  }
  return `${MARK}
<!doctype html>
<html lang="${esc(info.lang || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-neutral-900">
<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>
<header class="border-b px-6 py-4"><a href="index.html" class="font-semibold">${esc(info.siteName || "Home")}</a></header>
<main id="main">${body}
</main>
<footer class="border-t px-6 py-8 text-sm"><a href="index.html" class="underline underline-offset-4">Back to the home page</a></footer>
</body>
</html>`;
}

/**
 * Adds or refreshes the statement (unless the owner replaced it with their own),
 * and links it from every page's footer.
 */
export function withStatement(files: FileMap, info: StatementInfo, today = Date.now()): FileMap {
  if (files["index.html"] == null) return files;
  const out: FileMap = { ...files };
  const existing = files[STATEMENT_FILE];
  if (existing == null || existing.includes(MARK)) out[STATEMENT_FILE] = statementPage(files, info, today);
  for (const [path, code] of Object.entries(out)) {
    if (!path.endsWith(".html") || path === STATEMENT_FILE || /href=["'](\.\.\/)?accessibility\.html["']/i.test(code) || !/<\/footer>/i.test(code)) continue;
    const href = path.includes("/") ? "../accessibility.html" : STATEMENT_FILE;
    out[path] = code.replace(/<\/footer>(?![\s\S]*<\/footer>)/i, `<p class="mt-4 text-sm"><a href="${href}" class="inline-block min-h-6 py-1 underline underline-offset-4">Accessibility statement</a></p>\n</footer>`);
  }
  return out;
}
