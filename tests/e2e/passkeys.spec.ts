import { expect, test, type Page } from "@playwright/test";

// Passkeys end to end with Chrome's virtual authenticator (real WebAuthn
// cryptography, no mocks). Needs TEST_DATABASE_URL.
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

test("add a passkey, then sign in with it (and it can be removed)", async ({ page }) => {
  const { cdp, authenticatorId } = await virtualAuthenticator(page);
  const email = `passkey-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL(/\/projects$/);

  // A friendly nudge offers a passkey; adding one celebrates.
  await expect(page.getByText("Skip the password next time")).toBeVisible();
  await page.getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added for your" })).toBeVisible();
  await expect(page.locator('canvas[data-testid="confetti"]')).toBeAttached();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);

  // It's listed in the account menu.
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await expect(page.getByRole("list", { name: "Your passkeys" }).getByRole("listitem")).toHaveCount(1);

  // Sign out, then sign back in with just the passkey.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText(`Saved to your account (${email}).`)).toBeVisible();

  // Remove it: the device's passkey no longer signs in.
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Remove passkey for/ }).click();
  await expect(page.getByRole("list", { name: "Your passkeys" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't linked to an account here" })).toBeVisible();
});

test("the nudge can be dismissed and stays dismissed", async ({ page }) => {
  await virtualAuthenticator(page);
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(`nudge-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByRole("button", { name: "Maybe later" }).click();
  await expect(page.getByText("Skip the password next time")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Saved to your account/)).toBeVisible();
  await expect(page.getByText("Skip the password next time")).toHaveCount(0);
});
