import { expect, test } from "@playwright/test";

const listing = (name: string, color: string) =>
  JSON.stringify({ name, subtitle: "Testing", description: "d".repeat(120), keywords: "a", category: "Utilities", bundleId: "com.example.x", primaryColor: color, iconEmoji: "✨", privacyNotes: "None" });
const app = (title: string) => `import React from 'react';
import { View, Text } from 'react-native';
export default function App() { return <View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}><Text style={{ fontSize: 24, color: '#111827' }}>${title}</Text></View>; }`;

test("the sidebar lists every app, makes new ones, and collapses to icons", async ({ page }) => {
  let n = 0;
  await page.route("**/api/brief", (route) => route.fulfill({ json: { brief: null } }));
  await page.route("**/api/generate", async (route) => {
    n++;
    const [name, color] = n === 1 ? ["Garden Pal", "#15803D"] : ["Coffee Club", "#7C4A2D"];
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${app(name)}\n</file>\n<listing>${listing(name, color)}</listing>\n<summary>ok</summary>`,
    });
  });
  for (const idea of ["a garden planner", "a coffee loyalty card"]) {
    await page.goto("/");
    await page.getByLabel("Describe your app").fill(idea);
    await page.keyboard.press("Enter");
    await expect(page.frameLocator('iframe[title="App preview"]').getByText(idea.startsWith("a garden") ? "Garden Pal" : "Coffee Club")).toBeVisible({ timeout: 30_000 });
  }

  const sidebar = page.getByRole("navigation", { name: "Your apps" });
  await expect(sidebar.getByRole("link", { name: /Coffee Club/ })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: /Garden Pal/ })).not.toHaveAttribute("aria-current", "page");
  // Newest first.
  await expect(sidebar.getByRole("listitem").first()).toContainText("Coffee Club");

  // Opening another app from the sidebar.
  await sidebar.getByRole("link", { name: /Garden Pal/ }).click();
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden Pal")).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByRole("link", { name: /Garden Pal/ })).toHaveAttribute("aria-current", "page");

  // Collapsed: icons only, names as labels; remembered after a reload; ⌘/Ctrl+B toggles.
  await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar.getByText("Coffee Club")).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Coffee Club" })).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeLessThan(80);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Your apps" })).toHaveAttribute("data-collapsed", "true");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect(sidebar.getByText("Coffee Club")).toBeVisible();

  // "+" starts a new app on the home page.
  await sidebar.getByRole("link", { name: "New app" }).click();
  await expect(page).toHaveURL(/\/#start$/);
  await expect(page.getByLabel("Describe your app")).toBeVisible();
});
