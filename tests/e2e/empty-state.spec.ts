import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("an empty My apps offers ideas that fill in the prompt on the home page", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Your first app is one sentence away" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("link", { name: "A workout timer" }).click();
  await expect(page.getByLabel("Describe your app")).toHaveValue("A workout timer");
  await expect(page.getByLabel("Describe your app")).toBeFocused();
  // Nothing is built until the person sends it.
  expect(page.url()).not.toContain("/build");
});

test("sign in shows why to create an account beside the form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("region", { name: "Why create an account" })).toContainText("Your apps saved to your account");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});
