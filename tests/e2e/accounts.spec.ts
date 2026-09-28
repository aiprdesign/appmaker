import { expect, test } from "@playwright/test";

// Accounts and cloud saving. Needs TEST_DATABASE_URL (CI starts PostgreSQL).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

test("sign up, apps sync to the account and open on another device", async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Make an app before signing in (demo mode builds a sample app).
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  const appUrl = page.url();

  // The projects page offers to save it to an account.
  await page.goto("/projects");
  await expect(page.getByText(/saved in this browser only/)).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).first().click();

  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).last().click();

  // Back on My apps: the app made earlier is now in the account.
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText(`Saved to your account (${email}).`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();

  // A second device (fresh browser, nothing stored) signs in and gets the app.
  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto("/login");
  await phone.getByLabel("Email").fill(email);
  await phone.getByLabel("Password").fill("correct horse battery");
  await phone.getByRole("button", { name: "Sign in" }).last().click();
  await expect(phone).toHaveURL(/\/projects$/);
  await expect(phone.getByRole("link", { name: /^Open / })).toHaveCount(1);
  await phone.goto(appUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(phone.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });

  // Deleting on one device removes it on the other after sync.
  await phone.goto("/projects");
  phone.once("dialog", (d) => d.accept());
  await phone.getByRole("link", { name: /^Open / }).hover();
  await phone.getByRole("button", { name: /Delete/ }).click();
  await expect(phone.getByText("No apps yet")).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText("No apps yet")).toBeVisible();

  // Signing out clears this browser; the account keeps its apps.
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await other.close();
});

test("wrong password is explained", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is wrong." })).toBeVisible();
});
