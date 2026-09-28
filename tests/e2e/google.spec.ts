import { expect, test } from "@playwright/test";

// The sign-in page with Google turned on (the site's answer is simulated;
// the OAuth exchange itself is covered by unit tests).

test("Continue with Google appears when it's set up, and Google errors are explained", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true, google: true, user: null }) }));
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toHaveAttribute("href", "/api/auth/google/start");
  await expect(page.getByText("or with email")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();

  await page.goto("/login?error=" + encodeURIComponent("Google sign-in was cancelled."));
  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in was cancelled." })).toBeVisible();
});

test("no Google button when it isn't set up", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: true, google: false, user: null }) }));
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});
