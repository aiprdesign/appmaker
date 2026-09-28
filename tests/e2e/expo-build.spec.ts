import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// Building and uploading with Expo from the Publish tab. Expo itself is
// mocked at our API routes; the server side is covered by unit tests.

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
const APP = `import React from 'react';\nimport { Text } from 'react-native';\nexport default function App() { return <Text>Hi</Text>; }`;
const LINK = { projectId: "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11", owner: "alice", slug: "streaks" };
const BUILD_ID = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const P8 = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----\n";

async function openPublish(page: Page) {
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
  await page.getByRole("button", { name: "Publish" }).first().click();
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

test("connect Expo, set up Apple upload, build for the App Store and follow its status", async ({ page }) => {
  const calls: Record<string, Record<string, unknown>[]> = { account: [], link: [], build: [], builds: [] };
  let statusCalls = 0;
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true });
    const body = route.request().postDataJSON();
    calls[name].push(body);
    if (name === "account") {
      return body.token === "expo_good_token_123456" ? json(route, { name: "alice", account: "alice", available: true }) : json(route, { error: "Expo didn't accept this access token.", code: "auth" }, 401);
    }
    if (name === "link") return json(route, { link: LINK });
    if (name === "build") {
      return json(route, {
        builds: [{ id: BUILD_ID, target: "ios", status: "IN_QUEUE", createdAt: Date.now(), queuePosition: 2, submission: { status: "AWAITING_BUILD" } }],
      });
    }
    statusCalls++;
    return json(route, {
      builds: [
        {
          id: BUILD_ID,
          target: "ios",
          status: "FINISHED",
          createdAt: Date.now(),
          appVersion: "1.0.0",
          buildNumber: "1",
          artifactUrl: "https://expo.dev/artifacts/eas/app.ipa",
          submission: { status: "FINISHED" },
        },
      ],
    });
  });
  await page.clock.install();
  await openPublish(page);

  const section = page.getByRole("region", { name: /Build & upload with Expo/ });
  await expect(section).toBeVisible();
  const buildButton = section.getByRole("button", { name: "Build for iPhone" });
  await expect(buildButton).toBeDisabled();

  // A wrong token is explained, a right one connects.
  await section.getByLabel("Expo access token").fill("expo_bad_token_1234567");
  await section.getByRole("button", { name: "Connect" }).click();
  await expect(section.getByRole("alert")).toContainText("didn't accept");
  await section.getByLabel("Expo access token").fill("expo_good_token_123456");
  await section.getByRole("button", { name: "Connect" }).click();
  await expect(section.getByText("Connected as")).toContainText("alice");

  // Apple setup: App Store Connect app ID and API key enable automatic upload.
  const upload = section.getByRole("checkbox", { name: /Upload to App Store Connect/ });
  await expect(upload).toBeDisabled();
  await section.getByRole("button", { name: /Apple setup/ }).click();
  // Without an API key, the command-line route is offered as a fallback.
  await section.getByText("No API key? Set up signing from the command line instead").click();
  await expect(section.getByText("npx eas-cli@latest credentials:configure-build --platform ios --profile production")).toBeVisible();
  await section.getByLabel("App Store Connect Apple ID").fill("6741234567");
  await section.getByLabel("Issuer ID").fill("57246542-96fe-1a63-e053-0824d011072a");
  await section.locator('input[type="file"]').setInputFiles({ name: "AuthKey_2X9R4HXF34.p8", mimeType: "text/plain", buffer: Buffer.from(P8) });
  await expect(section.getByLabel("Key ID")).toHaveValue("2X9R4HXF34");
  await expect(upload).toBeEnabled();
  await expect(upload).toBeChecked();

  await section.getByRole("button", { name: "Build & upload to App Store Connect" }).click();
  const builds = section.getByRole("list", { name: "Builds" });
  await expect(builds.getByText("App Store build")).toBeVisible();
  await expect(builds.getByText("In queue (#2)")).toBeVisible();
  await expect(builds.getByText(/Will upload to App Store Connect/)).toBeVisible();
  await expect(builds.getByRole("link", { name: "View on expo.dev" })).toHaveAttribute("href", `https://expo.dev/accounts/alice/projects/streaks/builds/${BUILD_ID}`);

  // The app was linked once, then built with the upload settings.
  expect(calls.link).toHaveLength(1);
  expect(calls.build[0]).toMatchObject({ token: "expo_good_token_123456", target: "ios", submit: true, ascAppId: "6741234567", link: LINK });
  expect((calls.build[0].ascKey as { keyId: string }).keyId).toBe("2X9R4HXF34");
  expect(calls.build[0].icon).toMatch(/^iVBOR/);

  // Status is polled until the build is done and uploaded.
  await page.clock.runFor(21_000);
  await expect(builds.getByText("Ready")).toBeVisible();
  await expect(builds.getByText(/Uploaded to App Store Connect/)).toBeVisible();
  await expect(builds.getByRole("link", { name: "Download .ipa" })).toHaveAttribute("href", "https://expo.dev/artifacts/eas/app.ipa");
  await expect(section.getByText("Last steps in App Store Connect")).toBeVisible();
  expect(statusCalls).toBeGreaterThan(0);

  // The fully expanded section (Apple setup open, builds listed) meets WCAG AA.
  const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="expo-build-title"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Everything survives a reload; the finished build isn't polled again.
  await page.reload();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByRole("list", { name: "Builds" }).getByText("Ready")).toBeVisible();
  await expect(page.getByText("Connected as")).toBeVisible();
});

test("missing Apple signing opens the one-time setup with the fix", async ({ page }) => {
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true });
    if (name === "account") return json(route, { name: "alice", account: "alice", available: true });
    if (name === "link") return json(route, { link: LINK });
    return json(route, { error: "Apple signing isn't set up for this app yet. Do the one-time Apple setup below, then build again.", code: "ios-credentials" }, 409);
  });
  await openPublish(page);
  const section = page.getByRole("region", { name: /Build & upload with Expo/ });
  await section.getByLabel("Expo access token").fill("expo_good_token_123456");
  await section.getByRole("button", { name: "Connect" }).click();
  await section.getByRole("button", { name: "Build for iPhone" }).click();
  await expect(section.getByRole("alert")).toContainText("Apple signing isn't set up");
  await expect(section.getByRole("button", { name: /Apple setup/ })).toHaveAttribute("aria-expanded", "true");
  await expect(section.getByText("b. App Store Connect API key (recommended)")).toBeVisible();
  await expect(section.getByText("No API key? Set up signing from the command line instead")).toBeVisible();
});

test("hosted builds: no Expo account, Appmaker signs the iPhone app with the user's Apple API key", async ({ page }) => {
  const builds: Record<string, unknown>[] = [];
  const links: Record<string, unknown>[] = [];
  const SIGNING = { issuerId: "57246542-96fe-1a63-e053-0824d011072a", certificateId: "CERT123456", p12: "MIIabc", password: "pw", expires: "2027-09-28T00:00:00.000Z" };
  await page.route("**/api/eas/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() === "GET") return json(route, { available: true, hosted: true });
    const body = route.request().postDataJSON();
    if (name === "link") {
      links.push(body);
      return json(route, { link: { ...LINK, owner: "appmaker-builds" } });
    }
    if (name === "build") {
      builds.push(body);
      return json(route, {
        builds: [{ id: `${BUILD_ID.slice(0, -1)}${builds.length}`, target: "ios", status: "IN_QUEUE", createdAt: Date.now() + builds.length }],
        ...(builds.length === 1 ? { signing: SIGNING } : {}),
      });
    }
    return json(route, { builds: [] });
  });
  await openPublish(page);
  const section = page.getByRole("region", { name: /Build & upload with Expo/ });
  await expect(section.getByText(/no Mac, Xcode or Expo account needed/)).toBeVisible();
  await expect(section.getByText("Expo builds are included")).toBeVisible();
  await expect(section.getByLabel("Expo access token")).toBeHidden();

  // iPhone builds wait for the Apple API key; there's no command-line fallback.
  const build = section.getByRole("button", { name: "Build for iPhone" });
  await expect(build).toBeDisabled();
  await expect(section.getByText(/Add your App Store Connect API key in Apple setup/)).toBeVisible();
  await section.getByRole("button", { name: /Apple setup/ }).click();
  await expect(section.getByText("b. App Store Connect API key (required)")).toBeVisible();
  await expect(section.getByText(/Set up signing from the command line/)).toHaveCount(0);
  await section.getByLabel("Issuer ID").fill(SIGNING.issuerId);
  await section.locator('input[type="file"]').setInputFiles({ name: "AuthKey_2X9R4HXF34.p8", mimeType: "text/plain", buffer: Buffer.from(P8) });
  await expect(build).toBeEnabled();

  await build.click();
  await expect(section.getByRole("list", { name: "Builds" }).getByText("App Store build")).toHaveCount(1);
  expect(links[0].token).toBeUndefined();
  expect(builds[0].token).toBeUndefined();
  expect(builds[0].signing).toBeUndefined();
  expect((builds[0].ascKey as { issuerId: string }).issuerId).toBe(SIGNING.issuerId);
  // Builds on the site's account aren't viewable on expo.dev by the user.
  await expect(section.getByRole("link", { name: "View on expo.dev" })).toHaveCount(0);
  await expect(section.getByText(/Signing certificate created by Appmaker/)).toBeVisible();

  // The certificate Appmaker made is sent back on the next build (Apple allows only a few).
  await build.click();
  await expect(section.getByRole("list", { name: "Builds" }).getByText("App Store build")).toHaveCount(2);
  expect(builds[1].signing).toEqual(SIGNING);
  expect(links).toHaveLength(1);

  // Users can still switch to their own Expo account.
  await section.getByText("Use my own Expo account instead (optional)").click();
  await expect(section.getByLabel("Expo access token")).toBeVisible();
});

test("Android test builds need no Apple setup, and servers without EAS say so", async ({ page }) => {
  await page.route("**/api/eas/**", (route) => json(route, { available: false }));
  await openPublish(page);
  const section = page.getByRole("region", { name: /Build & upload with Expo/ });
  await expect(section.getByText(/Cloud builds aren.t enabled on this server/)).toBeVisible();
  await section.getByRole("radio", { name: /Android — test app/ }).click();
  await expect(section.getByRole("button", { name: /Apple setup/ })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Build Android test app" })).toBeDisabled();
});
