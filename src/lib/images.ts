/** Photos owners add to their apps (menu items, services): checked here, stored by Appmaker. */

export const MAX_IMAGE_BYTES = 400_000;
export const MAX_IMAGES_PER_USER = 300;
export const IMAGE_ID = /^[A-Za-z0-9_-]{16,40}$/;

export class ImageInputError extends Error {}

/** The picture's real type, from its first bytes (never from what the browser says). */
export function imageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** A data: URL from the browser, as checked bytes and their type. */
export function parseImageData(data: unknown): { bytes: Buffer; type: string } {
  if (typeof data !== "string") throw new ImageInputError("Choose a photo.");
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) throw new ImageInputError("That isn't a photo Appmaker can use. Use a JPEG, PNG or WebP picture.");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageInputError("That photo is too large. Try a smaller one.");
  const type = imageType(bytes);
  if (!type) throw new ImageInputError("That isn't a photo Appmaker can use. Use a JPEG, PNG or WebP picture.");
  return { bytes, type };
}

/** Shrinks a photo in the browser before it's uploaded: at most 900 pixels wide, as a JPEG. */
export async function shrinkPhoto(file: File, max = 900): Promise<string> {
  if (!/^image\//.test(file.type)) throw new ImageInputError("Choose a photo (JPEG, PNG or WebP).");
  if (file.size > 25_000_000) throw new ImageInputError("That photo is too large.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ImageInputError("Couldn't read that photo. Try a JPEG or PNG.");
  });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length * 0.75 < MAX_IMAGE_BYTES) return url;
  }
  throw new ImageInputError("That photo is too large. Try a smaller one.");
}

/** Uploads a photo; returns its public link. */
export async function uploadPhoto(file: File): Promise<string> {
  const data = await shrinkPhoto(file);
  const res = await fetch("/api/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ImageInputError(res.status === 401 ? "Sign in to add your own photos (they're kept with your account)." : body.error || "Couldn't upload that photo. Try again.");
  return body.url as string;
}
