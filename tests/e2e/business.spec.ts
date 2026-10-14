import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openPublishExtras, showAllPublishSteps } from "./helpers/publish";
import { SITE_PORT } from "../../playwright.config";

// Business features: templates with blanks, and the business's logo as the app icon.

const APP = `import React from 'react';\nimport { Text } from 'react-native';\nexport default function App() { return <Text>Hi</Text>; }`;
const LISTING = JSON.stringify({
  name: "Luigi's",
  subtitle: "Trattoria",
  description: "d".repeat(120),
  keywords: "food",
  category: "Food & Drink",
  bundleId: "com.luigis.app",
  primaryColor: "#B91C1C",
  iconEmoji: "🍝",
  privacyNotes: "None",
});

/** A 600×300 logo drawn in the browser: red on a transparent background. */
async function logoPng(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(50, 50, 500, 200);
    return c.toDataURL("image/png");
  });
  return Buffer.from(data.split(",")[1], "base64");
}

async function openPublish(page: Page) {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${APP}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("restaurant app");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Hi")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await showAllPublishSteps(page);
}

/** Color of the pixel in the middle and in a corner of the rendered 1024 icon. */
async function iconPixels(page: Page, file: string): Promise<{ center: number[]; corner: number[] }> {
  const { readFileSync } = await import("node:fs");
  const b64 = readFileSync(file).toString("base64");
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return { center: px(512, 512), corner: px(4, 4) };
  }, b64);
}

test("a business logo becomes the app icon, on the background you choose", async ({ page }) => {
  await openPublish(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "App icon" }) });
  await section.getByLabel("Upload a logo for the app icon").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await logoPng(page) });
  const icon = section.getByRole("img", { name: "Luigi's icon" });
  await expect(icon).toBeVisible();
  await expect(section.getByRole("radio", { name: "White" })).toHaveAttribute("aria-checked", "true");
  await expect(section.getByLabel("Emoji (used without a logo)")).toBeVisible();

  // The 1024 PNG: logo in the middle, solid white corners (stores reject see-through icons).
  let download = page.waitForEvent("download");
  await section.getByRole("button", { name: "1024×1024 PNG" }).click();
  let pixels = await iconPixels(page, (await (await download).path())!);
  // The logo is stored as WebP, so allow a shade of difference.
  [185, 28, 28].forEach((v, i) => expect(Math.abs(pixels.center[i] - v)).toBeLessThanOrEqual(4));
  expect(pixels.corner).toEqual([255, 255, 255, 255]);

  await section.getByRole("radio", { name: "Brand color" }).click();
  download = page.waitForEvent("download");
  await section.getByRole("button", { name: "1024×1024 PNG" }).click();
  pixels = await iconPixels(page, (await (await download).path())!);
  expect(pixels.corner[3]).toBe(255);
  expect(pixels.corner.slice(0, 3)).not.toEqual([255, 255, 255]);

  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Kept with the app, shown in the builder header, and removable.
  await page.reload();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await showAllPublishSteps(page);
  await expect(section.getByRole("img", { name: "Luigi's icon" })).toBeVisible();
  await expect(page.locator("header").getByRole("img", { name: "Luigi's icon" })).toBeVisible();
  await section.getByRole("button", { name: "Use the emoji instead" }).click();
  await expect(section.getByRole("img", { name: "Luigi's icon" })).toHaveCount(0);
  await expect(section.getByText("🍝").first()).toBeVisible();
});

test("a logo that isn't an image is explained", async ({ page }) => {
  await openPublish(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "App icon" }) });
  await section
    .getByLabel("Upload a logo for the app icon")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await expect(section.getByRole("alert")).toContainText("isn't an image");
});

test("business templates open a working app straight away, and the owner's details update it live", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Pizza & takeaway/ }).click();
  await expect(page).toHaveURL(/\/build\/.+details=1/);
  const phone = page.frameLocator('iframe[title="App preview"]');
  await expect(phone.getByText("Tony's Pizza").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Business name").fill("Luigi's");
  await page.getByLabel("Name 1").fill("Quattro formaggi");
  await expect(phone.getByText("Luigi's").first()).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText("Quattro formaggi").first()).toBeVisible();
  // A customer can order from the menu without anything else set up.
  await phone.getByText("Menu", { exact: true }).last().click();
  await phone.getByRole("button", { name: "Add Pepperoni" }).click();
  // Like the big food apps: Add becomes a stepper, and a "View order" bar shows the basket and total.
  await phone.getByRole("button", { name: "One more Pepperoni" }).click();
  await expect(phone.getByText("$26").first()).toBeVisible();
  await phone.getByRole("button", { name: /^View order/ }).click();
  await phone.getByLabel("Your first name").fill("Sam");
  await phone.getByLabel("Phone", { exact: true }).fill("555 1234");
  await phone.getByRole("button", { name: /^Send order/ }).click();
  await expect(phone.getByText(/^Order sent/)).toBeVisible();
  // The live tracker, with the pizza place's own steps.
  await expect(phone.getByText("Order received").first()).toBeVisible();
  await expect(phone.getByText("In the oven").first()).toBeVisible();
  // The business area is built in: staff mode moves the order on, and the customer sees it.
  await phone.getByText("Info", { exact: true }).last().click();
  await phone.getByRole("button", { name: /Staff mode/ }).click();
  await expect(phone.getByText(/Try it now with orders from this phone/)).toBeVisible();
  await expect(phone.getByText("Sam").first()).toBeVisible();
  await phone.getByRole("button", { name: "Mark as in the oven" }).click();
  await phone.getByRole("button", { name: "Mark as ready" }).click();
  await page.screenshot({ path: test.info().outputPath("staff.png") });
  await phone.getByRole("button", { name: /Back|Close/ }).first().click();
  await phone.getByText("Home", { exact: true }).last().click();
  await expect(phone.getByText("Ready for pickup").first()).toBeVisible();
  await expect(phone.getByText("Hot and waiting at the counter")).toBeVisible();

  // Collected: next time, the same order is one tap away, and the customer's details are remembered.
  await phone.getByText("Info", { exact: true }).last().click();
  await expect(phone.getByText(/Sam · 555 1234/)).toBeVisible();
  await phone.getByRole("button", { name: /Staff mode/ }).click();
  await phone.getByRole("button", { name: "Mark as collected" }).click();
  await phone.getByRole("button", { name: "Back" }).first().click();
  await phone.getByText("Home", { exact: true }).last().click();
  await phone.getByRole("button", { name: /^Order again: 2× Pepperoni/ }).click();
  await expect(phone.getByText("2", { exact: true }).first()).toBeVisible();
  await expect(phone.getByLabel("Your first name")).toHaveValue("Sam");
  await expect(phone.getByLabel("Phone", { exact: true })).toHaveValue("555 1234");
  await expect(phone.getByText("Using your saved details")).toBeVisible();
  await phone.getByRole("button", { name: "Clear my saved details" }).click();
  await expect(phone.getByLabel("Your first name")).toHaveValue("");

  // The owner page is one tap away in the builder (it comes with the app database).
  await expect(page.getByRole("button", { name: "Owner page", exact: true })).toBeVisible();
});

test("the owner fills the app in from their website, pastes a menu and adds photos", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Pizza & takeaway/ }).click();
  const phone = page.frameLocator('iframe[title="App preview"]');
  await expect(phone.getByText("Tony's Pizza").first()).toBeVisible({ timeout: 30_000 });

  // From the website: name, phone, hours, and the menu with prices.
  await page.getByLabel("Fill in from your website").fill(`http://localhost:${SITE_PORT}`);
  await page.getByRole("button", { name: "Fill in", exact: true }).click();
  await expect(page.getByText(/Filled in from Luigi's Trattoria, with \d+ items and prices/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Business name")).toHaveValue("Luigi's Trattoria");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+17185550142");
  await expect(page.getByLabel("Name 1")).toHaveValue("Cacio e pepe");
  await expect(phone.getByText("Luigi's Trattoria").first()).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText("Cacio e pepe").first()).toBeVisible();

  // Pasting a list: categories, names, descriptions and prices.
  await page.getByRole("button", { name: "Paste a list" }).click();
  await page.getByLabel(/One per line/).fill("Desserts:\nPanna cotta - Vanilla, berries - $8\nAffogato $7");
  await page.getByRole("button", { name: "Add to the list" }).click();
  await expect(page.getByLabel("Name 5")).toHaveValue("Affogato");

  // A photo by link (uploads need an account; links don't).
  await page.getByRole("button", { name: "Add a photo of Cacio e pepe" }).click();
  await page.getByLabel("Photo link").fill("https://images.luigis.example/cacio.jpg");
  await page.getByRole("button", { name: "Use this link" }).click();
  await expect(page.getByRole("button", { name: "Change the photo of Cacio e pepe" })).toBeVisible();
  // The app's menu carries the photo (the test can't load it: the address is made up, and CI has no internet).
  await expect
    .poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("appmaker.projects.v1") || "{}")).map((p) => (p as { files: Record<string, string> }).files["src/data-rules.json"] ?? "").join()), { timeout: 15_000 })
    .toContain('"image": "https://images.luigis.example/cacio.jpg"');
});

test("Your data: the business changes its steps safely, and the app's tracker follows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Pizza & takeaway/ }).click();
  const phone = page.frameLocator('iframe[title="App preview"]');
  await expect(phone.getByText("Tony's Pizza").first()).toBeVisible({ timeout: 30_000 });
  await openPublishExtras(page);
  const data = page.locator("section", { has: page.getByRole("heading", { name: /App database/ }) });
  await expect(data.getByText("Your data")).toBeVisible();
  await expect(data.getByText("Used by: Home screen, Items screen")).toBeVisible();
  await expect(data.getByText(/Can't be removed while the app's screens use it/).first()).toBeVisible();
  // The first and last steps can't be removed; a new one goes before the last.
  await expect(data.getByRole("button", { name: "Remove the step Order received" })).toHaveCount(0);
  await data.getByRole("button", { name: "Add a step" }).click();
  await data.getByLabel("Add a step").fill("Out for delivery");
  await data.getByRole("button", { name: "Add", exact: true }).click();
  await expect(data.getByText("Out for delivery")).toBeVisible();
  // Never collected: card numbers.
  await data.getByRole("button", { name: "Add a field" }).last().click();
  await data.getByLabel("Add a field").fill("Card number");
  await data.getByRole("button", { name: "Add", exact: true }).click();
  await expect(data.getByRole("alert")).toContainText("never stored");
  // The customer's app shows the new step at once.
  await page.getByRole("button", { name: "Preview" }).first().click();
  await phone.getByText("Order", { exact: true }).last().click();
  await expect(phone.getByText(/Ready for pickup → Out for delivery → Collected/)).toBeVisible({ timeout: 15_000 });
});
