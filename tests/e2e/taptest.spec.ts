import { expect, test } from "@playwright/test";

const LISTING = JSON.stringify({
  name: "Tap App",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Utilities",
  bundleId: "com.example.tap",
  primaryColor: "#123456",
  iconEmoji: "🧪",
  privacyNotes: "None",
});
const reply = (code: string) => `<plan>x</plan>\n<file path="App.js">\n${code}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`;
const CRASHES = `import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
export default function App() {
  const [item, setItem] = useState(null);
  return (
    <View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 24, color: '#111827' }}>Plants</Text>
      <TouchableOpacity accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => setItem({})}><Text style={{ color: '#111827' }}>Open details</Text></TouchableOpacity>
      {item && <Text>{item.name.toUpperCase()}</Text>}
    </View>
  );
}`;
const FIXED = CRASHES.replace("item.name.toUpperCase()", "(item.name || 'No name yet').toUpperCase()");

test("the tap test finds a button that crashes the app and asks the AI to fix it", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply(prompts.length === 1 ? CRASHES : FIXED) });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a plant care app");
  await page.keyboard.press("Enter");
  // The visible preview shows the app; the hidden tap test finds the crash and the fix is requested.
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Plants")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => prompts.length, { timeout: 30_000 }).toBe(2);
  expect(prompts[1]).toContain("Automatic tap test");
  expect(prompts[1]).toContain("Tapping “Open details” crashes the app");
  expect(prompts[1]).toContain("guard against it");
  // The fixed version passes, so no warning stays on screen.
  await page.waitForTimeout(6000);
  expect(prompts.length).toBe(2);
  await expect(page.getByText("The quality check found something to improve")).toHaveCount(0);
});

test("no quality warnings for a demo app", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker with streaks");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Today").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(8000);
  await expect(page.getByText("The quality check found something to improve")).toHaveCount(0);
});
