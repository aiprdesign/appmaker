import { expect, test } from "@playwright/test";

test("choose a provider, model and own key; they are used for generation", async ({ page }) => {
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: ["gpt-5.5", "gpt-5.5-mini", "o9"] }) }),
  );
  let sent: { ai?: { provider: string; model: string; apiKey?: string } } = {};
  await page.route("**/api/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "<summary>ok</summary>" });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "AI model settings" })).toContainText("Claude Opus 5");
  await page.getByRole("button", { name: "AI model settings" }).click();

  const dialog = page.getByRole("dialog", { name: "AI model settings" });
  await dialog.getByRole("button", { name: /^OpenAI/ }).click();
  await dialog.getByLabel("OpenAI API key").fill("sk-test-123");
  await dialog.getByRole("button", { name: /Test & load models/ }).click();
  await expect(dialog.getByText("Connected — 3 models available.")).toBeVisible();
  await dialog.getByLabel("Model ID").fill("gpt-5.5-mini");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole("button", { name: "AI model settings" })).toContainText("gpt-5.5-mini");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.ai).toEqual({ provider: "openai", model: "gpt-5.5-mini", apiKey: "sk-test-123" });

  // The choice persists and can be reset to the site default.
  await page.reload();
  await page.getByRole("button", { name: "AI model settings" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Use site default" }).click();
  await expect(page.getByRole("button", { name: "AI model settings" }).first()).toContainText("Claude Opus 5");
});

test("custom endpoints are disabled unless the site enables them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Custom/ }).click();
  await expect(dialog.getByText(/Custom endpoints are turned off/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
});
