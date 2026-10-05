import { expect, test, type Page } from "@playwright/test";

async function buildApp(page: Page, prompt: string) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill(prompt);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  return page.frameLocator('iframe[title="App preview"]');
}

test("the Design panel restyles the app instantly and the change is kept", async ({ page }) => {
  const app = await buildApp(page, "A dream diary");
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  // The preview restarts the app on a change, so this reads the first screen: the selected tab's label.
  const tabColor = () => app.getByText("Entries", { exact: true }).evaluate((el) => getComputedStyle(el).color);
  await expect.poll(tabColor).toBe("rgb(33, 87, 207)");

  await page.getByRole("button", { name: "Design" }).click();
  const panel = page.getByRole("region", { name: "Design" });
  await expect(panel.getByRole("button", { name: "Make this app customizable" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Forest" }).click();
  await expect.poll(tabColor, { timeout: 10_000 }).toBe("rgb(18, 113, 54)");

  await panel.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(() => app.getByText("Kicked off the project").evaluate((el) => getComputedStyle(el).color), { timeout: 10_000 }).toBe("rgb(245, 245, 247)");

  // Saved with the app, and the store listing follows the brand color.
  await page.reload();
  await page.getByRole("button", { name: "Code" }).click();
  await page.getByRole("main").getByRole("button", { name: "src/theme.js" }).click();
  await expect(page.getByLabel("Source of src/theme.js")).toHaveValue(/export const mode = "dark"/);
  await expect(page.getByLabel("Source of src/theme.js")).toHaveValue(/"primary":"#60a87b"/i);
});

test("apps made before design settings offer to become customizable", async ({ page }) => {
  // An app with its own hard-coded colors (it doesn't read src/theme.js).
  const listing = JSON.stringify({
    name: "Old Style",
    subtitle: "Testing",
    description: "d".repeat(120),
    keywords: "a",
    category: "Utilities",
    bundleId: "com.example.old",
    primaryColor: "#123456",
    iconEmoji: "🧪",
    privacyNotes: "None",
  });
  const code = `import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() {\n  return (<View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}><Text style={{ fontSize: 24, color: '#111827' }}>Today</Text></View>);\n}`;
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${code}\n</file>\n<listing>${listing}</listing>\n<summary>ok</summary>`,
    }),
  );
  const app = await buildApp(page, "An old-style app");
  await expect(app.getByText("Today").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByRole("button", { name: "Make this app customizable" })).toBeVisible();
});

test("on a phone the Design panel is a sheet over the preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await buildApp(page, "A dream diary");
  await page.getByRole("button", { name: "App" }).click();
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Design" }).click();
  const panel = page.getByRole("region", { name: "Design" });
  await expect(panel).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await panel.getByRole("button", { name: "Close design" }).click();
  await expect(panel).toHaveCount(0);
});
