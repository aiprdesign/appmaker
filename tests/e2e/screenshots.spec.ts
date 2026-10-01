import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { expect, test } from "@playwright/test";

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test("capture screens, write headlines, and download store-ready images", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();

  const section = page.getByRole("region", { name: "Store screenshots" });
  await section.scrollIntoViewIfNeeded();
  const phone = section.frameLocator('iframe[title="App preview"]');
  await expect(phone.getByText("Kicked off the project")).toBeVisible({ timeout: 20_000 });
  await section.getByRole("button", { name: "Capture this screen" }).click();
  await expect(section.getByRole("img", { name: /Store image:/ })).toHaveCount(1, { timeout: 20_000 });
  await phone.getByText("Write", { exact: true }).click();
  await expect(phone.getByText("New entry")).toBeVisible();
  await section.getByRole("button", { name: "Capture this screen" }).click();
  await expect(section.getByRole("img", { name: /Store image:/ })).toHaveCount(2, { timeout: 20_000 });

  // The app runs on iPad too, so it asks for iPad screens; capture one.
  await expect(section.getByText(/the App Store also needs iPad screenshots/)).toBeVisible();
  await section.getByRole("button", { name: "iPad", exact: true }).click();
  await expect(phone.getByText("Kicked off the project")).toBeVisible({ timeout: 20_000 });
  expect(await phone.locator("body").evaluate(() => innerWidth)).toBe(1032);
  await section.getByRole("button", { name: "Capture this screen" }).click();
  await expect(section.getByRole("img", { name: /Store image:/ })).toHaveCount(3, { timeout: 20_000 });
  await expect(section.getByText(/the App Store also needs iPad screenshots/)).toHaveCount(0);
  await section.getByRole("button", { name: "Remove screenshot 3" }).focus();
  await section.getByRole("button", { name: "iPhone", exact: true }).click();

  // Headlines: written by the AI (simulated here), then edited by hand.
  await page.route("**/api/captions", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.screens[1]).toContain("New entry");
    await route.fulfill({
      json: {
        captions: [
          { title: "Your dreams, remembered", subtitle: "Every entry in one place" },
          { title: "Write it down", subtitle: "Add a mood to each entry" },
        ],
      },
    });
  });
  await section.getByRole("button", { name: "Write headlines with AI" }).click();
  await expect(section.getByLabel("Headline 1")).toHaveValue("Your dreams, remembered");
  await section.getByLabel("Headline 2").fill("The best journal ever");
  await expect(section.getByText(/Claim-safe wording: rewrite “best”/)).toBeVisible();
  await section.getByLabel("Headline 2").fill("Write it down");
  await section.getByRole("radio", { name: "Dark" }).click();

  // Kept in the browser.
  await page.reload();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByLabel("Headline 2")).toHaveValue("Write it down");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all images" }).click()]);
  expect(download.suggestedFilename()).toMatch(/-store-images\.zip$/);
  const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
  const names = Object.keys(zip.files)
    .filter((n) => !n.endsWith("/"))
    .sort();
  expect(names).toEqual([
    "README.txt",
    "app-store-ipad/01.png",
    "app-store/01.png",
    "app-store/02.png",
    "google-play/01.png",
    "google-play/02.png",
    "google-play/feature-graphic.png",
    "plain/app-store-01.png",
    "plain/app-store-02.png",
    "plain/app-store-ipad-01.png",
    "plain/google-play-01.png",
    "plain/google-play-02.png",
  ]);
  const size = async (n: string) => pngSize(Buffer.from(await zip.file(n)!.async("uint8array")));
  expect(await size("app-store/01.png")).toEqual({ w: 1290, h: 2796 });
  expect(await size("google-play/02.png")).toEqual({ w: 1080, h: 1920 });
  expect(await size("google-play/feature-graphic.png")).toEqual({ w: 1024, h: 500 });
  expect(await size("plain/app-store-02.png")).toEqual({ w: 1290, h: 2796 });
  expect(await size("app-store-ipad/01.png")).toEqual({ w: 2064, h: 2752 });
  expect(await size("plain/app-store-ipad-01.png")).toEqual({ w: 2064, h: 2752 });
});

test("iPad: preview the app at iPad size, or turn iPad off in the listing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "iPad", exact: true }).click();
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 15_000 });
  expect(await app.locator("body").evaluate(() => ({ w: innerWidth, h: innerHeight }))).toEqual({ w: 1032, h: 1376 });
  // The quality checks pass at iPad size too.
  await page.waitForTimeout(2500);
  await expect(page.getByText("The quality check found something to improve")).toHaveCount(0);
  await expect(page.getByText("The layout doesn't fill the screen")).toHaveCount(0);

  await page.getByRole("button", { name: "Publish" }).first().click();
  const ipad = page.getByRole("checkbox", { name: /Also for iPad/ });
  await expect(ipad).toBeChecked();
  await ipad.uncheck();
  await expect(page.getByRole("region", { name: "Store screenshots" }).getByRole("button", { name: "iPad", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "iPad", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "iPhone", exact: true })).toHaveAttribute("aria-pressed", "true");
});
