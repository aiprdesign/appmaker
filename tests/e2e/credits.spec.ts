import { expect, test } from "@playwright/test";

// Payments are off in the test server (no STRIPE_SECRET_KEY): nothing costs credits.
// The paid flow is covered by tests/unit/credits.test.ts against a fake Stripe.
test("without Stripe keys the Credits page says everything is free", async ({ page }) => {
  await page.goto("/credits");
  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  await expect(page.getByText(/Everything is free on this site right now/)).toBeVisible();
});
