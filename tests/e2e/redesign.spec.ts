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
<header><nav><a href="index.html" aria-current="page">Home</a> <a href="contact.html">Contact</a> <button id="menu" aria-expanded="false">Menu</button></nav></header>
<main><h1 class="hero">Luigi's Trattoria</h1><p>Fresh pasta daily.</p><a href="tel:+15551234567">Call us</a></main>
<script src="script.js"></script>
</body>
</html>`;
const CONTACT = `${head("Contact")}
<body><main><h1>Contact Luigi's</h1><a href="index.html">Back home</a></main><script src="script.js"></script></body>
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
  await expect(page.getByRole("tab", { name: /Design 1 · Simple/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Design 2 · Balanced/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Design 3 · Bold & colorful/ })).toBeVisible();
  expect(String(bodies[0].prompt)).toContain("direction SIMPLE");
  expect(String(bodies[2].prompt)).toContain("direction BOLD & COLORFUL");
  await page.getByRole("tab", { name: /Design 2/ }).click();
  await expect(page.frameLocator('iframe[title="Website preview"]').getByRole("heading", { name: "Luigi's Trattoria" })).toBeVisible({ timeout: 30_000 });
  // Choosing one makes the other pages in that design.
  await page.getByRole("button", { name: "Use design 2 and make the other pages" }).click();
  await expect.poll(() => bodies.length).toBe(4);
  expect(bodies[3]).toMatchObject({ kind: "website", style: styles[1], files: { "index.html": expect.any(String) } });
  expect(String(bodies[3].prompt)).toMatch(/^The owner chose design ".+" \(index\.html and contact\.html are already written\)/);

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
  await expect.poll(() => bodies.length).toBe(5);
  expect(bodies[4]).toMatchObject({ kind: "website", files: { "index.html": expect.stringContaining("Luigi's Trattoria") } });
});
