import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// Testing on real devices: the user's phone with Expo Go (EAS Update), Expo
// Snack's emulators, and a QR code to install finished Android builds. Snack
// and Expo are mocked.

const LISTING = JSON.stringify({
  name: "Streaks",
  subtitle: "Daily habits",
  description: "d".repeat(120),
  keywords: "habits",
  category: "Productivity",
  bundleId: "com.acme.streaks",
  primaryColor: "#6440F0",
  iconEmoji: "🔥",
  privacyNotes: "None",
});
// A clean app (fills the screen, readable), so no automatic quality fix rebuilds it mid-test.
const APP = `import React from 'react';\nimport { View, Text } from 'react-native';\nimport * as Haptics from 'expo-haptics';\nexport default function App() { return <View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}><Text style={{ fontSize: 16, color: '#111827' }}>Hi</Text></View>; }`;

async function buildApp(page: Page) {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${APP}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Hi")).toBeVisible();
}

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

test("Test on a device opens the app in Expo Snack's emulators", async ({ page }) => {
  const posts: URLSearchParams[] = [];
  await page.context().route("https://snack.expo.dev/**", (route) => {
    posts.push(new URLSearchParams(route.request().postData() ?? ""));
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>Snack</title>" });
  });
  await buildApp(page);

  const button = page.getByRole("button", { name: "Test on a device" });
  await button.click();
  const menu = page.getByRole("menu", { name: "Test on a device" });
  await expect(menu.getByRole("menuitem")).toHaveCount(3);

  const popup = page.waitForEvent("popup");
  await menu.getByRole("menuitem", { name: /iPhone emulator/ }).click();
  await (await popup).waitForLoadState();
  await expect(menu).toBeHidden();

  expect(posts).toHaveLength(1);
  expect(posts[0].get("platform")).toBe("ios");
  expect(posts[0].get("name")).toBe("Streaks");
  expect(posts[0].get("dependencies")!.split(",")).toContain("expo-haptics");
  expect(posts[0].get("dependencies")!.split(",")).not.toContain("react-native");
  expect(JSON.parse(posts[0].get("files")!)["App.js"].contents).toContain(">Hi</Text>");

  // Escape closes the menu.
  await button.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("a finished Android test build shows a QR code to install it", async ({ page }) => {
  const APK = "https://expo.dev/artifacts/eas/streaks.apk";
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true, hosted: true });
    if (name === "link") return json(route, { link: { projectId: "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11", owner: "appmaker-builds", slug: "streaks", hosted: true } });
    return json(route, {
      builds: [{ id: "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", target: "android-apk", status: "FINISHED", createdAt: Date.now(), artifactUrl: APK }],
    });
  });
  await buildApp(page);
  await page.getByRole("button", { name: "Publish" }).first().click();
  const section = page.getByRole("region", { name: /Build & upload with Expo/ });
  await section.getByRole("radio", { name: /Android — test app/ }).click();
  await section.getByRole("button", { name: "Build Android test app" }).click();

  const qr = section.getByRole("img", { name: "QR code to install this build on an Android phone" });
  await expect(qr).toHaveAttribute("data-qr-value", APK);
  await expect(qr.locator("svg")).toBeVisible();
  await expect(section.getByText(/Scan with your Android phone/)).toBeVisible();
});

const GROUP = "7a1b2c3d-0000-4000-8000-00000000abcd";
const EXPO_GO_URL = `exp://u.expo.dev/0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11/group/${GROUP}`;

test("Your phone (Expo Go): publishes the app and shows a QR code to open it", async ({ page }) => {
  const calls: Record<string, Record<string, unknown>[]> = { link: [], update: [] };
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true, hosted: true });
    calls[name]?.push(route.request().postDataJSON());
    if (name === "link") return json(route, { link: { projectId: "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11", owner: "appmaker-builds", slug: "streaks" } });
    if (name === "update") {
      await new Promise((r) => setTimeout(r, 1500));
      return json(route, { preview: { groupId: GROUP, url: EXPO_GO_URL, platforms: ["android", "ios"], publishedAt: Date.now() } });
    }
    return json(route, { builds: [] });
  });
  await buildApp(page);

  await page.getByRole("button", { name: "Test on a device" }).click();
  await page.getByRole("menuitem", { name: /Your phone \(Expo Go\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Try it on your phone" });
  await expect(dialog.getByRole("link", { name: "App Store" })).toHaveAttribute("href", /apps\.apple\.com/);
  await dialog.getByRole("button", { name: "Make a QR code for my phone" }).click();
  await expect(dialog.getByRole("status")).toContainText("Publishing your app for Expo Go");

  const qr = dialog.getByRole("img", { name: "QR code to open this app in Expo Go" });
  await expect(qr).toHaveAttribute("data-qr-value", EXPO_GO_URL);
  await expect(qr.locator("svg")).toBeVisible();
  await expect(dialog.getByText("Up to date with your latest changes.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "On this phone? Open in Expo Go" })).toHaveAttribute("href", EXPO_GO_URL);
  await expect(dialog.getByRole("button", { name: /QR code/ })).toHaveCount(0);

  // Linked once on the site's account (no token), then published with the app's code.
  expect(calls.link).toHaveLength(1);
  expect(calls.update).toHaveLength(1);
  expect(calls.update[0].token).toBeUndefined();
  expect((calls.update[0].project as { files: Record<string, string> }).files["App.js"]).toContain(">Hi</Text>");
  expect(calls.update[0].link).toMatchObject({ slug: "streaks" });
  // Shows which Expo project and account it lives in, and can set it up again.
  await expect(dialog.getByRole("link", { name: "appmaker-builds/streaks" })).toHaveAttribute("href", "https://expo.dev/accounts/appmaker-builds/projects/streaks");
  await expect(dialog.getByText("Expo Go only opens it when signed in to the")).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Escape closes it; the QR code is kept with the app and reopens without publishing again.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Test on a device" }).click();
  await page.getByRole("menuitem", { name: /Your phone \(Expo Go\)/ }).click();
  await expect(dialog.getByRole("img", { name: "QR code to open this app in Expo Go" })).toHaveAttribute("data-qr-value", EXPO_GO_URL);
  await expect(dialog.getByText("Up to date with your latest changes.")).toBeVisible();
  expect(calls.update).toHaveLength(1);
  await dialog.getByRole("button", { name: "Set up again" }).click();
  await expect.poll(() => calls.update.length).toBe(2);
  expect(calls.link).toHaveLength(2);
});

test("Your phone (Expo Go): explains what's needed when the site has no Expo account", async ({ page }) => {
  await page.route("**/api/eas/**", (route) => json(route, { available: true, hosted: false }));
  await buildApp(page);
  await page.getByRole("button", { name: "Test on a device" }).click();
  await page.getByRole("menuitem", { name: /Your phone \(Expo Go\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Try it on your phone" });
  await expect(dialog.getByText(/Connect your Expo account in the Publish tab/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /QR code/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("Your phone (Expo Go): shows Expo's error and lets you try again", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true, hosted: true });
    if (name === "link") return json(route, { link: { projectId: "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11", owner: "appmaker-builds", slug: "streaks" } });
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Expo couldn't publish the preview:\nSomething broke" }) });
    return json(route, { preview: { groupId: GROUP, url: EXPO_GO_URL, platforms: ["android", "ios"], publishedAt: Date.now() } });
  });
  await buildApp(page);
  await page.getByRole("button", { name: "Test on a device" }).click();
  await page.getByRole("menuitem", { name: /Your phone \(Expo Go\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Try it on your phone" });
  await dialog.getByRole("button", { name: "Make a QR code for my phone" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Something broke");
  await dialog.getByRole("button", { name: "Make a QR code for my phone" }).click();
  await expect(dialog.getByRole("img", { name: "QR code to open this app in Expo Go" })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
