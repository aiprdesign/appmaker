import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { channelIdFrom, embedUrl, feedVideos, isYoutubeChannel, pageVideos, sanitizeVideos, thumbnailUrl, videoFrom } from "@/lib/site-media";
import { formatSite } from "@/lib/prompt";
import type { SiteSummary } from "@/lib/types";

describe("the business's own videos and posts", () => {
  it("recognises YouTube, Vimeo, Instagram and TikTok addresses, and nothing else", () => {
    expect(videoFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
    expect(videoFrom("https://youtu.be/dQw4w9WgXcQ")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
    expect(videoFrom("https://www.youtube.com/shorts/abcdefghijk")).toEqual({ kind: "youtube", id: "abcdefghijk" });
    expect(videoFrom("https://player.vimeo.com/video/76979871?h=1")).toEqual({ kind: "vimeo", id: "76979871" });
    expect(videoFrom("https://www.instagram.com/reel/C1a2B3c4D5e/")).toEqual({ kind: "instagram", id: "C1a2B3c4D5e" });
    expect(videoFrom("https://www.tiktok.com/@luigis/video/7301234567890123456")).toEqual({ kind: "tiktok", id: "7301234567890123456" });
    expect(videoFrom("https://www.instagram.com/luigis/")).toBeNull();
    expect(videoFrom("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(videoFrom("https://evil.example/embed/dQw4w9WgXcQ")).toBeNull();
  });

  it("finds a page's embedded and linked videos, once each, with their titles", () => {
    const root = parse(`<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Our kitchen"></iframe>
      <a href="https://youtu.be/dQw4w9WgXcQ">Watch again</a><a href="https://vimeo.com/76979871">Our story film</a>
      <a href="https://www.instagram.com/p/C1a2B3c4D5e/">Latest post</a><a href="/menu">Menu</a>`);
    expect(pageVideos(root, new URL("https://luigis.example/"))).toEqual([
      { kind: "youtube", id: "dQw4w9WgXcQ", title: "Our kitchen" },
      { kind: "vimeo", id: "76979871", title: "Our story film" },
      { kind: "instagram", id: "C1a2B3c4D5e", title: "Latest post" },
    ]);
  });

  it("reads a YouTube channel's latest uploads from its public feed", () => {
    expect(isYoutubeChannel("https://www.youtube.com/@LuigisTrattoria")).toBe(true);
    expect(isYoutubeChannel("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(channelIdFrom("https://www.youtube.com/@x", '<meta itemprop="identifier" content="UC1234567890123456789012">')).toBe("UC1234567890123456789012");
    expect(channelIdFrom("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "")).toBe("UCabcdefghijklmnopqrstuv");
    const xml = `<feed><entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Making fresh pasta &amp; sauce</title></entry><entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Our terrace</title></entry></feed>`;
    expect(feedVideos(xml)).toEqual([
      { kind: "youtube", id: "aaaaaaaaaaa", title: "Making fresh pasta & sauce" },
      { kind: "youtube", id: "bbbbbbbbbbb", title: "Our terrace" },
    ]);
  });

  it("gives the AI only official embeds and stills, checked again", () => {
    const site = {
      siteName: "Luigi's",
      url: "https://luigis.example/",
      colors: [],
      pages: [],
      videos: [
        { kind: "youtube", id: "aaaaaaaaaaa", title: "Making pasta" },
        { kind: "instagram", id: "C1a2B3c4D5e" },
        { kind: "youtube", id: "javascript:alert(1)" },
        { kind: "flash", id: "x" },
      ],
    } as unknown as SiteSummary;
    expect(sanitizeVideos(site.videos)).toHaveLength(2);
    const text = formatSite(site);
    expect(text).toContain("- youtube “Making pasta”: embed https://www.youtube-nocookie.com/embed/aaaaaaaaaaa, still https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg");
    expect(text).toContain("- instagram: embed https://www.instagram.com/p/C1a2B3c4D5e/embed");
    expect(text).not.toContain("javascript:");
    expect(embedUrl({ kind: "vimeo", id: "76979871" })).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    expect(thumbnailUrl({ kind: "tiktok", id: "7301234567890123456" })).toBeNull();
  });

  it("the site check allows official players and Google Maps, nothing else", async () => {
    const { pageA11yIssues } = await import("@/lib/website");
    const page = (src: string) => `<html lang="en"><body><iframe src="${src}" title="Video"></iframe></body></html>`;
    expect(pageA11yIssues("index.html", page("https://www.youtube-nocookie.com/embed/aaaaaaaaaaa")).join()).not.toMatch(/embeds/);
    expect(pageA11yIssues("index.html", page("https://www.google.com/maps/embed?pb=1")).join()).not.toMatch(/embeds/);
    expect(pageA11yIssues("index.html", page("https://ads.example/frame")).join()).toMatch(/embeds https:\/\/ads\.example\/frame; only official players/);
  });
});
