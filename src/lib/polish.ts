/**
 * "Polish design": Appmaker takes a screenshot of the screen showing in the
 * preview and sends it with a design review checklist, so the AI can see what
 * it built and fix the visual problems code alone doesn't show.
 */

/** Longest side of the screenshot sent to the AI, in pixels. Bigger costs more and doesn't help. */
export const POLISH_MAX_SIDE = 1400;

export function polishPrompt(opts: { scheme: "light" | "dark"; device: "ios" | "android" | "ipad"; screenText?: string }): string {
  const device = opts.device === "ipad" ? "an iPad" : opts.device === "android" ? "an Android phone" : "an iPhone";
  const visible = opts.screenText?.trim().slice(0, 300);
  return [
    `Polish design: the attached screenshot is the screen currently showing in the preview, on ${device} in ${opts.scheme} mode.${
      visible ? ` It shows: "${visible}".` : ""
    }`,
    "Look at it closely like a senior product designer and fix what looks off:",
    "- alignment: edges, icons and text lined up; nothing a few pixels out",
    "- spacing: an even 8-point rhythm, consistent padding inside cards and between sections, no cramped or huge gaps",
    "- hierarchy: one clear title, readable sizes, the main action easy to spot",
    "- consistency: the same corner radius, shadows, button style and theme colors everywhere",
    "- empty or awkward space: the screen fills the display, lists and empty states look intentional",
    "- text: nothing cut off, overlapping or too close to the edges; good contrast in light and dark mode",
    "Keep every feature, screen, piece of content and the app's style. Improve the look, don't redesign it.",
    "Change only the files that need it. If the screen already looks polished, say so and change nothing.",
  ].join("\n");
}

/** The largest screenshot sent, as data-URL characters (the server accepts up to 4 million). */
export const POLISH_MAX_CHARS = 1_500_000;

/**
 * Shrinks a screenshot until it's small enough to send: lower quality first,
 * then smaller. Prefers JPEG, but some browsers (privacy settings, extensions)
 * only give PNG, which is fine too, just at a smaller size. Browser only.
 */
export async function toJpeg(pngDataUrl: string, maxSide = POLISH_MAX_SIDE, maxChars = POLISH_MAX_CHARS): Promise<string> {
  const img = new Image();
  img.src = pngDataUrl;
  await img.decode();
  const longest = Math.max(img.naturalWidth, img.naturalHeight, 1);
  let side = Math.min(maxSide, longest);
  let last = "";
  for (;;) {
    for (const quality of [0.82, 0.65, 0.5]) {
      const out = await encode(img, side / longest, quality);
      last = out;
      if (out.length <= maxChars && /^data:image\/(jpeg|png);base64,/.test(out)) return out;
      // A browser that only gives PNG ignores quality: go straight to a smaller size.
      if (!out.startsWith("data:image/jpeg")) break;
    }
    if (side <= 240) {
      console.warn(`[appmaker] screenshot still too large: ${last.slice(0, 30)}… ${last.length} characters`);
      throw new Error("This browser couldn't make a small enough picture of the screen. Try Polish design in another browser, such as Chrome or Safari.");
    }
    side = Math.round(side * 0.7);
  }
}

/** Draws the screenshot at a size and encodes it, trying both ways browsers offer to make a JPEG. */
async function encode(img: HTMLImageElement, ratio: number, quality: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the screenshot.");
  // JPEG has no transparency: paint white first.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", quality);
  if (url.startsWith("data:image/jpeg")) return url;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (blob?.type === "image/jpeg") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Couldn't prepare the screenshot."));
      reader.readAsDataURL(blob);
    });
  }
  return url;
}
