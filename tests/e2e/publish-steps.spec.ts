import { expect, test } from "@playwright/test";

test("publishing goes one step at a time, with progress, Back/Next and a one-page option", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Add", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();

  // Step 1 only: the listing, not the build or the pages yet.
  const steps = page.getByRole("navigation", { name: "Publishing steps" });
  await expect(steps.getByRole("heading", { name: "Step 1 of 5: Name & description" })).toBeVisible();
  await expect(page.getByLabel("App name")).toBeVisible();
  await expect(page.getByText("Also needed in the stores")).toHaveCount(0);
  await expect(steps.getByRole("button", { name: /Step 1: Name & description/ })).toHaveAttribute("aria-current", "step");
  // The default com.appmaker ID isn't "done" yet; fixing it completes step 1.
  await expect(steps.getByRole("button", { name: "Step 1: Name & description (needs attention)" })).toBeVisible();
  await page.getByLabel("Bundle ID / package name").fill("com.janedoe.streakly");
  await expect(steps.getByRole("button", { name: "Step 1: Name & description (done)" })).toBeVisible();

  // Next, Next…: one thing on screen at a time.
  await page.getByRole("button", { name: "Next: Icon" }).click();
  await expect(steps.getByRole("heading", { name: "Step 2 of 5: Icon" })).toBeVisible();
  await expect(page.getByLabel("App name")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "App icon" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("App name")).toHaveValue(/.+/);
  // Any step is one click away; the checklist shows on the last one.
  await steps.getByRole("button", { name: /Step 5: Build & publish/ }).click();
  await expect(page.getByText("Also needed in the stores")).toBeVisible();
  await expect(page.getByRole("button", { name: /Next:/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download Expo project" })).toBeVisible();

  // Everything on one page, remembered.
  await steps.getByRole("button", { name: "Show all steps on one page" }).click();
  await expect(page.getByLabel("App name")).toBeVisible();
  await expect(page.getByRole("heading", { name: "App icon" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(steps.getByRole("button", { name: "Go step by step" })).toBeVisible();
});
