import { expect, type Page } from "@playwright/test";

/** Shows every publishing step on one page (remembered, so only switched once). */
export async function showAllPublishSteps(page: Page) {
  const steps = page.getByRole("navigation", { name: "Publishing steps" });
  await expect(steps).toBeVisible();
  const show = steps.getByRole("button", { name: "Show all steps on one page" });
  if (await show.isVisible()) await show.click();
  await expect(steps.getByRole("button", { name: "Go step by step" })).toBeVisible();
}

/** Opens Publish with every step shown and the optional extras (live updates, bookings) unfolded. */
export async function openPublishExtras(page: Page) {
  await page.getByRole("button", { name: "Publish" }).first().click();
  await showAllPublishSteps(page);
  const extras = page.locator("details", { hasText: "Optional extras: live updates and bookings" });
  if (!(await extras.evaluate((d) => (d as HTMLDetailsElement).open))) await extras.locator("summary").click();
}
