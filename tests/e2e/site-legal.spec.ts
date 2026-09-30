import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("terms and privacy pages are linked from the home page and sign-up, with placeholders until filled in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are responsible for your apps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Credits and payments" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("link", { name: "Privacy policy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People who use your apps" })).toBeVisible();

  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByText("By creating an account you agree to the")).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
});

test("admin: legal details fill the blanks on the pages", async ({ browser }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");
  const admin = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.66.0.11" } })).newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Admin password").fill("e2e-admin-password");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.getByRole("tab", { name: "settings" }).click();
  const section = admin.getByRole("region", { name: "Legal details" });
  await section.getByLabel("Business name").fill("Acme Apps Ltd");
  await section.getByLabel("Contact email").fill("privacy@acme.example");
  await section.getByLabel("Governing law").fill("England and Wales");
  await section.getByLabel("Postal address").fill("");
  await section.getByRole("button", { name: "Save legal details" }).click();
  await expect(section.getByText(/Saved. Still to fill in: Postal address, Effective date/)).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await page.goto("/privacy");
  await expect(page.getByText("Acme Apps Ltd runs Appmaker at this website")).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy@acme.example" }).first()).toHaveAttribute("href", "mailto:privacy@acme.example");
  // Still-missing details show as highlighted placeholders.
  await expect(page.locator("mark", { hasText: "[your business address]" }).first()).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByText(/governed by the laws of England and Wales/)).toBeVisible();

  // Clean up for other runs.
  for (const label of ["Business name", "Contact email", "Governing law"]) await section.getByLabel(label).fill("");
  await section.getByRole("button", { name: "Save legal details" }).click();
  await expect(section.getByText(/Saved/)).toBeVisible();
});
