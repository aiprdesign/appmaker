import { expect, test } from "@playwright/test";

// A tiny PNG (any picture works: the designs only need it to load).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SITE = {
  url: "https://bella.example/",
  siteName: "Bella Pizza",
  title: "Bella Pizza",
  description: "Wood-fired pizza in Brooklyn.",
  colors: ["#b91c1c"],
  logo: "https://img.bella.example/logo.png",
  images: ["https://img.bella.example/hero.jpg", "https://img.bella.example/oven.jpg"],
  pages: [{ url: "https://bella.example/", title: "Home", headings: ["Pizza night"], text: "Pizza night", sections: [] }],
};
// The AI's designs leave out the logo and every photo.
const reply = (n: number) => `<file path="index.html">
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home · Bella Pizza</title></head>
<body><header class="flex items-center justify-between p-6"><a href="index.html" class="text-xl font-bold">Bella Pizza</a><nav><a href="menu.html">Menu</a></nav></header>
<main><section class="p-10"><h1 class="text-5xl font-bold">Pizza night ${n}</h1><p>Wood-fired pizza in Brooklyn.</p></section><section class="p-10"><h2>Our menu</h2></section></main></body></html>
</file>
<file path="menu.html">
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Menu · Bella Pizza</title></head><body><header><a href="index.html"></a></header><main><h1>Menu</h1></main></body></html>
</file>
<summary>Design.</summary>`;

test("every design shows the business's logo and its hero photo, even when the AI leaves them out", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://img.bella.example/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/site", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ site: SITE }) }));
  let n = 0;
  await page.route("**/api/generate", (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply(++n) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Redesign website" }).click();
  await page.getByLabel("Website address").fill("https://bella.example/");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Bella Pizza").first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Describe your app").press("Enter");
  await expect(page.getByRole("heading", { name: "Choose a design" })).toBeVisible({ timeout: 30_000 });
  const preview = page.frameLocator('iframe[title="Website preview"]');
  for (const i of [1, 2, 3]) {
    await page.getByRole("tab", { name: new RegExp(`^Design ${i} ·`) }).click();
    await expect(preview.getByRole("heading", { level: 1 })).toContainText("Pizza night", { timeout: 30_000 });
    const logo = preview.locator('header img[src="https://img.bella.example/logo.png"]');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const hero = preview.locator('main img[src="https://img.bella.example/hero.jpg"]');
    await expect(hero).toBeVisible();
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/design-${i}.png` });
  }
});
