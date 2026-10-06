import { expect, test } from "@playwright/test";

const LISTING = JSON.stringify({
  name: "Garden Pal",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Utilities",
  bundleId: "com.example.garden",
  primaryColor: "#2f6b3a",
  iconEmoji: "🌱",
  privacyNotes: "None",
});
const APP = `import React from 'react';
import { View, Text } from 'react-native';
export default function App() {
  return (
    <View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 24, color: '#111827' }}>Garden</Text>
    </View>
  );
}`;

test("the phone shows the app being made, then the app", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>((r) => (release = r));
  await page.route("**/api/generate", async (route) => {
    await waiting;
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${APP}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  const progress = page.getByRole("status", { name: "Your app is being made" });
  await expect(progress).toBeVisible({ timeout: 30_000 });
  await expect(progress).toContainText("Your new app");
  await expect(progress).toContainText("Understanding your idea");
  release();
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden")).toBeVisible({ timeout: 30_000 });
  await expect(progress).toHaveCount(0);
});

test("the server's thinking and keep-alive signals never end up in the app", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<thinking/><alive/><thinking/><plan>x</plan>\n<file path="App.js">\n${APP.replace("Garden</Text>", "Gar<alive/>den</Text>")}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Code" }).first().click();
  await expect(page.getByLabel("Source of App.js")).not.toHaveValue(/<alive\/>|<thinking\/>/);
});
