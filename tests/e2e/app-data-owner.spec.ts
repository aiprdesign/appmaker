import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The business's owner page for app data. Needs TEST_DATABASE_URL (accounts and data live in the database).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

const RULES = {
  menu: { access: "public", fields: ["name", "price"], seed: [{ name: "Margherita", price: "12" }] },
  orders: { access: "inbox", fields: ["name", "items"], statuses: ["new", "preparing", "ready"] },
};

test("the owner page chimes and counts new orders, moves them on and sets the staff PIN", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.67.0.1" } });
  const page = await ctx.newPage();
  await page.goto("/");
  const email = `owner-${Date.now()}@appdata.example.com`;
  expect((await page.request.post("/api/auth/signup", { data: { email, password: "correct horse" } })).ok()).toBe(true);
  const res = await page.request.post("/api/appdata", { data: { projectId: "e2eproj001", name: "Luigi's", rules: RULES } });
  expect(res.ok()).toBe(true);
  const { store } = await res.json();

  await page.goto(store.ownerUrl);
  await expect(page.getByRole("heading", { name: "Luigi's", level: 1 })).toBeVisible();
  await expect(page).not.toHaveURL(/#k=/); // the key leaves the address bar
  await expect(page.getByRole("tab", { name: /Orders/ })).toHaveAttribute("aria-selected", "true");

  // A customer orders from the app: the open page hears it straight away.
  await page.waitForTimeout(1500); // the page opens its live connection
  const device = "deviceE2EE2EE2EE2EE2EE2EE2E1234";
  await page.request.post(store.apiUrl, { data: { collection: "orders", data: { name: "Ana", items: "2 Margherita" } }, headers: { "x-device": device } });
  // No Refresh: the live connection brings it (the backup check is 30 seconds away).
  await expect(page.getByRole("status").filter({ hasText: "1 new since you last looked" })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle(/^\(1\) New · Luigi's: app data/);

  // Move it on: the customer sees the status.
  await expect(page.getByText("Just now")).toBeVisible();
  await page.getByRole("button", { name: "Mark as preparing" }).click();
  await page.getByLabel("Status").selectOption("ready");
  await expect
    .poll(async () => (await (await page.request.get(`${store.apiUrl}?collection=orders`, { headers: { "x-device": device } })).json()).items[0].status)
    .toBe("ready");

  // Finished orders move to Done; staff PIN for staff mode in the app is under Alerts and staff PIN.
  await expect(page.getByText("All caught up.")).toBeVisible();
  await page.getByRole("button", { name: "Done (1)" }).click();
  await expect(page.getByText("2 Margherita")).toBeVisible();
  await page.getByText("Alerts and staff PIN").click();
  await page.getByLabel("Staff PIN (6 to 8 digits)").fill("246810");
  await page.getByRole("button", { name: "Set PIN" }).click();
  await expect(page.getByText("Staff PIN saved.")).toBeVisible();
  expect((await page.request.post(`${store.apiUrl}/staff`, { data: { pin: "246810" } })).ok()).toBe(true);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  await ctx.close();
});

test("while developing, an app that needs a database gets one by itself; one that doesn't, doesn't", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.67.0.7" } });
  const page = await ctx.newPage();
  await page.goto("/");
  expect((await page.request.post("/api/auth/signup", { data: { email: `auto-${Date.now()}@appdata.example.com`, password: "correct horse" } })).ok()).toBe(true);

  // A pizza app takes orders: its database turns on, and the owner page is one click away.
  await page.goto("/");
  await page.getByRole("button", { name: /Pizza & takeaway/ }).click();
  await expect(page.getByRole("link", { name: /Owner page/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /Owner page/ })).toHaveAttribute("href", /\/owner\/data\/.+#k=/);

  // A habit tracker keeps its data on the phone: no database, no owner page.
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("link", { name: /Owner page/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Owner page", exact: true })).toHaveCount(0);
  await ctx.close();
});

test("the owner page installs as a Home Screen app, and asks for the owner link when opened without it", async ({ page }) => {
  const res = await page.request.get("/owner/data/abc123/app.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ start_url: "/owner/data/abc123", display: "standalone" });
  const icon = await page.request.get(manifest.icons[0].src);
  expect(icon.headers()["content-type"]).toContain("image/png");

  await page.goto("/owner/data/abc123");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/owner/data/abc123/app.webmanifest");
  await expect(page.getByRole("heading", { name: "Open your owner page" })).toBeVisible();
  await page.getByLabel("Owner link").fill("https://example.com/somewhere-else");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Paste the owner link for this app")).toBeVisible();
});
