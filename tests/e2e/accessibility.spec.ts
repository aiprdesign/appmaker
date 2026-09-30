import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the accessibility menu changes text size, contrast and motion, and remembers them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Accessibility settings" }).click();
  const menu = page.getByRole("dialog", { name: "Accessibility settings" });
  await menu.getByRole("radio", { name: "Larger" }).click();
  await menu.getByRole("checkbox", { name: /Higher contrast/ }).check();
  await menu.getByRole("checkbox", { name: /Reduce motion/ }).check();
  await menu.getByRole("checkbox", { name: /Underline links/ }).check();
  const html = page.locator("html");
  await expect(html).toHaveClass(/a11y-text-xl/);
  await expect(html).toHaveClass(/a11y-contrast/);
  await expect(html).toHaveClass(/a11y-motion/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("20px");

  // Remembered, and applied before the page shows.
  await page.reload();
  await expect(html).toHaveClass(/a11y-text-xl/);
  await expect(html).toHaveClass(/a11y-links/);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Accessibility settings" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(html).not.toHaveClass(/a11y-text-xl/);
  await page.getByRole("link", { name: "Accessibility statement" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Accessibility statement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Known limitations" })).toBeVisible();
  // The contact email is a placeholder until the site owner fills it in.
  await expect(page.locator("mark", { hasText: "[your contact email]" }).first()).toBeVisible();
  const statementAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(statementAxe.violations.map((v) => v.id)).toEqual([]);
});

test("apps follow light and dark mode, and the preview can show both", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  const text = app.getByText("Kicked off the project");
  await expect(text).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => text.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(17, 24, 39)");

  await page.getByRole("button", { name: "Preview in dark mode" }).click();
  await expect(page.getByRole("button", { name: "Preview in dark mode" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => app.getByText("Kicked off the project").evaluate((el) => getComputedStyle(el).color), { timeout: 10_000 }).toBe("rgb(245, 245, 247)");
  // No quality warnings in dark mode either.
  await page.waitForTimeout(2000);
  await expect(page.getByText("The quality check found something to improve")).toHaveCount(0);

  // The Design panel offers Auto (the default), Light and Dark.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Follows the phone's light or dark setting/)).toBeVisible();
  // The builder has the accessibility menu in its header.
  await expect(page.getByRole("button", { name: "Accessibility settings" })).toHaveCount(1);
});

test("the Publish tab explains what the stores need, and that it isn't legal advice", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Publish" }).first().click();
  const guide = page.getByRole("region", { name: "What the stores need before you publish" });
  await expect(guide).toContainText("Privacy policy (Apple and Google require it)");
  await expect(guide).toContainText("Support page (Apple requires it)");
  await expect(guide).toContainText("Terms of use (recommended)");
  await expect(guide).toContainText("not legal advice");
});
