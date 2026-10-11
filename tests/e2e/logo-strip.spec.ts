import { expect, test, type Page } from "@playwright/test";
import { A11Y_WIDGET } from "../../src/lib/site-a11y";

const logo = (i: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="160" height="48" rx="8" fill="hsl(${i * 40},70%,50%)"/></svg>`)}`;
const strip = (n: number, attrs = "") =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><main style="width:1000px">
  <section><h2>Trusted by</h2><div data-logo-marquee aria-label="Our clients" ${attrs}><ul>${Array.from({ length: n }, (_, i) => `<li><img src="${logo(i)}" alt="Company ${i + 1}"></li>`).join("")}</ul></div></section>
  </main><script>${A11Y_WIDGET}</script></body></html>`;

const x = (page: Page) => page.locator(".am-marquee-track").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);

test("the logo strip scrolls endlessly, reads each logo once, and pauses on hover or with its button", async ({ page }) => {
  await page.setContent(strip(6));
  const region = page.getByRole("region", { name: "Our clients" });
  await expect(region).toHaveClass(/am-marquee/);
  // Filled to wider than the strip, then one hidden copy for a seamless loop.
  const lists = region.locator(".am-marquee-track > ul");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(1)).toHaveAttribute("aria-hidden", "true");
  expect(await lists.first().evaluate((el) => el.scrollWidth)).toBeGreaterThan(1000);
  // Screen readers hear each company once.
  await expect(region.getByRole("img")).toHaveCount(6);
  await expect(region.getByRole("img", { name: "Company 1" })).toHaveCount(1);
  // It moves…
  const a = await x(page);
  await page.waitForTimeout(400);
  expect(await x(page)).toBeLessThan(a);
  // …pauses while hovered…
  await region.hover();
  const b = await x(page);
  await page.waitForTimeout(400);
  expect(await x(page)).toBe(b);
  // …and the pause button stops it for good (WCAG 2.2.2).
  const toggle = region.getByRole("button", { name: "Pause the logos" });
  await toggle.click();
  await expect(region.getByRole("button", { name: "Play the logos" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 600);
  const c = await x(page);
  await page.waitForTimeout(400);
  expect(await x(page)).toBe(c);
});

test("the logo strip scrolls the other way when asked", async ({ page }) => {
  await page.setContent(strip(6, 'data-direction="right"'));
  await expect(page.locator(".am-marquee-track")).toHaveCSS("animation-direction", "reverse");
});

test("few logos, or motion turned off, give a calm centred row", async ({ page, browser }) => {
  await page.setContent(strip(3));
  await expect(page.locator("[data-logo-marquee]")).toHaveClass(/is-static/);
  await expect(page.locator(".am-marquee-track > ul")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /the logos/ })).toHaveCount(0);

  const calm = await browser.newPage({ reducedMotion: "reduce" });
  await calm.setContent(strip(8));
  await expect(calm.locator("[data-logo-marquee]")).toHaveClass(/is-static/);
  await expect(calm.locator(".am-marquee-track")).toHaveCSS("animation-name", "none");
  await calm.close();
});
