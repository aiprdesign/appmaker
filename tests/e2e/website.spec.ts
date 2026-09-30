import { expect, test } from "@playwright/test";

const SITE = "http://localhost:3200/";

test("imports a website and builds a branded app from it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("tab", { name: "URL to App" }).click();
  await page.getByLabel("Website address").fill(SITE);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Luigi's Trattoria")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/read 4 pages/)).toBeVisible();
  await expect(page.getByText("Found logo, 3 photos, phone, address, hours, booking link, WhatsApp")).toBeVisible();

  const request = page.waitForRequest("**/api/generate");
  await page.getByLabel("Describe your app").press("Enter");
  const body = (await request).postDataJSON();
  expect(body.site.siteName).toBe("Luigi's Trattoria");
  expect(body.site.contact.booking).toBe("https://www.opentable.com/r/luigis-trattoria");
  expect(body.site.logo).toBe("https://images.luigis.example/logo.png");
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

test("a website address alone in Prompt to App switches to URL to App", async ({ page }) => {
  let generated = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/generate")) generated = true;
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill(SITE);
  await expect(page.getByText(/That's a website address\. Press Enter to use URL to App/)).toBeVisible();
  await page.getByLabel("Describe your app").press("Enter");
  await expect(page.getByRole("tab", { name: "URL to App" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/read 4 pages/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Describe your app")).toHaveValue("");
  expect(generated).toBe(false);
});

test("pasting just a link into the prompt opens URL to App", async ({ page }) => {
  await page.goto("/");
  const box = page.getByLabel("Describe your app");
  await box.focus();
  await box.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, SITE);
  await expect(page.getByRole("tab", { name: "URL to App" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/read 4 pages/)).toBeVisible({ timeout: 20_000 });
});

test("a link inside a longer idea stays in Prompt to App", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A loyalty card app like luigis.com has");
  await expect(page.getByText(/That's a website address/)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Prompt to App" })).toHaveAttribute("aria-selected", "true");
});

test("shows a friendly error for a site that can't be read", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "URL to App" }).click();
  await page.getByLabel("Website address").fill("http://localhost:3200/missing");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/HTTP 404/)).toBeVisible({ timeout: 20_000 });
});

test("the home page offers 'URL to App' as a way to start", async ({ page }) => {
  await page.goto("/");
  const idea = page.getByRole("tab", { name: "Prompt to App" });
  const website = page.getByRole("tab", { name: "URL to App" });
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

test("the Prompt to App and URL to App cards open the prompt box in that mode", async ({ page }) => {
  await page.goto("/");
  const ways = page.getByRole("region", { name: "Two ways to make your app" });
  await expect(ways.getByRole("heading", { name: "Prompt to App" })).toBeVisible();
  await expect(ways.getByRole("heading", { name: "URL to App" })).toBeVisible();

  await ways.getByRole("button", { name: /Try URL to App/ }).click();
  await expect(page.getByRole("tab", { name: "URL to App" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Website address")).toBeFocused();

  await ways.getByRole("button", { name: /Try Prompt to App/ }).click();
  await expect(page.getByRole("tab", { name: "Prompt to App" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Describe your app")).toBeFocused();
});

test("a shared link with ?url= reads that website straight away", async ({ page }) => {
  await page.goto(`/?url=${encodeURIComponent(SITE)}`);
  await expect(page.getByText("Luigi's Trattoria")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/read 4 pages/)).toBeVisible();
  // The address bar is tidied, so a reload doesn't import again.
  expect(new URL(page.url()).search).toBe("");

  await page.goto("/?mode=url");
  await expect(page.getByRole("tab", { name: "URL to App" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Website address")).toBeVisible();
});
