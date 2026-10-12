import type { HTMLElement } from "node-html-parser";

/**
 * Videos and posts from a business's own channels, for a website redesign.
 * Only official embeds are used: YouTube (privacy-enhanced), Vimeo, and single
 * Instagram and TikTok posts the site itself links to. Nothing is downloaded
 * or scraped from the social networks; a YouTube channel's latest uploads come
 * from its public RSS feed.
 */

export type VideoKind = "youtube" | "vimeo" | "instagram" | "tiktok";

export interface SiteVideo {
  kind: VideoKind;
  id: string;
  title?: string;
}

export const MAX_VIDEOS = 8;

const ID: Record<VideoKind, RegExp> = {
  youtube: /^[\w-]{11}$/,
  vimeo: /^\d{6,12}$/,
  instagram: /^[\w-]{5,40}$/,
  tiktok: /^\d{8,25}$/,
};

/** The video or post an address points to, if it's one of the supported kinds. */
export function videoFrom(href: string): SiteVideo | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  let v: SiteVideo | null = null;
  if (host === "youtu.be") v = { kind: "youtube", id: parts[0] ?? "" };
  else if (/^(youtube\.com|youtube-nocookie\.com)$/.test(host)) {
    if (parts[0] === "watch") v = { kind: "youtube", id: u.searchParams.get("v") ?? "" };
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) v = { kind: "youtube", id: parts[1] ?? "" };
  } else if (host === "vimeo.com" && /^\d+$/.test(parts[0] ?? "")) v = { kind: "vimeo", id: parts[0] };
  else if (host === "player.vimeo.com" && parts[0] === "video") v = { kind: "vimeo", id: parts[1] ?? "" };
  else if (host === "instagram.com" && ["p", "reel", "tv"].includes(parts[0])) v = { kind: "instagram", id: parts[1] ?? "" };
  else if (host === "tiktok.com" && parts[1] === "video") v = { kind: "tiktok", id: parts[2] ?? "" };
  else if (host === "tiktok.com" && parts[0] === "embed") v = { kind: "tiktok", id: parts.at(-1) ?? "" };
  return v && ID[v.kind].test(v.id) ? v : null;
}

/** Videos the page embeds or links to, in page order. */
export function pageVideos(root: HTMLElement, base: URL): SiteVideo[] {
  const out: SiteVideo[] = [];
  const add = (href: string | undefined, title?: string) => {
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, base).toString();
    } catch {
      return;
    }
    const v = videoFrom(abs);
    if (v && !out.some((o) => o.kind === v.kind && o.id === v.id)) out.push({ ...v, ...(title ? { title: title.slice(0, 120) } : {}) });
  };
  for (const f of root.querySelectorAll("iframe[src], iframe[data-src]")) add(f.getAttribute("src") || f.getAttribute("data-src"), f.getAttribute("title")?.trim());
  for (const a of root.querySelectorAll("a[href]").slice(0, 500)) add(a.getAttribute("href"), a.text.replace(/\s+/g, " ").trim() || undefined);
  return out;
}

/** A YouTube channel address (an @handle, /channel/, /c/ or /user/ page). */
export function isYoutubeChannel(href: string): boolean {
  try {
    const u = new URL(href);
    return /^(www\.|m\.)?youtube\.com$/.test(u.hostname) && /^\/(@[\w.-]+|channel\/UC[\w-]{22}|c\/[\w.-]+|user\/[\w.-]+)\/?/.test(u.pathname);
  } catch {
    return false;
  }
}

/** The channel ID (UC…) a YouTube channel page names. */
export function channelIdFrom(url: string, html: string): string | null {
  return (
    /\/channel\/(UC[\w-]{22})/.exec(url)?.[1] ??
    /<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/.exec(html)?.[1] ??
    /"(?:channelId|externalId)":"(UC[\w-]{22})"/.exec(html)?.[1] ??
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)?.[1] ??
    null
  );
}

/** A channel's latest uploads, from YouTube's public RSS feed (Shorts and live streams included). */
export function feedVideos(xml: string, max = 6): SiteVideo[] {
  const out: SiteVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([^<]{1,200})<\/title>/.exec(entry)?.[1];
    if (id) out.push({ kind: "youtube", id, ...(title ? { title: decode(title).slice(0, 120) } : {}) });
    if (out.length >= max) break;
  }
  return out;
}

const decode = (t: string) =>
  t
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** The official embed for a video, as the new site should use it. */
export function embedUrl(v: SiteVideo): string {
  switch (v.kind) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${v.id}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${v.id}?dnt=1`;
    case "instagram":
      return `https://www.instagram.com/p/${v.id}/embed`;
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${v.id}`;
  }
}

/** A still for a video (YouTube only: others need their player). */
export function thumbnailUrl(v: SiteVideo): string | null {
  return v.kind === "youtube" ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null;
}

/** Videos as the browser sends them back, checked again. */
export function sanitizeVideos(v: unknown): SiteVideo[] {
  return (Array.isArray(v) ? v : []).slice(0, MAX_VIDEOS).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const kind = (x as SiteVideo).kind;
    const id = (x as SiteVideo).id;
    if (!(kind in ID) || typeof id !== "string" || !ID[kind].test(id)) return [];
    const title = typeof (x as SiteVideo).title === "string" ? (x as SiteVideo).title!.replace(/[<>]/g, "").slice(0, 120) : undefined;
    return [{ kind, id, ...(title ? { title } : {}) }];
  });
}

/** Embedded players a redesigned site may use: these official ones, and Google Maps. */
export const ALLOWED_FRAME =
  /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/|www\.instagram\.com\/(p|reel)\/[\w-]+\/embed|www\.tiktok\.com\/embed\/|www\.google\.com\/maps\/embed|maps\.google\.com\/maps)/i;
