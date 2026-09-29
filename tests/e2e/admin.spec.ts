import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The admin dashboard. Needs TEST_DATABASE_URL (switches and members live in the database).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

async function adminSignIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
}

test("admin: password, overview, members and switches", async ({ page, browser }) => {
  // A member to find.
  const email = `member-${Date.now()}@example.com`;
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto("/login");
  await vp.getByRole("tab", { name: "Create account" }).click();
  await vp.getByLabel("Email").fill(email);
  await vp.getByLabel("Password").fill("correct horse battery");
  await vp.getByRole("button", { name: "Create account" }).last().click();
  await expect(vp).toHaveURL(/\/projects$/);

  // Wrong password first.
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That's not the admin password." })).toBeVisible();
  await adminSignIn(page);

  // Overview: stat tiles and the sign-ups chart with a table view.
  await expect(page.getByText("Members", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: /Sign-ups per day for the last 14 days/ })).toBeVisible();
  await page.getByText("Show as table").click();
  await expect(page.getByRole("columnheader", { name: "Sign-ups" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Members: search finds the new member.
  await page.getByRole("tab", { name: "members" }).click();
  await page.getByLabel("Search members by email").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Password")).toBeVisible();

  // Settings: Google starts off; switching website import off hides it on the home page.
  await page.getByRole("tab", { name: "settings" }).click();
  await expect(page.getByRole("switch", { name: "Sign in with Google" })).toHaveAttribute("aria-checked", "false");
  const websiteSwitch = page.getByRole("switch", { name: "Build from a website" });
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "true");
  await websiteSwitch.click();
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "false");
  await vp.goto("/");
  await expect(vp.getByRole("tab", { name: "Describe an idea" })).toBeVisible();
  await expect(vp.getByRole("tab", { name: "From a website" })).toHaveCount(0);
  await websiteSwitch.click();
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "true");
  await vp.reload();
  await expect(vp.getByRole("tab", { name: "From a website" })).toBeVisible();

  // Signing out of admin locks it again.
  await page.getByRole("button", { name: "Sign out of admin" }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  await visitor.close();
});
