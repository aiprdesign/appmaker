import { describe, expect, it } from "vitest";
import { summarizeHtml, tidyImages } from "@/lib/site";

describe("kaizen batch 2: imported pictures and description", () => {
  it("keeps each photo once, at its largest size, and drops tracking pixels", () => {
    expect(
      tidyImages([
        "https://x.example/wp-content/uploads/hero-300x200.jpg",
        "https://x.example/pasta.jpg?w=400",
        "https://www.facebook.com/tr?id=1&ev=PageView",
        "https://x.example/wp-content/uploads/hero-1024x683.jpg",
        "https://x.example/pasta.jpg?w=1200",
        "https://x.example/oven.jpg",
        "https://x.example/wp-content/uploads/hero.jpg",
        "https://www.google-analytics.com/collect.gif",
      ]),
    ).toEqual(["https://x.example/wp-content/uploads/hero.jpg", "https://x.example/pasta.jpg?w=1200", "https://x.example/oven.jpg"]);
  });

  it("describes the site with its first real paragraph when it has no description", () => {
    const html = `<html><head><title>Luigi's</title></head><body><nav><p>Menu and more things to click on in this navigation bar here</p></nav><main><p>Hi</p><p>Fresh pasta made by hand every morning in Brooklyn since 1987, with flour from Italy.</p></main></body></html>`;
    expect(summarizeHtml(html, new URL("https://luigis.example/")).summary.description).toBe("Fresh pasta made by hand every morning in Brooklyn since 1987, with flour from Italy.");
  });
});
