import { readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { buildPreviewHtml } from "../src/lib/preview";
import type { FileMap, StoreListing } from "../src/lib/types";
import { validateApp } from "../src/lib/validate";

/**
 * Grades a generated app the way a user and an App Store reviewer would:
 * it loads the app on a 390×844 phone screen, taps through it, types into it,
 * reopens it, and inspects layout, readability and the store listing.
 */

const ORIGIN = "http://appmaker.test";
const PREVIEW_DIR = path.join(process.cwd(), "public", "preview");

export interface Check {
  id: string;
  label: string;
  pass: boolean;
  /** Critical checks must pass for the app to count as shippable. */
  critical: boolean;
  weight: number;
  detail?: string;
}

export interface GradeResult {
  score: number;
  shippable: boolean;
  checks: Check[];
  screensVisited: number;
  tapsTried: number;
  errors: string[];
  screenshot?: Buffer;
}

/** tsx/esbuild wraps functions passed to page.evaluate in a `__name` helper. */
const SHIM = "window.__name = (fn) => fn;";

const PLACEHOLDER = /lorem ipsum|placeholder text|\bTODO\b|\bFIXME\b|coming soon|\bfoo\b|\bbar\b baz/i;

async function openApp(page: Page, files: FileMap) {
  const html = buildPreviewHtml(files, ORIGIN, "ios");
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/preview/")) {
      const file = path.join(PREVIEW_DIR, path.basename(url.pathname));
      return route.fulfill({ body: readFileSync(file), contentType: "application/javascript" });
    }
    return route.fulfill({ body: html, contentType: "text/html" });
  });
  await page.goto(`${ORIGIN}/app`);
  await page.waitForTimeout(1200);
}

/** Everything a user can tap: outermost elements with a pointer cursor, plus inputs. */
async function tappables(page: Page) {
  return page.evaluate(() => {
    const out: { x: number; y: number; w: number; h: number; label: string; input: boolean }[] = [];
    const all = Array.from(document.querySelectorAll<HTMLElement>("#root *"));
    for (const el of all) {
      const style = getComputedStyle(el);
      const input = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      const pointer = style.cursor === "pointer" && getComputedStyle(el.parentElement!).cursor !== "pointer";
      if (!input && !pointer) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || r.bottom < 0 || r.top > window.innerHeight) continue;
      out.push({ x: r.x, y: r.y, w: r.width, h: r.height, label: (el.innerText || el.getAttribute("placeholder") || "").trim().slice(0, 40), input });
    }
    return out;
  });
}

/** Layout and readability measurements of the current screen. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el: Element | null): { r: number; g: number; b: number } => {
      while (el) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c.a > 0.5) return c;
        el = el.parentElement;
      }
      return { r: 255, g: 255, b: 255 };
    };
    const vw = window.innerWidth;
    let textEls = 0;
    let lowContrast = 0;
    let tinyText = 0;
    let overflow = 0;
    const lowSamples: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("#root *"))) {
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || Number(style.opacity) < 0.1) continue;
      // Content wider than the phone is cut off — unless it sits in a
      // sideways-scrolling area (a carousel), which is intentional.
      if (r.right > vw + 2 || r.left < -2) {
        let carousel = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if ((ps.overflowX === "auto" || ps.overflowX === "scroll") && ps.overflowY !== "auto" && ps.overflowY !== "scroll") {
            carousel = true;
            break;
          }
        }
        if (!carousel) overflow++;
      }
      if (!hasText) continue;
      const text = el.innerText.trim();
      // Emoji-only labels are icons; judge them by size, not contrast.
      if (!/[A-Za-z0-9]/.test(text)) continue;
      textEls++;
      const size = parseFloat(style.fontSize);
      if (size < 11) tinyText++;
      const fg = parse(style.color);
      const L1 = lum(fg);
      const L2 = lum(background(el));
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = size >= 18 || (size >= 14 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5) && fg.a > 0.3) {
        lowContrast++;
        if (lowSamples.length < 3) lowSamples.push(`"${text.slice(0, 24)}" ${ratio.toFixed(1)}:1`);
      }
    }
    return { textEls, lowContrast, tinyText, overflow, lowSamples, text: document.body.innerText };
  });
}

async function appErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __errors?: string[] }).__errors ?? []);
}

export async function gradeApp(browser: Browser, files: FileMap, listing: Partial<StoreListing>): Promise<GradeResult> {
  const checks: Check[] = [];
  const add = (id: string, label: string, pass: boolean, critical: boolean, weight: number, detail?: string) =>
    checks.push({ id, label, pass, critical, weight, detail });

  // 1. Static code checks (the same gate the builder uses).
  const issues = validateApp(files);
  add("code", "Code passes static checks", issues.length === 0, true, 10, issues.map((i) => `${i.file}: ${i.message}`).join("; "));
  const allCode = Object.values(files).join("\n");
  add("content", "No placeholder or lorem ipsum content", !PLACEHOLDER.test(allCode), false, 4);
  add("storage", "Saves user data (AsyncStorage)", allCode.includes("@react-native-async-storage/async-storage"), false, 4);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  await context.addInitScript({ content: SHIM });
  await context.addInitScript(() => {
    const w = window as unknown as { __errors: string[] };
    w.__errors = [];
    window.addEventListener("message", (e) => {
      if (e.data?.source === "appmaker-preview" && e.data.type === "error") w.__errors.push(e.data.message);
    });
    window.addEventListener("error", (e) => w.__errors.push(e.message));
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  let screenshot: Buffer | undefined;
  const screens = new Set<string>();
  let taps = 0;
  try {
    await openApp(page, files);
    errors.push(...(await appErrors(page)));
    const first = await measure(page);
    screenshot = await page.screenshot();
    const renders = errors.length === 0 && first.text.trim().length > 20;
    add("renders", "Opens without crashing and shows content", renders, true, 15, errors[0]);

    if (renders) {
      add("readable-contrast", "Text contrast meets WCAG AA", first.lowContrast <= Math.max(1, first.textEls * 0.05), false, 6, first.lowSamples.join(", "));
      add("readable-size", "No text smaller than 11pt", first.tinyText === 0, false, 3, first.tinyText ? `${first.tinyText} tiny labels` : undefined);
      add("fits-screen", "Layout fits the phone width", first.overflow === 0, false, 6, first.overflow ? `${first.overflow} elements overflow` : undefined);
      // The preview's own layout check: fills the screen, tab bar at the bottom.
      await page.waitForFunction(() => (window as unknown as { __layoutIssue?: string | null }).__layoutIssue !== undefined, null, { timeout: 5000 }).catch(() => {});
      const layout = await page.evaluate(() => (window as unknown as { __layoutIssue?: string | null }).__layoutIssue ?? null);
      add("fills-screen", "Fills the screen, with the tab bar at the bottom", !layout, false, 6, layout ?? undefined);

      const targets = await tappables(page);
      const buttons = targets.filter((t) => !t.input);
      const small = buttons.filter((t) => t.w < 40 || t.h < 40);
      add("interactive", "Has interactive controls", buttons.length >= 2, true, 5, `${buttons.length} controls`);
      add(
        "touch-targets",
        "Touch targets at least 44pt (≥90% of controls)",
        buttons.length > 0 && small.length <= buttons.length * 0.1,
        false,
        6,
        small.length ? `${small.length}/${buttons.length} small: ${small.slice(0, 3).map((s) => `"${s.label}" ${Math.round(s.w)}×${Math.round(s.h)}`).join(", ")}` : undefined,
      );

      // 2. Use the app like a curious person: fill in any form that appears
      // (skipping search boxes), prefer Add/Save-style buttons, and tap
      // every control at least once.
      const token = `Eval${Math.floor(Math.random() * 9000 + 1000)}`;
      let typed = 0;
      let tokenSeen = false;
      const fillInputs = async () => {
        const inputs = page.locator("#root input, #root textarea");
        const n = Math.min(await inputs.count(), 6);
        for (let i = 0; i < n; i++) {
          const input = inputs.nth(i);
          if (!(await input.isVisible().catch(() => false)) || (await input.inputValue().catch(() => "x"))) continue;
          const placeholder = ((await input.getAttribute("placeholder")) ?? "").toLowerCase();
          if (/search|filter|find/.test(placeholder)) continue;
          const numeric = /decimal|numeric|number|tel/.test((await input.getAttribute("inputmode")) ?? "") || /^\s*(\$|€|£)?\s*0([.,]0+)?\s*$|amount|price|qty|quantity|how many|minutes|\b(kg|lbs?|ml|oz)\b/.test(placeholder);
          await input.fill(numeric ? "42" : `${token} item`).catch(() => {});
          typed++;
        }
      };
      const PRIMARY = /\b(add|save|create|done|submit|log|start|new|ok|confirm)\b|^\+|➕/i;
      screens.add(first.text.slice(0, 400));
      const tried = new Set<string>();
      for (let round = 0; round < 40; round++) {
        await fillInputs();
        const current = (await tappables(page)).filter((t) => !t.input && !tried.has(`${t.label}|${Math.round(t.y / 10)}`));
        const next = (typed > 0 && current.find((t) => PRIMARY.test(t.label))) || current[0];
        if (!next) break;
        tried.add(`${next.label}|${Math.round(next.y / 10)}`);
        await page.mouse.click(next.x + next.w / 2, next.y + next.h / 2);
        taps++;
        await page.waitForTimeout(150);
        const errs = await appErrors(page);
        if (errs.length || errors.length) break;
        const text = await page.evaluate(() => document.body.innerText);
        if (text.includes(`${token} item`) && !(await page.locator("#root input, #root textarea").evaluateAll((els, t) => els.some((e) => (e as HTMLInputElement).value.includes(t)), token))) {
          tokenSeen = true;
        }
        screens.add(text.slice(0, 400));
      }
      errors.push(...(await appErrors(page)));
      add("taps", "Tapping every control never crashes", errors.length === 0, true, 15, errors[0] ? `after ${taps} taps: ${errors[0]}` : `${taps} taps`);
      add("navigation", "Reaches at least 3 distinct screens/states", screens.size >= 3, false, 6, `${screens.size} states`);

      // 3. Did typed content become part of the app, and survive reopening it?
      if (typed > 0) {
        add("adds", "Filling in a form and saving creates content", tokenSeen, false, 5, tokenSeen ? undefined : "typed text never appeared outside the input");
        if (tokenSeen) {
          await page.reload();
          await page.waitForTimeout(1200);
          // The item may live on another tab: look around a little.
          let found = (await page.evaluate(() => document.body.innerText)).includes(token);
          for (const t of found ? [] : (await tappables(page)).filter((x) => !x.input).slice(0, 10)) {
            await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
            await page.waitForTimeout(120);
            if ((await page.evaluate(() => document.body.innerText)).includes(token)) {
              found = true;
              break;
            }
          }
          add("persists", "Saved content survives reopening the app", found, false, 6);
        }
      }
    }
  } catch (e) {
    add("renders", "Opens without crashing and shows content", false, true, 15, (e as Error).message);
  } finally {
    await context.close();
  }

  // 4. Store listing (App Store Connect limits).
  const l = listing;
  const listingProblems = [
    !(l.name && l.name.length <= 30) && "name missing or over 30 chars",
    !(l.subtitle && l.subtitle.length <= 30) && "subtitle missing or over 30 chars",
    !(l.description && l.description.length >= 100) && "description under 100 chars",
    !(l.keywords && l.keywords.length <= 100) && "keywords missing or over 100 chars",
    !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(l.bundleId ?? "") && "invalid bundle ID",
    !/^#[0-9a-f]{6}$/i.test(l.primaryColor ?? "") && "invalid brand color",
    !l.privacyNotes && "no privacy notes",
  ].filter(Boolean) as string[];
  add("listing", "Store listing is complete and within limits", listingProblems.length === 0, true, 10, listingProblems.join("; "));

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const score = Math.round((earned / total) * 100);
  return {
    score,
    shippable: checks.every((c) => c.pass || !c.critical) && score >= 80,
    checks,
    screensVisited: screens.size,
    tapsTried: taps,
    errors,
    screenshot,
  };
}

/** Load-time crash check, mirroring the builder's automatic runtime repair. */
export async function loadError(browser: Browser, files: FileMap): Promise<string | null> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript({ content: SHIM });
  await context.addInitScript(() => {
    const w = window as unknown as { __errors: string[] };
    w.__errors = [];
    window.addEventListener("message", (e) => {
      if (e.data?.source === "appmaker-preview" && e.data.type === "error") w.__errors.push(e.data.message);
    });
  });
  const page = await context.newPage();
  try {
    await openApp(page, files);
    return (await appErrors(page))[0] ?? null;
  } finally {
    await context.close();
  }
}
