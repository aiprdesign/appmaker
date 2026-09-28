import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The "Native AI connected" badge and the /status page, with the site's
// configuration mocked (the test server itself runs in demo mode).

async function siteHasReplicate(page: Page) {
  await page.route("**/api/ai/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ defaultProvider: "replicate", defaultModel: "deepseek-ai/deepseek-r1", serverKeys: ["replicate"], customEndpointsAllowed: true }),
    }),
  );
}

test("home page shows which AI is connected", async ({ page }) => {
  await siteHasReplicate(page);
  await page.goto("/");
  const badge = page.getByTestId("ai-status");
  await expect(badge).toContainText("Native AI connected");
  await expect(badge).toContainText("Replicate · DeepSeek R1");
  await expect(page.getByText(/Demo mode/)).toHaveCount(0);
  await badge.getByRole("link", { name: "Status" }).click();
  await expect(page).toHaveURL(/\/status$/);
});

test("status page: AI and Expo connected, with a live AI test", async ({ page }) => {
  await siteHasReplicate(page);
  let tested: Record<string, unknown> | null = null;
  await page.route("**/api/ai/test", async (route) => {
    tested = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, model: "deepseek-ai/deepseek-r1", reply: "OK", ms: 1234 }) });
  });
  await page.route("**/api/eas/account?check=1", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true, hosted: true, account: "appmaker-builds" }) }),
  );
  await page.goto("/status");
  const ai = page.getByRole("region", { name: "AI for building apps" });
  await expect(ai.getByText("Native AI connected")).toBeVisible();
  await expect(ai.getByText("Replicate · DeepSeek R1")).toBeVisible();
  await ai.getByRole("button", { name: "Run a live AI test" }).click();
  await expect(ai.getByRole("status")).toContainText("Working. Answered in 1.2s: “OK”");
  // No key is sent: the server uses the site's own key.
  expect(tested).toEqual({ provider: "replicate", model: "deepseek-ai/deepseek-r1" });

  const expo = page.getByRole("region", { name: /App Store & Google Play builds/ });
  await expect(expo.getByText("Expo connected — builds included")).toBeVisible();
  await expect(expo.getByText("appmaker-builds")).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test("status page explains what's missing", async ({ page }) => {
  await page.route("**/api/eas/account?check=1", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true, hosted: true, error: "Expo didn't accept this access token." }) }),
  );
  await page.goto("/status");
  // The test server has no AI key.
  await expect(page.getByText("Demo mode — no AI connected")).toBeVisible();
  await expect(page.getByText("Expo token not working")).toBeVisible();
  await expect(page.getByText(/Check EXPO_TOKEN/)).toBeVisible();
  // The test server runs with APPMAKER_DEMO=1 and no AI keys.
  const vars = page.getByRole("region", { name: "Server settings (variables)" });
  await expect(vars.getByText("Demo mode is forced on")).toBeVisible();
  await expect(vars.getByText(/(^|, )APPMAKER_DEMO(,|$)/)).toBeVisible();
});

test("an AI test failure is shown", async ({ page }) => {
  await siteHasReplicate(page);
  await page.route("**/api/ai/test", (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Replicate rejected the API token." }) }),
  );
  await page.route("**/api/eas/account?check=1", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true, hosted: false }) }));
  await page.goto("/status");
  await page.getByRole("button", { name: "Run a live AI test" }).click();
  await expect(page.getByRole("region", { name: "AI for building apps" }).getByRole("alert")).toContainText("Replicate rejected the API token.");
  await expect(page.getByText("No site Expo account")).toBeVisible();
});
