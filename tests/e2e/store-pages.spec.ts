import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Hosted support page and privacy policy. Needs TEST_DATABASE_URL (accounts).
test.skip(!process.env.TEST_DATABASE_URL, "needs a database");

test("creates the support page and privacy policy, links them in the listing, and keeps them up to date", async ({ page }) => {
  const email = `pages-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();

  const box = page.getByRole("region", { name: /Support page, privacy policy & terms/ });
  await expect(box.getByLabel("Contact email for customers")).toHaveValue(email);
  await box.getByLabel("Business or developer name").fill("Habit Co");
  await expect(box.getByText(/The privacy policy covers/)).toContainText("data saved on the device");
  await box.getByRole("button", { name: "Create support, privacy & terms pages" }).click();
  await expect(box.getByText("Up to date, and linked in the listing")).toBeVisible();

  const privacyUrl = await page.getByLabel("Privacy policy URL").inputValue();
  const supportUrl = await page.getByLabel("Support page URL").inputValue();
  expect(privacyUrl).toMatch(/\/legal\/[\w-]+\/privacy$/);
  expect(supportUrl).toMatch(/\/legal\/[\w-]+\/support$/);
  await expect(page.getByText("Privacy policy link", { exact: true })).toBeVisible();

  // The pages are public and readable.
  const pub = await page.context().newPage();
  await pub.goto(privacyUrl);
  await expect(pub.getByRole("heading", { level: 1 })).toContainText("Privacy policy");
  await expect(pub.getByRole("heading", { name: "Information stored on your device" })).toBeVisible();
  await expect(pub.getByRole("link", { name: `Email ${email}` })).toHaveAttribute("href", `mailto:${email}`);
  const axe = await new AxeBuilder({ page: pub }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await pub.goto(supportUrl);
  await expect(pub.getByRole("heading", { level: 1 })).toContainText("Support");
  await pub.close();

  // Changing a detail offers an update, which keeps the same links.
  await box.getByLabel("Business or developer name").fill("Habit Company");
  await expect(box.getByRole("button", { name: "Update the pages" })).toBeVisible();
  await box.getByRole("button", { name: "Update the pages" }).click();
  await expect(box.getByText("Up to date, and linked in the listing")).toBeVisible();
  expect(await page.getByLabel("Privacy policy URL").inputValue()).toBe(privacyUrl);
});

test("unknown store pages are not found", async ({ page }) => {
  const res = await page.goto("/legal/nothing-here-123/privacy");
  expect(res?.status()).toBe(404);
});

test("without an account: copy or download the pages for your own website, then paste the links", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();

  const box = page.getByRole("region", { name: /Support page, privacy policy & terms/ });
  await box.getByLabel("Business or developer name").fill("Habit Co");
  await expect(box.getByRole("heading", { name: "Option 2: host them on your own site" })).toBeVisible();
  await expect(box.getByRole("note", { name: "You're responsible for these pages" })).toContainText("not legal advice");
  await expect(box.getByRole("link", { name: "sites.google.com" })).toHaveAttribute("href", "https://sites.google.com/new");

  const download = page.waitForEvent("download");
  await box.getByRole("button", { name: "Download privacy-policy.html" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("privacy-policy.html");
  const html = readFileSync((await file.path())!, "utf8");
  expect(html).toContain("<!doctype html>");
  expect(html).toContain("Habit Co");
  expect(html).toContain("[your email]");

  // A link pasted here goes into the store listing.
  await box.getByLabel("Your privacy policy link").fill("https://habitco.example/privacy");
  await expect(page.getByLabel("Privacy policy URL")).toHaveValue("https://habitco.example/privacy");
  await expect(box.getByText(/Both links need to be full web addresses/)).toBeVisible();
  await box.getByLabel("Your support page link").fill("https://habitco.example/support");
  await expect(box.getByText(/Both links need to be full web addresses/)).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).include('[aria-labelledby="store-pages-title"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});
