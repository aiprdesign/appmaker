import { expect, test } from "@playwright/test";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

test("people can delete their own account from the account menu", async ({ page }) => {
  const email = `leaving-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
  await expect(dialog).toContainText("your credits, including ones you bought");
  await expect(dialog).toContainText("Download any app you want to keep first");
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill(email);
  await confirm.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your account and everything in it has been deleted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  // The account is gone: signing in with it no longer works.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
