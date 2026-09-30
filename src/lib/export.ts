import JSZip from "jszip";
import { drawLogoIcon, isIconImage } from "./icon";
import type { AppIconImage, Project, StoreListing } from "./types";
import { expoProjectFiles, ICON_PATH, slugify } from "./expo-project";

export { appJson, slugify, usedDependencies } from "./expo-project";

/** Draws the app icon to a square PNG: the business's logo if set, else the emoji on a gradient. */
export async function renderIcon(listing: StoreListing, size = 1024, icon?: AppIconImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, shade(listing.primaryColor, 0.25));
  g.addColorStop(1, shade(listing.primaryColor, -0.25));
  if (icon && isIconImage(icon)) {
    await drawLogoIcon(ctx, size, icon, g);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${size * 0.56}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(listing.iconEmoji || "✨", size / 2, size / 2 + size * 0.04);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const gr = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (gr << 8) | b).toString(16).slice(1)}`;
}

export async function exportProjectZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(slugify(project.listing.name))!;
  for (const [path, content] of Object.entries(expoProjectFiles(project))) root.file(path, content);
  root.file(ICON_PATH, await renderIcon(project.listing, 1024, project.icon));
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
