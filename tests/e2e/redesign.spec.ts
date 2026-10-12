import { expect, test } from "@playwright/test";

const SITE = "http://localhost:3200/";
const head = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Luigi's Trattoria</title>
<meta name="description" content="Fresh pasta and wood-fired pizza in town.">
<link rel="stylesheet" href="styles.css">
</head>`;
const INDEX = `${head("Home")}
<body>
<a href="#main">Skip to content</a>
<header><nav><a href="index.html" aria-current="page">Home</a> <a href="contact.html">Contact</a> <button id="menu" aria-expanded="false">Menu</button></nav></header>
<main id="main"><h1 class="hero">Luigi's Trattoria</h1><p>Fresh pasta daily.</p><a href="tel:+15551234567">Call us</a></main>
<script src="script.js"></script>
</body>
</html>`;
const CONTACT = `${head("Contact")}
<body><a href="#main">Skip to content</a><main id="main"><h1>Contact Luigi's</h1><a href="index.html">Back home</a></main><script src="script.js"></script></body>
</html>`;
const REPLY = `<plan>A modern redesign.</plan>
<file path="index.html">
${INDEX}
</file>
<file path="contact.html">
${CONTACT}
</file>
<file path="styles.css">
.hero { color: rgb(185, 28, 28); }
</file>
<file path="script.js">
document.getElementById("menu")?.addEventListener("click", (e) => e.currentTarget.setAttribute("aria-expanded", "true"));
</file>
<listing>{"name":"Luigi's Trattoria","primaryColor":"#B91C1C","iconEmoji":"🍝"}</listing>
<summary>Redesigned. Download the ZIP and upload it to your host.</summary>`;

test("redesigns a website: reads the site, writes new pages, previews them at any size, downloads a ZIP", async ({ page }) => {
  // Long: three designs, the full site, and a WCAG 2.2 check of every page.
  test.setTimeout(240_000);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: REPLY });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Redesign website" }).click();
  await expect(page.getByText(/designs a modern new website you can download/)).toBeVisible();
  await page.getByLabel("Website address").fill(SITE);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Luigi's Trattoria")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Describe your app").press("Enter");

  // Three designs of the home page and one inside page, in three different styles.
  await expect.poll(() => bodies.length).toBe(3);
  const styles = bodies.map((b) => b.style);
  expect(new Set(styles).size).toBe(3);
  for (const [i, b] of bodies.entries()) {
    expect(b).toMatchObject({ kind: "website", site: { siteName: "Luigi's Trattoria" } });
    expect(String(b.prompt)).toMatch(/^Redesign Luigi's Trattoria .* as a modern, beautiful multi-page website/);
    expect(String(b.prompt)).toContain(`Design concept ${i + 1} of 3`);
  }
  await expect(page.getByRole("heading", { name: "Choose a design" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Design 1 · Ultra-modern editorial/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Design 2 · Modern soft & rounded/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Design 3 · Made for your business/ })).toBeVisible();
  expect(String(bodies[0].prompt)).toContain("direction ULTRA-MODERN EDITORIAL");
  expect(String(bodies[1].prompt)).toContain("direction MODERN SOFT & ROUNDED");
  expect(String(bodies[2].prompt)).toContain("direction MADE FOR THIS BUSINESS");
  await page.getByRole("tab", { name: /Design 2/ }).click();
  await expect(page.frameLocator('iframe[title="Website preview"]').getByRole("heading", { name: "Luigi's Trattoria" })).toBeVisible({ timeout: 30_000 });
  // Colours: brand colours from the site by default; custom colours redo the three designs.
  await expect(page.getByRole("radio", { name: "Brand colors" })).toHaveAttribute("aria-checked", "true");
  // The colors section lives in the left column, not over the designs.
  await expect(page.locator("aside").getByRole("radio", { name: "Brand colors" })).toBeVisible();
  await expect(page.locator("main").getByRole("radio", { name: "Brand colors" })).toHaveCount(0);
  expect(String(bodies[0].prompt)).toMatch(/use the business's brand colours exactly: #[0-9a-f]{6}/);
  await page.getByRole("radio", { name: "Custom colors" }).click();
  await page.getByLabel("Main color").fill("#123456");
  await page.getByRole("button", { name: "Redo the 3 designs with these colors" }).click();
  await expect.poll(() => bodies.length).toBe(6);
  for (const b of bodies.slice(3)) expect(String(b.prompt)).toContain("the owner chose these colours: #123456");
  await expect(page.getByRole("button", { name: "Use design 2 and make the other pages" })).toBeEnabled({ timeout: 30_000 });

  // Choosing one makes the other pages in that design, in those colours.
  await page.getByRole("tab", { name: /Design 2/ }).click();
  await page.getByRole("button", { name: "Use design 2 and make the other pages" }).click();
  // Then the content keeper: this mock reply leaves out most of the site's sections and
  // pictures, so it asks for them back (three times, its limit), naming what's missing,
  // and then puts the owner's content back itself.
  await expect.poll(() => bodies.length).toBe(10);
  expect(String(bodies[7].prompt)).toMatch(/Content keeper \(checks the redesign kept the owner's content\)/);
  expect(String(bodies[7].prompt)).toMatch(/section ".+" from the current site's \/ page is missing/);
  expect(String(bodies[6].prompt)).toMatch(/every section of its matching current page/);
  expect(bodies[6]).toMatchObject({ kind: "website", style: styles[1], files: { "index.html": expect.any(String) } });
  expect(String(bodies[6].prompt)).toContain("the owner chose these colours: #123456");
  expect(String(bodies[6].prompt)).toMatch(/The owner chose design ".+" \(index\.html and contact\.html are already written\)/);

  await expect(page.getByText(/Content keeper: the AI left out \d+ sections? of your current site/)).toBeVisible({ timeout: 30_000 });
  expect(String(bodies[10 - 1].prompt)).toMatch(/Content keeper/);

  // The new site, with its own stylesheet and script working in the preview.
  const site = page.frameLocator('iframe[title="Website preview"]');
  await expect(site.getByRole("heading", { name: "Luigi's Trattoria" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => site.locator(".hero").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(185, 28, 28)");
  await site.getByRole("button", { name: "Menu" }).click();
  await expect(site.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "true");
  // Links between pages work; a phone number says what it does.
  await site.getByRole("link", { name: "Contact" }).click();
  await expect(site.getByRole("heading", { name: "Contact Luigi's" })).toBeVisible();
  await expect(page.getByLabel("Page")).toHaveValue("contact.html");
  await page.getByLabel("Page").selectOption("index.html");
  await site.getByRole("link", { name: "Call us" }).click();
  await expect(page.getByText(/On the live site this opens \+15551234567/)).toBeVisible();
  // A real WCAG 2.2 AA audit (axe-core) runs on the page in the preview.
  await expect(page.getByRole("status").filter({ hasText: /Accessibility: / })).toBeVisible({ timeout: 20_000 });
  // Every finished site has an accessibility statement, linked from the footer.
  await expect(page.getByLabel("Page").locator("option", { hasText: "accessibility.html" })).toHaveCount(1);
  // The WCAG 2.2 report checks every page, and its result goes into the statement.
  await page.getByRole("button", { name: "WCAG 2.2 report" }).click();
  const report = page.getByRole("region", { name: "WCAG 2.2 level AA report" });
  await expect(report.getByRole("status")).toContainText(/pages pass the automated WCAG 2\.2 A and AA checks|issues? on \d+ of \d+ pages/, { timeout: 120_000 });
  await expect(report.getByText("accessibility.html", { exact: true })).toBeVisible();
  await expect(report.getByText(/Check these yourself/)).toBeVisible();
  await page.getByLabel("Page").selectOption("accessibility.html");
  await expect(site.getByRole("heading", { name: "Accessibility statement", level: 1 })).toBeVisible();
  await expect(site.getByText(/automated checks .*against WCAG 2\.2 level A and AA|automated checks of all \d+ pages/)).toBeVisible();
  await page.getByLabel("Page").selectOption("index.html");
  // Every site has the accessibility widget; its settings change the page.
  await site.getByRole("button", { name: "Accessibility settings" }).click();
  await site.getByRole("button", { name: /Bigger text/ }).click();
  await expect(site.getByRole("button", { name: /Bigger text/ })).toHaveAttribute("aria-pressed", "true");
  await expect(site.locator("html")).toHaveClass(/a11y-text/);
  await site.getByRole("button", { name: /High contrast/ }).click();
  await expect.poll(() => site.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(0, 0, 0)");
  await site.getByRole("button", { name: "Reset all" }).click();
  await expect(site.locator("html")).not.toHaveClass(/a11y-/);
  await page.keyboard.press("Escape");
  // Screen sizes.
  await page.getByRole("radio", { name: "Phone" }).click();
  await expect.poll(async () => (await page.locator('iframe[title="Website preview"]').evaluate((el) => (el as HTMLElement).offsetWidth))).toBe(390);

  // No app-only parts: no Publish, no phone testing; a website download instead.
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Test on a device/ })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download website" }).click();
  expect((await download).suggestedFilename()).toBe("luigi-s-trattoria-website.zip");

  // Edits are website edits too.
  await page.getByLabel("Message").fill("Make the hero bigger");
  await page.keyboard.press("Enter");
  // (The content keeper doesn't run on edits: the owner may remove a section on purpose.)
  await expect.poll(() => bodies.length).toBe(11);
  await page.waitForTimeout(1500);
  expect(bodies).toHaveLength(11);
  expect(bodies[10]).toMatchObject({ kind: "website", files: { "index.html": expect.stringContaining("Luigi's Trattoria") } });
});

test("the owner picks sections and edits text on a design; the change is on every design", async ({ page }) => {
  test.setTimeout(180_000);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: REPLY });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Redesign website" }).click();
  await page.getByLabel("Website address").fill(SITE);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Luigi's Trattoria")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Describe your app").press("Enter");
  await expect.poll(() => bodies.length).toBe(3);
  await expect(page.getByRole("tab", { name: /Design 1/ })).toBeVisible();

  // Edit a heading right on design 1…
  const site = page.frameLocator('iframe[title="Website preview"]');
  await expect(site.getByRole("heading", { name: "Luigi's Trattoria", level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit text" }).click();
  await site.getByText("Fresh pasta daily.").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Fresh pasta, made by hand every morning.");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Changed in 3 places, on every design/)).toBeVisible();
  // …and it's on design 3 too.
  await page.getByRole("button", { name: "Done editing" }).click();
  await page.getByRole("tab", { name: /Design 3/ }).click();
  await expect(site.getByText("Fresh pasta, made by hand every morning.")).toBeVisible({ timeout: 30_000 });

  // Leave a section of the current site out, and redo the designs with that content.
  await page.getByRole("button", { name: /Website content/ }).click();
  const boxes = page.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThan(1);
  await boxes.first().uncheck();
  await expect(page.getByRole("button", { name: /Website content/ })).toContainText(`${count - 1} of ${count} sections`);
  await page.getByRole("button", { name: "Redo the 3 designs with this content" }).click();
  await expect.poll(() => bodies.length).toBe(6);
  const sent = bodies[3] as { prompt: string; site: { pages: { sections?: unknown[] }[] } };
  expect(sent.site.pages.reduce((n, p) => n + (p.sections?.length ?? 0), 0)).toBe(count - 1);
  // The new designs are told about the owner's edit, and keep it.
  expect(sent.prompt).toContain("“Fresh pasta daily.” is now “Fresh pasta, made by hand every morning.”");
  await expect(site.getByText("Fresh pasta, made by hand every morning.")).toBeVisible({ timeout: 30_000 });
});
