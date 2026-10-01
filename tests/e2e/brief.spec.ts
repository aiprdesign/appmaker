import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// This file sees the brief, as a first-time visitor does.
test.use({ storageState: { cookies: [], origins: [] } });

test("a short idea gets three quick questions, and the answers go into the build", async ({ page }) => {
  const sent = page.waitForRequest("**/api/generate");
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a gym app");
  await page.keyboard.press("Enter");
  const brief = page.getByRole("region", { name: "Three quick questions for a better first version" });
  await expect(brief).toBeVisible();
  // Feature suggestions fit the kind of app; the first three are picked.
  await expect(brief.getByRole("button", { name: "Workout plans" })).toHaveAttribute("aria-pressed", "true");
  await expect(brief.getByRole("button", { name: "Progress charts" })).toHaveAttribute("aria-pressed", "true");
  await expect(brief.getByRole("button", { name: "Class timetable" })).toHaveAttribute("aria-pressed", "false");
  const axe = await new AxeBuilder({ page }).include("#start").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await brief.getByRole("button", { name: "My business's customers" }).click();
  await brief.getByLabel("Business name (optional)").fill("Iron Temple");
  await brief.getByRole("button", { name: "Exercise timer" }).click();
  await brief.getByRole("button", { name: "Class timetable" }).click();
  await brief.getByLabel("Anything else? (optional)").fill("Members can see how busy the gym is");
  await brief.getByRole("button", { name: "Bold & colorful" }).click();
  await brief.getByRole("button", { name: "Build my app" }).click();

  await page.waitForURL(/\/build\//);
  const { prompt } = (await sent).postDataJSON();
  expect(prompt).toContain("a gym app");
  expect(prompt).toContain('for the customers of my business. The business is called "Iron Temple"');
  expect(prompt).toContain("Must-have features: Workout plans; Progress charts; Class timetable; Members can see how busy the gym is.");
  expect(prompt).toContain("Look and feel: bold and colorful");
  await expect(page.getByText("Iron Temple").first()).toBeVisible();
});

test("detailed prompts build straight away, and 'Don't ask me again' is remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker with streaks, reminders, weekly stats and a dark theme");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);

  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a recipe app");
  await page.keyboard.press("Enter");
  const brief = page.getByRole("region", { name: "Three quick questions for a better first version" });
  await expect(brief.getByRole("button", { name: "Menu with photos" })).toBeVisible();
  await brief.getByRole("checkbox", { name: "Don't ask me again" }).check();
  await brief.getByRole("button", { name: "Skip, just build it" }).click();
  await page.waitForURL(/\/build\//);

  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a pet app");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
});
