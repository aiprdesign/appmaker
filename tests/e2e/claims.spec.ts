import { expect, test, type Page, type Route } from "@playwright/test";

// Claim-safe wording: on by default, checked after every build, and
// repaired in the automatic fix pass. The AI endpoint is simulated.

const listing = (subtitle: string) =>
  JSON.stringify({
    name: "Streakly",
    subtitle,
    description: "Streakly keeps track of your daily habits and shows your longest streak. ".repeat(3),
    keywords: "habits",
    category: "Productivity",
    bundleId: "com.acme.streakly",
    primaryColor: "#6440F0",
    iconEmoji: "✅",
    privacyNotes: "None",
  });

const app = (text: string) =>
  `import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Text>${text}</Text></View>; }`;
const reply = (text: string, subtitle: string) =>
  `<plan>x</plan>\n<file path="App.js">\n${app(text)}\n</file>\n<listing>${listing(subtitle)}</listing>\n<summary>ok</summary>`;

async function mockAI(page: Page, responses: string[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route: Route) => {
    bodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: responses[Math.min(bodies.length - 1, responses.length - 1)] });
  });
  return bodies;
}

test("claims in the app and listing are rewritten automatically (claim-safe is the default)", async ({ page }) => {
  const bodies = await mockAI(page, [reply("The best habit tracker. Never miss a day!", "The #1 habit app"), reply("Track your daily habits", "Daily habit tracker")]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Wording: Claim-safe" })).toBeVisible();
  await page.getByLabel("Describe your app").fill("a habit tracker");
  await page.keyboard.press("Enter");
  const preview = page.frameLocator('iframe[title="App preview"]');
  await expect(preview.getByText("Track your daily habits")).toBeVisible({ timeout: 20_000 });

  expect(bodies[0].wording).toBe("claim-safe");
  const fix = String(bodies[1].prompt);
  expect(fix).toMatch(/Claim-safe wording is on/);
  expect(fix).toMatch(/"best"/);
  expect(fix).toMatch(/"Never"/);
  expect(fix).toMatch(/Store listing: subtitle: "#1"/);
  expect(bodies).toHaveLength(2);

  // The Publish checklist confirms the result.
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("Claim-safe wording (no marketing claims)")).toBeVisible();
});

test("standard wording skips the claim check, and the choice is remembered", async ({ page }) => {
  const bodies = await mockAI(page, [reply("The best habit tracker", "The #1 habit app")]);
  await page.goto("/");
  await page.getByRole("button", { name: "Wording: Claim-safe" }).click();
  await page.getByRole("radio", { name: /Standard/ }).click();
  await expect(page.getByRole("button", { name: "Wording: Standard" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Wording: Standard" })).toBeVisible();

  await page.getByLabel("Describe your app").fill("a habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("The best habit tracker")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  expect(bodies).toHaveLength(1);
  expect(bodies[0].wording).toBe("standard");

  // It can be switched per app from the chat, too.
  await page.getByRole("button", { name: "Wording: Standard" }).click();
  await page.getByRole("radio", { name: /Claim-safe/ }).click();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText(/Found: “best” \(App\.js\), “#1” \(listing subtitle\)/)).toBeVisible();
});

test("a new version is shown only after all three checks pass", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  let releaseFix: () => void = () => {};
  const fixCanFinish = new Promise<void>((r) => (releaseFix = r));
  await page.route("**/api/generate", async (route: Route) => {
    bodies.push(JSON.parse(route.request().postData() || "{}"));
    if (bodies.length === 1) {
      return route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply("Cures insomnia. Clinically proven.", "Sleep tracker") });
    }
    await fixCanFinish;
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: reply("Track how you slept. This app is not a medical device and does not provide medical advice.", "Sleep log"),
    });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a sleep app");
  await page.keyboard.press("Enter");

  // While the fix runs, the phone shows the checks, never the unchecked app.
  const overlay = page.getByRole("status").filter({ hasText: "Your app appears once it passes all three." });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Health, medical & financial claims");
  const preview = page.frameLocator('iframe[title="App preview"]');
  await expect(preview.getByText(/Cures insomnia/)).toHaveCount(0);
  await expect.poll(() => bodies.length).toBe(2);
  expect(String(bodies[1].prompt)).toMatch(/Health, medical and financial claims check \(always on\)/);
  expect(String(bodies[1].prompt)).toMatch(/"Cures insomnia" \(disease claim\)/);
  expect(String(bodies[1].prompt)).toMatch(/"Clinically proven" \(medical endorsement\)/);

  releaseFix();
  await expect(preview.getByText(/Track how you slept/)).toBeVisible({ timeout: 20_000 });
  await expect(overlay).toHaveCount(0);
});

test("the wording menu, the Publish checklist and the FAQ say the app owner is responsible for the content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Who is responsible for what's in my app?")).toBeVisible();
  await page.getByRole("button", { name: /Wording: Claim-safe/ }).click();
  await expect(page.getByText(/You're responsible for everything in your app and its store listing/)).toBeVisible();
  await expect(page.getByText(/aren't legal advice/).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();
  const note = page.getByRole("note");
  await expect(note).toContainText("Your responsibility");
  await expect(note).toContainText("Make sure it's true, accurate and allowed");
});
