import { contrast } from "./design";
import type { AppIconImage, StoreListing } from "./types";

/**
 * Store screenshots: a picture of an app screen (captured inside the preview)
 * becomes a listing image with a headline, a subheading and the screen in a
 * phone frame, at the sizes Apple and Google ask for.
 */

export const SHOT_SIZES = {
  /** iPhone 6.7"/6.9" display: accepted for the App Store's required iPhone set. */
  apple: { w: 1290, h: 2796, label: 'App Store (iPhone 6.9")' },
  /** Google Play phone screenshots: 9:16. */
  google: { w: 1080, h: 1920, label: "Google Play (phone)" },
  /** iPad 13" display: required when the app runs on iPad. */
  ipad: { w: 2064, h: 2752, label: 'App Store (iPad 13")' },
} as const;

export const FEATURE_GRAPHIC = { w: 1024, h: 500 };
export const MAX_SHOTS = 10;

export type ShotStyle = "brand" | "light" | "dark";

export interface Shot {
  id: string;
  /** PNG of the app screen (a phone at 390×844 or an iPad at 1032×1376, at 2–3×). */
  screen: string;
  /** Captured on a phone (the default) or an iPad. */
  device?: "phone" | "ipad";
  /** Visible text on that screen, to help write its headline. */
  text: string;
  title: string;
  subtitle: string;
}

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const HEX = /^#[0-9a-f]{6}$/i;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Background and text colors for a style; text always meets 4.5:1 on the background. */
export function palette(style: ShotStyle, brand: string): { from: string; to: string; title: string; subtitle: string } {
  const color = HEX.test(brand) ? brand : "#6D28D9";
  if (style === "light") return { from: "#FFFFFF", to: shade(color, 0.86), title: "#111827", subtitle: "#4B5563" };
  if (style === "dark") return { from: "#15151F", to: "#07070B", title: "#FFFFFF", subtitle: "#C9C9D6" };
  // White text on a deepened brand color, or dark text on a lightened one: whichever suits the color.
  if (contrast("#FFFFFF", color) >= contrast("#111111", color)) {
    let from = color;
    for (let i = 0; i < 30 && contrast("#F3F4F6", from) < 4.5; i++) from = shade(from, -0.06);
    return { from, to: shade(from, -0.3), title: "#FFFFFF", subtitle: "#F3F4F6" };
  }
  let to = color;
  for (let i = 0; i < 30 && contrast("#1F2937", to) < 4.5; i++) to = shade(to, 0.06);
  return { from: shade(to, 0.3), to, title: "#111111", subtitle: "#1F2937" };
}

/** Headlines from the listing until better ones are written: short sentences from the description. */
export function defaultCaptions(listing: StoreListing, count: number): { title: string; subtitle: string }[] {
  const sentences = listing.description
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/[.!]+$/, ""))
    .filter((s) => s.length >= 12 && s.length <= 38);
  return Array.from({ length: count }, (_, i) =>
    i === 0
      ? { title: listing.subtitle || listing.name, subtitle: listing.name }
      : { title: sentences[i - 1] ?? listing.subtitle ?? listing.name, subtitle: "" },
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the screenshot."));
    img.src = src;
  });
}

/** Draws one listing image: headline, subheading, and the screen in a phone frame. */
export async function renderShot(
  shot: Shot,
  size: { w: number; h: number },
  style: ShotStyle,
  brand: string,
  platform: "ios" | "android" | "ipad",
): Promise<HTMLCanvasElement> {
  const { w, h } = size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const p = palette(style, brand);
  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, p.from);
  bg.addColorStop(1, p.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Headline and subheading at the top.
  const pad = w * 0.08;
  let y = h * 0.065;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleSize = Math.round(w * 0.078);
  ctx.font = `800 ${titleSize}px ${FONT}`;
  ctx.fillStyle = p.title;
  for (const line of wrap(ctx, shot.title, w - pad * 2, 2)) {
    ctx.fillText(line, w / 2, y);
    y += titleSize * 1.18;
  }
  if (shot.subtitle.trim()) {
    const subSize = Math.round(w * 0.042);
    y += subSize * 0.35;
    ctx.font = `500 ${subSize}px ${FONT}`;
    ctx.fillStyle = p.subtitle;
    for (const line of wrap(ctx, shot.subtitle, w - pad * 2, 2)) {
      ctx.fillText(line, w / 2, y);
      y += subSize * 1.3;
    }
  }

  // The phone: as big as fits below the text, running off the bottom edge a little.
  const top = y + h * 0.035;
  const screen = await loadImage(shot.screen);
  // The device's shape comes from the screen itself (phone or iPad).
  const aspect = screen.height / screen.width;
  const ipad = platform === "ipad";
  const bezel = w * (ipad ? 0.018 : 0.022);
  const phoneW = Math.min(w * (ipad ? 0.86 : 0.8), ((h - top) * 1.08) / aspect + bezel * 2);
  const phoneH = (phoneW - bezel * 2) * aspect + bezel * 2;
  const x = (w - phoneW) / 2;
  const radius = phoneW * (platform === "ios" ? 0.14 : ipad ? 0.045 : 0.09);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = w * 0.05;
  ctx.shadowOffsetY = w * 0.015;
  roundRect(ctx, x, top, phoneW, phoneH, radius);
  ctx.fillStyle = "#101014";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x + bezel, top + bezel, phoneW - bezel * 2, phoneH - bezel * 2, radius - bezel);
  ctx.clip();
  ctx.drawImage(screen, x + bezel, top + bezel, phoneW - bezel * 2, phoneH - bezel * 2);
  ctx.restore();
  // Dynamic Island or camera dot.
  ctx.fillStyle = "#000000";
  if (ipad) {
    ctx.beginPath();
    ctx.arc(w / 2, top + bezel / 2, bezel * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2a30";
    ctx.fill();
  } else if (platform === "ios") {
    const iw = phoneW * 0.3;
    roundRect(ctx, (w - iw) / 2, top + bezel + phoneW * 0.028, iw, phoneW * 0.085, phoneW * 0.0425);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(w / 2, top + bezel + phoneW * 0.05, phoneW * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** A plain screenshot at the store size (no frame or text), for listings that prefer them. */
export async function renderPlain(shot: Shot, size: { w: number; h: number }): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;
  const img = await loadImage(shot.screen);
  // Cover: fill the frame, cropping evenly.
  const scale = Math.max(size.w / img.width, size.h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
  return canvas;
}

/** Google Play's feature graphic (1024×500): icon, name and subtitle on the brand color. */
export async function renderFeatureGraphic(listing: StoreListing, iconPng: string, style: ShotStyle, first?: Shot): Promise<HTMLCanvasElement> {
  const { w, h } = FEATURE_GRAPHIC;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const p = palette(style, listing.primaryColor);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, p.from);
  bg.addColorStop(1, p.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const icon = await loadImage(iconPng);
  const size = 150;
  const left = 70;
  ctx.save();
  roundRect(ctx, left, (h - size) / 2 - 70, size, size, 34);
  ctx.clip();
  ctx.drawImage(icon, left, (h - size) / 2 - 70, size, size);
  ctx.restore();
  const textW = first ? w * 0.55 : w - left * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = p.title;
  ctx.font = `800 58px ${FONT}`;
  let y = (h - size) / 2 + 100;
  for (const line of wrap(ctx, listing.name, textW, 1)) {
    ctx.fillText(line, left, y);
    y += 68;
  }
  ctx.fillStyle = p.subtitle;
  ctx.font = `500 30px ${FONT}`;
  for (const line of wrap(ctx, listing.subtitle, textW, 2)) {
    ctx.fillText(line, left, y);
    y += 38;
  }
  if (first) {
    // A phone peeking in from the right.
    const screen = await loadImage(first.screen);
    const pw = 250;
    const ph = (pw * screen.height) / screen.width;
    const px = w - pw - 70;
    const py = 60;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 40;
    roundRect(ctx, px - 8, py - 8, pw + 16, ph + 16, 44);
    ctx.fillStyle = "#101014";
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 36);
    ctx.clip();
    ctx.drawImage(screen, px, py, pw, ph);
    ctx.restore();
  }
  return canvas;
}

export const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));

/** Asks the preview (a sandboxed iframe) for a PNG of its current screen. */
export function captureFrame(frame: HTMLIFrameElement, scale = 3.31): Promise<{ dataUrl: string; text: string }> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The preview didn't respond. Wait for the app to load, then try again."));
    }, 20_000);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.source !== "appmaker-preview" || e.data.type !== "capture" || e.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (typeof e.data.dataUrl === "string" && e.data.dataUrl.startsWith("data:image/png"))
        resolve({ dataUrl: e.data.dataUrl, text: String(e.data.text ?? "").slice(0, 400) });
      else reject(new Error(e.data.error ? `Couldn't capture the screen: ${e.data.error}` : "Couldn't capture the screen."));
    };
    window.addEventListener("message", onMessage);
    frame.contentWindow?.postMessage({ source: "appmaker-parent", type: "capture", id, scale }, "*");
  });
}

/** Captures each main screen of the app: the preview taps every tab in turn (or captures the one screen there is). */
export function tourFrame(frame: HTMLIFrameElement, scale = 3.31): Promise<{ dataUrl: string; text: string }[]> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The preview didn't respond. Wait for the app to load, then try again."));
    }, 90_000);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.source !== "appmaker-preview" || e.data.type !== "tour" || e.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      const shots = Array.isArray(e.data.shots) ? (e.data.shots as { dataUrl?: unknown; text?: unknown }[]) : [];
      const good = shots
        .filter((x) => typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:image/png"))
        .map((x) => ({ dataUrl: x.dataUrl as string, text: String(x.text ?? "").slice(0, 400) }));
      if (good.length) resolve(good);
      else reject(new Error(e.data.error ? `Couldn't capture the screens: ${e.data.error}` : "Couldn't capture the screens."));
    };
    window.addEventListener("message", onMessage);
    frame.contentWindow?.postMessage({ source: "appmaker-parent", type: "tour", id, scale }, "*");
  });
}

export type IconSource = AppIconImage | undefined;
