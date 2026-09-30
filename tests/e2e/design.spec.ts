import { expect, test, type Page } from "@playwright/test";

async function buildApp(page: Page, prompt: string) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill(prompt);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  return page.frameLocator('iframe[title="App preview"]');
}

test("the Design panel restyles the app instantly and the change is kept", async ({ page }) => {
  const app = await buildApp(page, "A dream diary");
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  // The preview restarts the app on a change, so this reads the first screen: the selected tab's label.
  const tabColor = () => app.getByText("Entries", { exact: true }).evaluate((el) => getComputedStyle(el).color);
  await expect.poll(tabColor).toBe("rgb(37, 99, 235)");

  await page.getByRole("button", { name: "Design" }).click();
  const panel = page.getByRole("region", { name: "Design" });
  await expect(panel.getByRole("button", { name: "Make this app customizable" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Forest" }).click();
  await expect.poll(tabColor, { timeout: 10_000 }).toBe("rgb(21, 128, 61)");

  await panel.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(() => app.getByText("Kicked off the project").evaluate((el) => getComputedStyle(el).color), { timeout: 10_000 }).toBe("rgb(245, 245, 247)");

  // Saved with the app, and the store listing follows the brand color.
  await page.reload();
  await page.getByRole("button", { name: "Code" }).click();
  await page.getByRole("main").getByRole("button", { name: "src/theme.js" }).click();
  await expect(page.getByLabel("Source of src/theme.js")).toHaveValue(/export const mode = "dark"/);
  await expect(page.getByLabel("Source of src/theme.js")).toHaveValue(/#15803D/i);
});

test("apps made before design settings offer to become customizable", async ({ page }) => {
  const app = await buildApp(page, "A habit tracker with streaks");
  await expect(app.getByText("Today").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Design" }).click();
  await expect(page.getByRole("button", { name: "Make this app customizable" })).toBeVisible();
});

test("on a phone the Design panel is a sheet over the preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await buildApp(page, "A dream diary");
  await page.getByRole("button", { name: "App" }).click();
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Design" }).click();
  const panel = page.getByRole("region", { name: "Design" });
  await expect(panel).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await panel.getByRole("button", { name: "Close design" }).click();
  await expect(panel).toHaveCount(0);
});
