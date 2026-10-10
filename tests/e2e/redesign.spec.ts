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

  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ kind: "website", site: { siteName: "Luigi's Trattoria" } });
  expect(String(bodies[0].prompt)).toMatch(/^Redesign Luigi's Trattoria .* as a modern, beautiful multi-page website/);
  expect(typeof bodies[0].style).toBe("string");

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
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ kind: "website", files: { "index.html": expect.stringContaining("Luigi's Trattoria") } });
});
