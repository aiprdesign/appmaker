import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

test("business templates fill the prompt with blanks to complete", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Restaurant or café/ }).click();
  const box = page.getByLabel("Describe your app");
  await expect(box).toHaveValue(/An app for my restaurant \[name\] in \[city\]/);
  // The first blank is selected, so typing replaces it.
  await expect.poll(() => box.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe("[name]");
  await page.keyboard.type("Luigi's");
  await expect(box).toHaveValue(/An app for my restaurant Luigi's in \[city\]/);
  await expect(page.getByText(/Replace the \[bracketed\] parts/)).toBeVisible();
});
