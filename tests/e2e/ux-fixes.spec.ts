import { expect, test, type Page, type Route } from "@playwright/test";

// Covers the UX fixes: versions & restore, retry, interrupted builds, leave
// warning, progress, clickable files, code editor Tab, templates, demo notice.

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

const app = (label: string, suggestions = "- Add a settings screen\n- Add reminders") =>
  `<plan>Mock</plan>\n<file path="App.js">\nimport React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Text>${label}</Text></View>; }\n</file>\n<listing>${LISTING}</listing>\n<summary>Built ${label}.\n\n${suggestions}</summary>`;

async function mockAI(page: Page, handler: (n: number, body: { prompt: string }) => Promise<{ status?: number; body: string; delay?: number }>) {
  let n = 0;
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route: Route) => {
    const body = route.request().postDataJSON();
    prompts.push(body.prompt);
    const r = await handler(n++, body);
    if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
    await route
      .fulfill({ status: r.status ?? 200, contentType: r.status && r.status >= 400 ? "application/json" : "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: r.body })
      .catch(() => {});
  });
  return prompts;
}

async function start(page: Page, prompt = "A test app") {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill(prompt);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  return page.frameLocator('iframe[title="App preview"]');
}

test("every change is saved as a version and can be restored", async ({ page }) => {
  await mockAI(page, async (n) => ({ body: app(n === 0 ? "Version one" : "Version two") }));
  const preview = await start(page);
  await expect(preview.getByText("Version one")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Message").fill("Change the text");
  await page.keyboard.press("Enter");
  await expect(preview.getByText("Version two")).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole("button", { name: "Version history" })).toContainText("2");
  await page.getByRole("button", { name: "Restore this version" }).first().click();
  await expect(preview.getByText("Version one")).toBeVisible();
  await expect(page.getByText(/Restored the version from/).first()).toBeVisible();

  // Restoring is itself undoable from History.
  await page.getByRole("button", { name: "Version history" }).click();
  const versions = page.getByRole("list", { name: "Versions" });
  await expect(versions.getByText("Change the text")).toBeVisible();
  await versions.getByRole("listitem").filter({ hasText: "Change the text" }).getByRole("button", { name: "Restore" }).click();
  await expect(preview.getByText("Version two")).toBeVisible();
});

test("failed requests explain themselves and can be retried without retyping", async ({ page }) => {
  const prompts = await mockAI(page, async (n) => (n === 0 ? { status: 500, body: '{"error":"Request failed (500)"}' } : { body: app("Worked on retry") }));
  const preview = await start(page, "A retry test app");
  await expect(page.getByText(/Something went wrong on our side/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(preview.getByText("Worked on retry")).toBeVisible({ timeout: 15_000 });
  expect(prompts).toEqual(["A retry test app", "A retry test app"]);
  // The request isn't duplicated in the chat.
  await expect(page.locator("aside").getByText("A retry test app", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("a build interrupted by reloading can be run again", async ({ page }) => {
  await mockAI(page, async (n) => (n === 0 ? { body: app("never"), delay: 20_000 } : { body: app("Recovered build") }));
  page.on("dialog", (d) => d.accept());
  await start(page, "An interrupted app");
  await expect(page.getByText("Understanding your idea").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your last request was interrupted")).toBeVisible();
  await expect(page.getByText(/Failed to fetch/)).toHaveCount(0);
  await page.getByRole("button", { name: "Run it again" }).click();
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Recovered build")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your last request was interrupted")).toHaveCount(0);
});

test("leaving mid-build asks for confirmation", async ({ page }) => {
  await mockAI(page, async () => ({ body: app("slow"), delay: 20_000 }));
  await start(page);
  await expect(page.getByText("Understanding your idea").first()).toBeVisible();
  const dialog = page.waitForEvent("dialog");
  page.goto("/projects").catch(() => {});
  const d = await dialog;
  expect(d.type()).toBe("beforeunload");
  await d.dismiss();
});

test("progress shows a timer and stages", async ({ page }) => {
  await mockAI(page, async () => ({ body: app("done"), delay: 3_000 }));
  await start(page);
  await expect(page.getByLabel("Time elapsed")).toHaveText(/0:0[1-3]/, { timeout: 5_000 });
  await expect(page.getByRole("list", { name: "Progress" })).toContainText("Writing code");
});

test("AI suggestions become one-click chips, and file names open the code", async ({ page }) => {
  const prompts = await mockAI(page, async () => ({ body: app("Chips", "- Add a dark theme toggle\n- Add weekly reminders") }));
  const preview = await start(page);
  await expect(preview.getByText("Chips")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Add weekly reminders" }).click();
  await expect.poll(() => prompts.at(-1)).toBe("Add weekly reminders");

  await page.getByRole("button", { name: "App.js" }).first().click();
  const editor = page.getByLabel("Source of App.js");
  await expect(editor).toBeVisible();
  // Tab indents instead of leaving the editor.
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(/^ {2}import React/);
});

test("the error banner sits above the phone, not over the app", async ({ page }) => {
  const crash = `<plan>x</plan>\n<file path="App.js">\nimport { View } from 'react-native';\nexport default function App() { return <View>{undefined.boom}</View>; }\n</file>\n<listing>${LISTING}</listing>\n<summary>x</summary>`;
  await mockAI(page, async () => ({ body: crash }));
  await start(page);
  const banner = page.getByRole("alert").filter({ hasText: "The app hit an error" });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const b = (await banner.boundingBox())!;
  const phone = (await page.locator('iframe[title="App preview"]').boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(phone.y);
});

test("templates fill in the prompt for review instead of building", async ({ page }) => {
  await page.goto("/");
  await page.locator("#templates").getByRole("button", { name: /Recipe box/ }).click();
  await expect(page).toHaveURL(/\/$|\/#/);
  await expect(page.getByLabel("Describe your app")).toHaveValue(/recipe app/i);
  await expect(page.getByLabel("Describe your app")).toBeFocused();
});

test("demo mode is explained before building", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Demo mode: no AI key is set up yet/)).toBeVisible();
  await page.getByRole("button", { name: "Add an API key" }).click();
  await expect(page.getByRole("dialog", { name: "AI model settings" })).toBeVisible();
});

test("long prompts show a counter and can't be sent", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("x".repeat(8100));
  await expect(page.getByText("8,100/8,000")).toBeVisible();
  await expect(page.getByRole("button", { name: "Build app" })).toBeDisabled();
});
