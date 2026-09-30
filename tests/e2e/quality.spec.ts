import { expect, test, type Page } from "@playwright/test";

async function buildDiary(page: Page) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
}

test("the preview's quality check flags hard-to-read text and small buttons", async ({ page }) => {
  await buildDiary(page);
  await page.getByRole("button", { name: "Code" }).click();
  await page.getByLabel("Source of App.js").fill(`import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
export default function App() {
  return (
    <View style={{ flex: 1, padding: 40, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 28, color: '#111827' }}>Pantry</Text>
      <Text style={{ fontSize: 14, color: '#D1D5DB' }}>Faint helper text one</Text>
      <Text style={{ fontSize: 14, color: '#D1D5DB' }}>Faint helper text two</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3].map((n) => <TouchableOpacity key={n} style={{ width: 24, height: 24, backgroundColor: '#1D4ED8' }} />)}
      </View>
    </View>
  );
}
`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("The quality check found something to improve")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Text is hard to read \(below WCAG AA contrast\): "Faint helper text o/)).toBeVisible();
  await expect(page.getByText(/Buttons smaller than 44pt, hard to tap: "icon" 24×24/)).toBeVisible();
});

test("👍 / 👎 on the latest version, with one-tap reasons", async ({ page }) => {
  await buildDiary(page);
  const chat = page.locator("aside");
  await chat.getByRole("button", { name: "Needs work" }).click();
  await expect(chat.getByRole("button", { name: "Needs work" })).toHaveAttribute("aria-pressed", "true");
  await chat.getByRole("radio", { name: "Looks wrong" }).click();
  await expect(chat.getByRole("radio", { name: "Looks wrong" })).toHaveAttribute("aria-checked", "true");
  // Demo mode can't edit apps, so there's no Fix it button here.
  await expect(chat.getByRole("button", { name: "Fix it" })).toHaveCount(0);
  // The vote is saved with the app.
  await page.reload();
  await expect(page.locator("aside").getByRole("button", { name: "Needs work" })).toHaveAttribute("aria-pressed", "true");
});

test("admin: the Quality tab counts what happens to apps", async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");
  await buildDiary(page);
  const chat = page.locator("aside");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/quality") && (r.postData() ?? "").includes("down:broken"));
  await chat.getByRole("button", { name: "Needs work" }).click();
  await chat.getByRole("radio", { name: "Something doesn't work" }).click();
  await sent;

  const admin = await (
    await page
      .context()
      .browser()!
      .newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.66.0.9" } })
  ).newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Admin password").fill("e2e-admin-password");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.getByRole("tab", { name: "quality" }).click();
  await expect(admin.getByRole("cell", { name: "👎 Something doesn't work" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: /Improve next:/ })).toBeVisible();
  await expect(admin.getByText(/Only anonymous counts are kept/)).toBeVisible();
});
