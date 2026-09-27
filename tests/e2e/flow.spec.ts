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
  { prompt: "A habit tracker with streaks", expect: "Today", tab: "Stats", after: "Best streak" },
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
  await expect(page.getByText("8/8")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Expo project" }).click()]);
  expect(download.suggestedFilename()).toBe("streakly-expo.zip");
});

test("a crashing app shows the Fix with AI banner", async ({ page }) => {
  const app = await buildApp(page, "A dream diary");
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Code" }).click();
  await page
    .getByLabel("Source of App.js")
    .fill("import { View } from 'react-native';\nexport default function App() { const x = undefined; return <View>{x.boom}</View>; }\n");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("The app hit an error")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Fix with AI" })).toBeVisible();
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
