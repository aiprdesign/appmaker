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
<body><header class="flex items-center justify-between p-6"><a href="index.html" class="text-xl font-bold">Bella Pizza</a><nav><a href="menu.html">Menu</a> <a href="about.html">About</a></nav></header>
<main><section class="p-10"><h1 class="text-5xl font-bold">Pizza night ${n}</h1><p>Wood-fired pizza in Brooklyn.</p></section><section class="p-10"><h2>Our menu</h2></section></main><footer class="p-10"><div><p>© Bella Pizza</p></div></footer></body></html>
</file>
<file path="menu.html">
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Menu · Bella Pizza</title></head><body><header><a href="index.html"></a></header><main><h1>Menu</h1></main></body></html>
</file>
<summary>Design.</summary>`;

const SVG_LOGO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#b91c1c"/></svg>').toString("base64")}`;

for (const kind of ["linked", "saved"] as const)
test(`every design shows the business's logo (${kind}) in the header and footer, and its hero photo, even when the AI leaves them out`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://img.bella.example/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  // "saved": the logo didn't load from its address (or was drawn inline), so it came with the project.
  const site = kind === "saved" ? { ...SITE, logo: undefined, logoPath: "images/logo.svg" } : SITE;
  const body = kind === "saved" ? { site, assets: { "images/logo.svg": SVG_LOGO } } : { site };
  await page.route("**/api/site", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
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
    const src = kind === "saved" ? SVG_LOGO : "https://img.bella.example/logo.png";
    for (const where of ["header", "footer"]) {
      const logo = preview.locator(`${where} img[src="${src}"]`);
      await expect(logo).toBeVisible();
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    const hero = preview.locator('main img[src="https://img.bella.example/hero.jpg"]');
    await expect(hero).toBeVisible();
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Only two pages exist before a design is chosen: other links say so.
    if (i === 1) {
      await preview.getByRole("link", { name: "About" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Not ready yet" })).toContainText("Choose a design and all pages are made in it.");
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/design-${kind}-${i}.png` });
  }
});
