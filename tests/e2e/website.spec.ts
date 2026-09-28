import { expect, test } from "@playwright/test";

const SITE = "http://localhost:3200/";

test("imports a website and builds a branded app from it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("tab", { name: "From a website" }).click();
  await page.getByLabel("Website address").fill(SITE);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Luigi's Trattoria")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/read 4 pages/)).toBeVisible();

  const request = page.waitForRequest("**/api/generate");
  await page.getByLabel("Describe your app").press("Enter");
  const body = (await request).postDataJSON();
  expect(body.site.siteName).toBe("Luigi's Trattoria");
  expect(body.prompt).toContain("Luigi's Trattoria");

  const app = page.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText("Luigi's Trattoria").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("The app hit an error")).toHaveCount(0);
  // The website card stays visible in the builder chat.
  await expect(page.locator("aside").getByText(/localhost · read 4 pages/)).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByLabel("App name")).toHaveValue("Luigi's Trattoria");
  expect(errors).toEqual([]);
});

test("offers to import a link typed into the prompt", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("An ordering app for localhost:3200 wait no, for luigis.com");
  await expect(page.getByRole("button", { name: /Use content from luigis\.com/ })).toBeVisible();
});

test("shows a friendly error for a site that can't be read", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "From a website" }).click();
  await page.getByLabel("Website address").fill("http://localhost:3200/missing");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/HTTP 404/)).toBeVisible({ timeout: 20_000 });
});

test("the home page offers 'From a website' as a way to start", async ({ page }) => {
  await page.goto("/");
  const idea = page.getByRole("tab", { name: "Describe an idea" });
  const website = page.getByRole("tab", { name: "From a website" });
  await expect(idea).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Website address")).toHaveCount(0);
  await website.click();
  await expect(website).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Website address")).toBeFocused();
  await expect(page.getByText(/reads your site.s pages, brand colours and content/)).toBeVisible();
  await expect(page.getByLabel("Describe your app")).toHaveAttribute("placeholder", /Optional: what should the app do/);
  await idea.click();
  await expect(page.getByLabel("Website address")).toHaveCount(0);
});
