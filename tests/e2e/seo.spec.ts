import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("footer links lead to short landing pages that open the ready-made app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "App makers" }).getByRole("link", { name: "Pizza & takeaway ordering app" }).click();
  await expect(page).toHaveURL(/\/apps\/pizza-takeaway$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pizza & takeaway ordering app");
  await expect(page).toHaveTitle(/Pizza & takeaway ordering app maker/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ready-made pizza/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/apps\/pizza-takeaway$/);
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!).map((x: { "@type": string }) => x["@type"])).toEqual(["SoftwareApplication", "FAQPage", "BreadcrumbList"]);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: /Open the pizza & takeaway ordering app/ }).click();
  await expect(page).toHaveURL(/\/build\//);
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Tony's Pizza").first()).toBeVisible({ timeout: 30_000 });
});

test("search engines get a sitemap of the public pages and stay out of private ones", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/apps/car-dealership");
  expect(sitemap).toContain("/website-to-app");
  expect(sitemap).not.toContain("/build/");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/admin/);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  expect((await request.get("/apps/not-a-template")).status()).toBe(404);
});
