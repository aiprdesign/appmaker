import { expect, test } from "@playwright/test";
import { A11Y_WIDGET } from "../../src/lib/site-a11y";
import { previewDocument } from "../../src/components/builder/SitePreview";

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}<script>${A11Y_WIDGET}</script></body></html>`;
const YT = "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa";

test("the built-in video player shows a still, and loads the official player only when pressed", async ({ page: p }) => {
  // No network: nothing should load until play is pressed.
  const requests: string[] = [];
  await p.route("**/*", (r) => {
    requests.push(r.request().url());
    return r.fulfill({ status: 200, body: "" });
  });
  await p.setContent(page(`<div data-video="${YT}" data-title="Making fresh pasta" class="aspect-video w-[640px]"></div>`));
  const play = p.getByRole("button", { name: "Play video: Making fresh pasta" });
  await expect(play).toBeVisible();
  await expect(play).toHaveCSS("background-image", /i\.ytimg\.com\/vi\/aaaaaaaaaaa\/hqdefault\.jpg/);
  expect(requests.some((u) => u.includes("youtube-nocookie"))).toBe(false);
  await play.press("Enter");
  const frame = p.locator('iframe[title="Making fresh pasta"]');
  await expect(frame).toHaveAttribute("src", `${YT}?autoplay=1`);
  await expect(frame).toHaveAttribute("allow", /fullscreen/);
});

test("other addresses are ignored, and in Appmaker's preview it says the video plays on the live site", async ({ page: p }) => {
  await p.setContent(page(`<div data-video="https://evil.example/embed/x" data-title="Nope"></div>`));
  await expect(p.getByRole("button", { name: /Play video/ })).toHaveCount(0);

  const html = page(`<iframe src="${YT}" title="Our kitchen" class="aspect-video w-full"></iframe><iframe src="https://www.google.com/maps/embed?pb=1" title="Map"></iframe>`);
  const doc = previewDocument({ "index.html": html }, "index.html");
  expect(doc).toContain(`<div data-video="${YT}" data-title="Our kitchen" class="aspect-video w-full"></div>`);
  expect(doc).toContain('title="Map"');
  await p.setContent(doc);
  await p.getByRole("button", { name: "Play video: Our kitchen" }).click();
  await expect(p.getByRole("status")).toHaveText("The video plays on your live site.");
  await expect(p.locator(`iframe[src^="${YT}"]`)).toHaveCount(0);
});

test("skip links move keyboard focus, so the next Tab continues from the main content", async ({ page: p }) => {
  await p.setContent(
    page(`<a href="#main">Skip to content</a><nav><a href="/a">One</a><a href="/b">Two</a></nav><main id="main"><h1>Hello</h1><a href="/c">First link in main</a></main>`),
  );
  await p.keyboard.press("Tab");
  await expect(p.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await p.keyboard.press("Enter");
  await expect(p.locator("main")).toBeFocused();
  await p.keyboard.press("Tab");
  await expect(p.getByRole("link", { name: "First link in main" })).toBeFocused();
});
