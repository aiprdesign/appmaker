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
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

test("connect any AI service with a custom endpoint", async ({ page }) => {
  let sent: { ai?: Record<string, string> } = {};
  await page.route("**/api/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "<summary>ok</summary>" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Any other AI/ }).click();
  await expect(dialog.getByRole("button", { name: /Any other AI/ })).toContainText("Needs URL");
  await dialog.getByLabel("Base URL").fill("https://llm.example.com/v1");
  await dialog.getByLabel("API format").selectOption("anthropic");
  await dialog.getByLabel("Any other AI (custom) API key").fill("my-key");
  await dialog.getByLabel("Model ID").fill("kimi-k2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("button", { name: "AI model settings" })).toContainText("kimi-k2");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.ai).toEqual({
    provider: "custom",
    model: "kimi-k2",
    apiKey: "my-key",
    // Switching to the Anthropic format trims /v1 (its client adds it).
    baseURL: "https://llm.example.com",
    apiFormat: "anthropic",
  });
});

test("the server refuses private-network endpoints with a clear message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Any other AI/ }).click();
  await dialog.getByLabel("Base URL").fill("https://169.254.169.254/v1");
  await dialog.getByRole("button", { name: /Test & load models/ }).click();
  await expect(dialog.getByText(/private network/)).toBeVisible();
});

test("paste any key: provider, key check and model are set up automatically", async ({ page }) => {
  let modelRequests = 0;
  await page.route("**/api/ai/models", (route) => {
    modelRequests++;
    const body = route.request().postDataJSON();
    const ok = body.provider === "openrouter" && body.apiKey === "sk-or-v1-0123456789abcdef";
    return route.fulfill({
      status: ok ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(ok ? { models: ["anthropic/claude-opus-5", "meta-llama/llama-3.3-70b-instruct"] } : { error: "bad" }),
    });
  });
  let sent: { ai?: Record<string, string> } = {};
  await page.route("**/api/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "<summary>ok</summary>" });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste any API key").fill("sk-or-v1-0123456789abcdef");
  await expect(dialog.getByText(/Recognised your OpenRouter key/)).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "OpenRouter" })).toBeVisible();
  await expect(dialog.getByText("Connected — 2 models available.")).toBeVisible();
  await expect(dialog.getByText(/OpenRouter is ready with openrouter\/auto — press Save/)).toBeVisible();
  expect(modelRequests).toBe(1);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.ai).toMatchObject({ provider: "openrouter", apiKey: "sk-or-v1-0123456789abcdef", model: "openrouter/auto" });
});

test("a key pasted under the wrong provider moves to the right one", async ({ page }) => {
  await page.route("**/api/ai/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"models":["gsk-model"]}' }));
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^OpenAI/ }).click();
  await dialog.getByLabel("OpenAI API key").fill("gsk_0123456789abcdefghij");
  await expect(dialog.getByRole("heading", { name: "Groq" })).toBeVisible();
  await expect(dialog.getByLabel("Groq API key")).toHaveValue("gsk_0123456789abcdefghij");
});

test("custom: pick a known service or type just a domain", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Any other AI/ }).click();
  await dialog.getByLabel("Fill from a known service").selectOption({ label: "Anthropic Claude" });
  await expect(dialog.getByLabel("Base URL")).toHaveValue("https://api.anthropic.com");
  await expect(dialog.getByLabel("API format")).toHaveValue("anthropic");
  await dialog.getByLabel("Fill from a known service").selectOption({ label: "Together AI" });
  await expect(dialog.getByLabel("API format")).toHaveValue("openai");

  await dialog.getByLabel("Base URL").fill("llm.example.com");
  await dialog.getByLabel("Base URL").blur();
  await expect(dialog.getByLabel("Base URL")).toHaveValue("https://llm.example.com/v1");
});

test("add your own models: they're kept in a list you can pick from or remove", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^OpenRouter/ }).click();
  await dialog.getByLabel("Model ID").fill("qwen/qwen3-coder");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByLabel("Model ID").fill("mistralai/devstral");
  await dialog.getByRole("button", { name: "Save", exact: true }).click(); // typed models are remembered on Save too

  await page.getByRole("button", { name: "AI model settings" }).click();
  dialog = page.getByRole("dialog");
  const mine = dialog.getByRole("list", { name: "Your models" });
  await expect(mine.getByRole("listitem")).toHaveCount(2);
  await mine.getByRole("button", { name: "qwen/qwen3-coder", exact: true }).click();
  await expect(dialog.getByLabel("Model ID")).toHaveValue("qwen/qwen3-coder");
  await dialog.getByRole("button", { name: "Remove mistralai/devstral from your models" }).click();
  await expect(mine.getByRole("listitem")).toHaveCount(1);
});

test("Test model sends a real request and shows the result", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/ai/test", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    return body.model === "good-model"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, model: "good-model", reply: "OK", ms: 1234 }) })
      : route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Groq doesn't recognise that model. Pick another in AI settings." }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Groq/ }).click();
  await dialog.getByLabel("Model ID").fill("good-model");
  await dialog.getByRole("button", { name: "Test model" }).click();
  await expect(dialog.getByRole("status")).toContainText("Works! good-model replied in 1.2s: “OK”");
  await dialog.getByLabel("Model ID").fill("bad-model");
  await expect(dialog.getByText(/Works!/)).toHaveCount(0); // a result only shows for the model it tested
  await dialog.getByRole("button", { name: "Test model" }).click();
  await expect(dialog.getByRole("status")).toContainText("Test failed: Groq doesn't recognise that model");
  expect(calls).toBe(2);
});

test("save named custom connections and switch between them", async ({ page }) => {
  let sent: { ai?: Record<string, string> } = {};
  await page.route("**/api/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/plain", body: "<summary>ok</summary>" });
  });
  await page.route("**/api/ai/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' }));
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Any other AI/ }).click();
  await dialog.getByLabel("Base URL").fill("https://gateway.example.com/v1");
  await dialog.getByLabel("Any other AI (custom) API key").fill("gw-key-123");
  await dialog.getByLabel("Model ID").fill("company-llm");
  await dialog.getByLabel("Connection name").fill("Work gateway");
  await dialog.getByRole("button", { name: "Save connection" }).click();
  const nav = dialog.getByRole("navigation");
  await expect(nav.getByRole("button", { name: /Work gateway/ })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Work gateway" })).toBeVisible();
  await dialog.getByRole("button", { name: /^Groq/ }).click();
  await nav.getByRole("button", { name: /Work gateway/ }).click();
  await expect(dialog.getByLabel("Base URL")).toHaveValue("https://gateway.example.com/v1");
  await expect(dialog.getByLabel("Model ID")).toHaveValue("company-llm");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  // Persisted: reopen and it's still listed; generation uses it.
  await page.getByRole("button", { name: "AI model settings" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("navigation").getByRole("button", { name: /Work gateway/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect.poll(() => sent.ai).toMatchObject({ provider: "custom", baseURL: "https://gateway.example.com/v1", apiKey: "gw-key-123", model: "company-llm" });
});
