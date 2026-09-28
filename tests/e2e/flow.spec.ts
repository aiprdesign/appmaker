import { expect, test, type Page } from "@playwright/test";

async function buildApp(page: Page, prompt: string) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill(prompt);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  const frame = page.frameLocator('iframe[title="App preview"]');
  return frame;
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("landing page renders with no errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("App Store app");
  await expect(page.locator("#pricing")).toBeVisible();
  expect(errors).toEqual([]);
});

const DEMOS = [
  { prompt: "A habit tracker with streaks", expect: "Today", tab: "Stats", after: "Longest streak" },
  { prompt: "Track my monthly expenses", expect: "Left to spend", tab: "Insights", after: "Monthly budget" },
  { prompt: "A home workout app", expect: "Morning HIIT", tab: "Progress", after: "Workouts" },
  { prompt: "A dream diary", expect: "Kicked off the project", tab: "Write", after: "New entry" },
];

for (const d of DEMOS) {
  test(`generates and runs: ${d.prompt}`, async ({ page }) => {
    const errors = collectErrors(page);
    const app = await buildApp(page, d.prompt);
    await expect(app.getByText(d.expect).first()).toBeVisible({ timeout: 30_000 });
    await app.getByText(d.tab, { exact: true }).click();
    await expect(app.getByText(d.after).first()).toBeVisible();
    await expect(page.getByText("The app hit an error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("habit tracker: data persists and store listing is complete", async ({ page }) => {
  const app = await buildApp(page, "A habit tracker");
  await app.getByText("Add", { exact: true }).click();
  await app.getByPlaceholder("e.g. Walk 5,000 steps").fill("Stretch");
  await app.getByText("Add habit").click();
  await expect(app.getByText("Stretch")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).first().click();
  // Honest checklist: the default com.appmaker ID and missing store links aren't "ready".
  await expect(page.getByText("10/13")).toBeVisible();
  await expect(page.getByText("Also needed in the stores")).toBeVisible();
  await page.getByLabel("Bundle ID / package name").fill("com.janedoe.streakly");
  await page.getByLabel("Support page URL").fill("https://janedoe.com/support");
  await page.getByLabel("Privacy policy URL").fill("https://janedoe.com/privacy");
  await expect(page.getByText("13/13")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Expo project" }).click()]);
  expect(download.suggestedFilename()).toBe("streakly-expo.zip");
});

test("a crashing app shows the error banner", async ({ page }) => {
  const app = await buildApp(page, "A dream diary");
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Code" }).click();
  await page
    .getByLabel("Source of App.js")
    .fill("import { View } from 'react-native';\nexport default function App() { const x = undefined; return <View>{x.boom}</View>; }\n");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("The app hit an error")).toBeVisible({ timeout: 15_000 });
  // Demo mode can't edit apps, so it points to AI settings / History instead of a dead button.
  await expect(page.getByRole("button", { name: "Fix with AI" })).toHaveCount(0);
  await expect(page.getByText(/Automatic fixing needs an AI key/)).toBeVisible();
});

test("projects dashboard lists saved apps", async ({ page }) => {
  const app = await buildApp(page, "A budget planner");
  await expect(app.getByText("Left to spend")).toBeVisible({ timeout: 30_000 });
  await page.goto("/projects");
  await expect(page.getByText("Pocketwise")).toBeVisible();
});

test("builder works on a phone @mobile", async ({ page }) => {
  const app = await buildApp(page, "A habit tracker");
  await expect(app.getByText("Today").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.getByPlaceholder("Ask for a change…")).toBeVisible();
});
