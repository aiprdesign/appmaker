import { expect, test } from "@playwright/test";

const LISTING = JSON.stringify({
  name: "Polish App",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Utilities",
  bundleId: "com.example.polish",
  primaryColor: "#123456",
  iconEmoji: "✨",
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
const reply = `<plan>x</plan>\n<file path="App.js">\n${APP}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`;

test("Polish design sends a screenshot of the screen with a design checklist", async ({ page }) => {
  const bodies: { prompt: string; images?: string[] }[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Polish design" }).click();
  await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(2);
  expect(bodies[0].images).toBeUndefined();
  const polish = bodies[1];
  expect(polish.prompt).toMatch(/^Polish design:/);
  expect(polish.prompt).toContain("on an iPhone in light mode");
  expect(polish.prompt).toContain("Garden");
  expect(polish.images).toHaveLength(1);
  expect(polish.images![0]).toMatch(/^data:image\/jpeg;base64,/);
  // A real picture, not an empty canvas.
  expect(polish.images![0].length).toBeGreaterThan(5_000);
});

test("screens with photos that can't be copied still capture", async ({ page }) => {
  const withPhoto = APP.replace(
    "<Text style={{ fontSize: 24, color: '#111827' }}>Garden</Text>",
    "<Text style={{ fontSize: 24, color: '#111827' }}>Garden</Text>\n      <Image source={{ uri: 'http://localhost:3200/photo.png' }} style={{ width: 200, height: 120 }} accessibilityLabel=\"Garden photo\" />",
  ).replace("import { View, Text } from 'react-native';", "import { View, Text, Image } from 'react-native';");
  const bodies: { images?: string[] }[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${withPhoto}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden")).toBeVisible({ timeout: 30_000 });
  // The photo shows in the app, but the browser won't let it be copied into a picture.
  await expect(page.frameLocator('iframe[title="App preview"]').getByRole("img", { name: "Garden photo" })).toBeVisible();
  await page.getByRole("button", { name: "Polish design" }).click();
  await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(2);
  expect(bodies[1].images?.[0]).toMatch(/^data:image\/(jpeg|png);base64,/);
  await expect(page.getByText(/Couldn't capture the screen/)).toHaveCount(0);
});
