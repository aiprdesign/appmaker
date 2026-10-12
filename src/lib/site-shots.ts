import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { isPublicAddress } from "./net-guard";

/**
 * Screenshots of a website, for sites whose pictures the plain import can't
 * see (built with JavaScript, or with no photos at all). A headless Chromium
 * renders the page: first its real pictures are read from the rendered page;
 * then, for a website redesign that still has few pictures, parts of the
 * screenshot (the hero and big picture areas) are cut out to use as images.
 *
 * Runs only where a Chromium is available (APPMAKER_CHROMIUM_PATH, Playwright's
 * own, or a system one) and isn't turned off (APPMAKER_SITE_SCREENSHOTS=0).
 * The browser may only load public addresses, like the import itself.
 */

export interface SiteShot {
  /** Where the picture lives in the new site, e.g. images/shot-hero.jpg. */
  path: string;
  /** What it shows, for the designer. */
  label: string;
  width: number;
  height: number;
  /** The JPEG, as a data URL (kept in the browser with the project, never sent to the AI). */
  dataUrl: string;
}

const CANDIDATES = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
const TOTAL_MS = 40_000;
const MAX_SHOTS = 4;

async function chromiumPath(): Promise<string | undefined> {
  const own = process.env.APPMAKER_CHROMIUM_PATH?.trim();
  if (own) return existsSync(own) ? own : undefined;
  try {
    const { chromium } = await import("playwright-core");
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    // Playwright isn't installed: try a system Chromium.
  }
  return CANDIDATES.find((p) => existsSync(p));
}

/** Whether this server can take screenshots of websites. */
export async function screenshotsAvailable(): Promise<boolean> {
  if (process.env.APPMAKER_SITE_SCREENSHOTS === "0") return false;
  return !!(await chromiumPath());
}

const allowPrivate = () => process.env.APPMAKER_ALLOW_PRIVATE_URLS === "1";
const PHOTO = /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i;
const NOT_A_PHOTO = /logo|icon|sprite|favicon|avatar|emoji|spinner|badge|pixel|tracking|placeholder/i;

// One render at a time: a browser is heavy, and imports are rare.
let queue: Promise<unknown> = Promise.resolve();

export function renderSite(url: string, opts: { shots: boolean }): Promise<{ images: string[]; shots: SiteShot[] }> {
  const run = queue.then(() => withTimeout(render(url, opts), TOTAL_MS));
  queue = run.catch(() => {});
  return run.catch(() => ({ images: [], shots: [] }));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

async function render(url: string, opts: { shots: boolean }): Promise<{ images: string[]; shots: SiteShot[] }> {
  const executablePath = await chromiumPath();
  if (!executablePath || process.env.APPMAKER_SITE_SCREENSHOTS === "0") return { images: [], shots: [] };
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      acceptDownloads: false,
      userAgent: "Mozilla/5.0 (compatible; AppmakerBot/1.0; +https://appmaker.dev)",
    });
    const page = await context.newPage();
    // Only public web addresses (no private networks, no file:), and no sound or fonts.
    const safe = new Map<string, Promise<boolean>>();
    await page.route("**/*", async (route) => {
      const req = route.request();
      let u: URL;
      try {
        u = new URL(req.url());
      } catch {
        return route.abort();
      }
      if (!/^https?:$/.test(u.protocol) || ["media", "font", "websocket"].includes(req.resourceType())) return route.abort();
      if (!safe.has(u.hostname)) {
        safe.set(
          u.hostname,
          lookup(u.hostname, { all: true })
            .then((all) => all.length > 0 && (allowPrivate() || all.every((a) => isPublicAddress(a.address))))
            .catch(() => false),
        );
      }
      return (await safe.get(u.hostname)) ? route.continue() : route.abort();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    // Scroll through once so lazy pictures load, then back to the top.
    await page.evaluate(async () => {
      const end = Math.min(document.body.scrollHeight, 12_000);
      for (let y = 0; y < end; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700);

    // The real pictures, as the browser shows them.
    const found = await page.evaluate(() => {
      const out: string[] = [];
      for (const img of Array.from(document.images)) {
        const r = img.getBoundingClientRect();
        if (img.naturalWidth >= 300 && r.width >= 200 && r.height >= 120) out.push(img.currentSrc || img.src);
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *")).slice(0, 4000)) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || !bg.startsWith("url(")) continue;
        const r = el.getBoundingClientRect();
        const m = /url\("?(.*?)"?\)/.exec(bg);
        if (m && r.width >= 400 && r.height >= 200) out.push(m[1]);
      }
      return out.slice(0, 80);
    });
    const images = [...new Set(found)].filter((u) => (/^https:\/\//i.test(u) || (allowPrivate() && /^http:\/\//i.test(u))) && PHOTO.test(u) && !NOT_A_PHOTO.test(u.split(/[?#]/)[0].split("/").pop() ?? ""));

    const shots: SiteShot[] = [];
    if (opts.shots) {
      // Cookie banners and fixed headers would sit on top of every crop.
      await page.addStyleTag({ content: "[class*=cookie],[id*=cookie],[class*=consent],[id*=consent]{display:none!important}" }).catch(() => {});
      await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          const pos = getComputedStyle(el).position;
          if (pos === "fixed" || pos === "sticky") el.style.setProperty("position", "static", "important");
        }
      });
      const regions = await page.evaluate(() => {
        const height = document.documentElement.scrollHeight;
        const heroH = Math.min(720, height);
        const picked: { x: number; y: number; width: number; height: number; label: string }[] = [
          { x: 0, y: 0, width: 1280, height: heroH, label: "the top of the home page (its hero)" },
        ];
        const overlaps = (a: { y: number; height: number }, b: { y: number; height: number }) =>
          Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) > 0.4 * Math.min(a.height, b.height);
        const els = Array.from(document.querySelectorAll<HTMLElement>("section, figure, article, [class*=hero], [class*=banner], [class*=gallery], main > div"));
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const y = r.top + window.scrollY;
          if (r.width < 600 || r.height < 260 || r.height > 900 || y < heroH * 0.8) continue;
          // Crop to the picture itself: the section's biggest photo, or the whole section
          // when the section is the picture (a background image, a video or a canvas).
          const photos = Array.from(el.querySelectorAll("img"))
            .filter((i) => (i as HTMLImageElement).naturalWidth >= 300)
            .map((i) => i.getBoundingClientRect())
            .filter((b) => b.width >= 300 && b.height >= 200)
            .sort((a, b) => b.width * b.height - a.width * a.height);
          const whole = /url\(/.test(getComputedStyle(el).backgroundImage) || !!el.querySelector("video, canvas");
          const box = photos[0] ?? (whole ? r : null);
          if (!box) continue;
          const region = { x: Math.max(0, box.left), y: box.top + window.scrollY, width: Math.min(1280, box.width), height: Math.min(900, box.height) };
          if (picked.some((p) => overlaps(p, region))) continue;
          const heading = el.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60);
          picked.push({ ...region, label: heading ? `the pictures in the “${heading}” section` : "a picture area further down the page" });
          if (picked.length >= 4) break;
        }
        return picked;
      });
      for (const [i, r] of regions.slice(0, MAX_SHOTS).entries()) {
        const clip = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        if (clip.width < 200 || clip.height < 120) continue;
        const jpeg = await page.screenshot({ clip, type: "jpeg", quality: 68, fullPage: true });
        shots.push({
          path: i === 0 ? "images/shot-hero.jpg" : `images/shot-${i}.jpg`,
          label: r.label,
          width: clip.width,
          height: clip.height,
          dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        });
      }
    }
    await context.close();
    return { images, shots };
  } finally {
    await browser.close().catch(() => {});
  }
}
