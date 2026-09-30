import { expect, test } from "@playwright/test";

// Payments are off in the test server (no STRIPE_SECRET_KEY): nothing costs credits.
// The paid flow is covered by tests/unit/credits.test.ts against a fake Stripe.
test("without Stripe keys the Credits page says everything is free", async ({ page }) => {
  await page.goto("/credits");
  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  await expect(page.getByText(/Everything is free on this site right now/)).toBeVisible();
});

const PAYMENTS = {
  enabled: true,
  currency: "usd",
  packs: [
    { id: "starter", name: "Starter", credits: 50, price: 900 },
    { id: "maker", name: "Maker", credits: 200, price: 2900, badge: "Popular" },
  ],
  prices: { newApp: 3, edit: 1, build: 5, phonePreview: 1, freeCredits: 10, guestBuilds: 3 },
  freeCredits: 10,
  guestBuilds: 3,
  mode: "test",
};

test("without Stripe keys the home page says everything is free", async ({ page }) => {
  await page.goto("/");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("heading", { name: "Free while we're in beta" })).toBeVisible();
  await expect(pricing.getByRole("link", { name: "Get Started for Free" })).toBeVisible();
});

test("with payments on, the home page shows the three credit-based plans", async ({ page }) => {
  await page.route("**/api/credits", (r) => r.fulfill({ json: { ...PAYMENTS, signedIn: false, plan: "guest" } }));
  await page.goto("/");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("heading", { name: "Simple pricing, no subscriptions" })).toBeVisible();
  await expect(pricing.getByText("3 AI builds a day")).toBeVisible();
  await expect(pricing.getByText("10 credits every month")).toBeVisible();
  await expect(pricing.getByText("from $9")).toBeVisible();
  await expect(pricing.getByText("one-time, no subscription")).toBeVisible();
  await expect(pricing.getByRole("link", { name: "Try for Free!" })).toHaveAttribute("href", "/#start");
  await expect(pricing.getByRole("link", { name: "Get Started for Free" })).toHaveAttribute("href", "/login");
  await expect(pricing.getByRole("link", { name: "See credit packs" })).toHaveAttribute("href", "/credits");
  await expect(pricing.getByText(/\/ month|Contact sales/)).toHaveCount(0);
});

test("free accounts see paid features locked, and apps get the Made with Appmaker line", async ({ page }) => {
  let plan = "free";
  await page.route("**/api/credits", (r) => r.fulfill({ json: { ...PAYMENTS, signedIn: true, plan, balance: 10, history: [] } }));
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("Store builds are part of the paid plan. Buy any credit pack to unlock them for good. No subscription.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See credit packs" }).first()).toHaveAttribute("href", "/credits");
  // Downloading the project stays free.
  await expect(page.getByRole("button", { name: "Download Expo project" })).toBeVisible();

  await page.getByRole("button", { name: "Code" }).click();
  await page.getByRole("main").getByRole("button", { name: "src/appmaker.js" }).click();
  await expect(page.getByLabel("Source of src/appmaker.js")).toHaveValue(/Made with Appmaker/);

  // After buying a pack, the line goes away.
  plan = "paid";
  await page.reload();
  await page.getByRole("button", { name: "Code" }).click();
  await page.getByRole("main").getByRole("button", { name: "src/appmaker.js" }).click();
  await expect(page.getByLabel("Source of src/appmaker.js")).toHaveValue(/return null/);
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText(/Store builds are part of the paid plan/)).toHaveCount(0);
});
