import { expect, test, type Page, type Route } from "@playwright/test";

// Simulates the AI endpoint so the automatic quality loop can be tested
// deterministically without an API key.
const GOOD_APP = `import React from 'react';
import { View, Text } from 'react-native';
export default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Text>Fixed and working</Text></View>; }`;

const LISTING = JSON.stringify({
  name: "Mock App",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a,b",
  category: "Utilities",
  bundleId: "com.appmaker.mock",
  primaryColor: "#123456",
  iconEmoji: "🧪",
  privacyNotes: "None",
});

const reply = (code: string) =>
  `<plan>Mock</plan>\n<file path="App.js">\n${code}\n</file>\n<listing>${LISTING}</listing>\n<summary>Mock reply</summary>`;

async function mockAI(page: Page, responses: string[]) {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route: Route) => {
    prompts.push(JSON.parse(route.request().postData() || "{}").prompt);
    const body = responses[Math.min(prompts.length - 1, responses.length - 1)];
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body });
  });
  return prompts;
}

async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("anything");
  await page.keyboard.press("Enter");
  return page.frameLocator('iframe[title="App preview"]');
}

test("static quality issues are repaired automatically", async ({ page }) => {
  const bad = `import { NavigationContainer } from '@react-navigation/native';\nexport default function App() { return <div className="x" />; }`;
  const prompts = await mockAI(page, [reply(bad), reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("Automatic quality check");
  expect(prompts[1]).toContain("@react-navigation/native");
  expect(prompts[1]).toContain("className");
  await expect(page.getByText("Quality check found a problem")).toBeVisible();
});

test("runtime crashes are repaired automatically", async ({ page }) => {
  const crash = `import { View } from 'react-native';\nexport default function App() { const x = undefined; return <View>{x.boom}</View>; }`;
  const prompts = await mockAI(page, [reply(crash), reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("boom");
});

test("auto-repair stops after its budget and hands back to the user", async ({ page }) => {
  const crash = `import { View } from 'react-native';\nexport default function App() { return <View>{undefined.boom}</View>; }`;
  const prompts = await mockAI(page, [reply(crash)]);
  await start(page);
  await expect(page.getByRole("button", { name: "Fix with AI" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  expect(prompts).toHaveLength(3); // the request + at most 2 automatic repairs
});

test("files outside the project are never accepted", async ({ page }) => {
  const evil = reply(GOOD_APP).replace("<listing>", '<file path="../../evil.js">\nx\n</file>\n<file path="package.json">\n{}\n</file>\n<listing>');
  const prompts = await mockAI(page, [evil, reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Code" }).click();
  await expect(page.getByRole("button", { name: /evil|package\.json/ })).toHaveCount(0);
  expect(prompts[1] ?? "").toContain("was ignored");
});
