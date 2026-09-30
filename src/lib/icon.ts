import type { AppIconImage } from "./types";

/**
 * A business's own logo as the app icon. The logo is resized in the browser
 * and kept with the project (not in the store listing, which goes to the AI
 * with every request). The icon is drawn from it with a solid background:
 * Apple rejects icons with transparency.
 */

/** Only plain base64 images: the value ends up in CSS and on a canvas. */
export const ICON_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_ICON_DATA = 1_500_000;
const MAX_SIDE = 1024;
/** How much of the icon the logo covers on a white or brand background. */
export const LOGO_SCALE = 0.72;

export class IconError extends Error {}

export function isIconImage(v: unknown): v is AppIconImage {
  const o = v as AppIconImage | null;
  return (
    !!o &&
    typeof o === "object" &&
    typeof o.image === "string" &&
    o.image.length <= MAX_ICON_DATA &&
    ICON_DATA_URL.test(o.image) &&
    ["white", "brand", "fill"].includes(o.background)
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new IconError("That file isn't an image the browser can open. Use a PNG or JPG."));
    img.src = src;
  });
}

/** Reads an uploaded logo and shrinks it to at most 1024 px, keeping transparency. */
export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new IconError("Use a PNG, JPG, WebP or SVG image.");
  if (file.size > 15_000_000) throw new IconError("That image is too large (over 15 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || MAX_SIDE;
    const h = img.naturalHeight || MAX_SIDE;
    if (Math.min(w, h) < 64) throw new IconError("That image is too small. Use one at least 512 px wide.");
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // WebP keeps transparency and is small; browsers that can't encode it return PNG.
    let data = canvas.toDataURL("image/webp", 0.92);
    if (!ICON_DATA_URL.test(data) || data.length > MAX_ICON_DATA) data = canvas.toDataURL("image/png");
    if (data.length > MAX_ICON_DATA) data = canvas.toDataURL("image/jpeg", 0.9);
    if (!ICON_DATA_URL.test(data) || data.length > MAX_ICON_DATA) throw new IconError("Couldn't prepare that image. Try a smaller PNG or JPG.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws the logo icon: a solid background, then the logo centered (or covering it all for "fill"). */
export async function drawLogoIcon(ctx: CanvasRenderingContext2D, size: number, icon: AppIconImage, brandFill: string | CanvasGradient): Promise<void> {
  const img = await loadImage(icon.image);
  ctx.fillStyle = icon.background === "brand" ? brandFill : "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (icon.background === "fill") {
    const s = Math.max(size / w, size / h);
    ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  } else {
    const box = size * LOGO_SCALE;
    const s = Math.min(box / w, box / h);
    ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  }
}
