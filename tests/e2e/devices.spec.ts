import { expect, test, type Page, type Route } from "@playwright/test";

// Testing on real devices: Expo Snack's emulators / Expo Go, and a QR code
// to install finished Android builds. Snack and Expo are mocked.

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
const APP = `import React from 'react';\nimport { Text } from 'react-native';\nimport * as Haptics from 'expo-haptics';\nexport default function App() { return <Text>Hi</Text>; }`;

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

test("Test on a device opens the app in Expo Snack for the chosen device", async ({ page }) => {
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
  await menu.getByRole("menuitem", { name: /Your own phone/ }).click();
  await (await popup).waitForLoadState();
  await expect(menu).toBeHidden();

  expect(posts).toHaveLength(1);
  expect(posts[0].get("platform")).toBe("mydevice");
  expect(posts[0].get("name")).toBe("Streaks");
  expect(posts[0].get("dependencies")!.split(",")).toContain("expo-haptics");
  expect(posts[0].get("dependencies")!.split(",")).not.toContain("react-native");
  expect(JSON.parse(posts[0].get("files")!)["App.js"].contents).toContain("<Text>Hi</Text>");

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
