import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The admin dashboard. Needs TEST_DATABASE_URL (switches and members live in the database).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

async function adminSignIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
}

test("admin: password, overview, members and switches", async ({ page, browser }) => {
  // A member to find.
  const email = `member-${Date.now()}@example.com`;
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto("/login");
  await vp.getByRole("tab", { name: "Create account" }).click();
  await vp.getByLabel("Email").fill(email);
  await vp.getByLabel("Password").fill("correct horse battery");
  await vp.getByRole("button", { name: "Create account" }).last().click();
  await expect(vp).toHaveURL(/\/projects$/);

  // Wrong password first.
  await page.goto("/admin");
  await page.getByLabel("Admin password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That's not the admin password." })).toBeVisible();
  await adminSignIn(page);

  // Overview: stat tiles and the sign-ups chart with a table view.
  await expect(page.getByText("Members", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: /Sign-ups per day for the last 14 days/ })).toBeVisible();
  await page.getByText("Show as table").click();
  await expect(page.getByRole("columnheader", { name: "Sign-ups" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Members: search finds the new member.
  await page.getByRole("tab", { name: "members" }).click();
  await page.getByLabel("Search members by email").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Password")).toBeVisible();

  // Settings: Google starts off; switching website import off hides it on the home page.
  await page.getByRole("tab", { name: "settings" }).click();
  await expect(page.getByRole("switch", { name: "Sign in with Google" })).toHaveAttribute("aria-checked", "false");
  const websiteSwitch = page.getByRole("switch", { name: "Build from a website" });
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "true");
  await websiteSwitch.click();
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "false");
  await vp.goto("/");
  await expect(vp.getByRole("tab", { name: "Describe an idea" })).toBeVisible();
  await expect(vp.getByRole("tab", { name: "From a website" })).toHaveCount(0);
  await websiteSwitch.click();
  await expect(websiteSwitch).toHaveAttribute("aria-checked", "true");
  await vp.reload();
  await expect(vp.getByRole("tab", { name: "From a website" })).toBeVisible();

  // Signing out of admin locks it again.
  await page.getByRole("button", { name: "Sign out of admin" }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  await visitor.close();
});

test("admin sees and opens the apps members made", async ({ page, browser }) => {
  const email = `maker-${Date.now()}@example.com`;
  const member = await browser.newContext();
  const mp = await member.newPage();
  await mp.goto("/login");
  await mp.getByRole("tab", { name: "Create account" }).click();
  await mp.getByLabel("Email").fill(email);
  await mp.getByLabel("Password").fill("correct horse battery");
  await mp.getByRole("button", { name: "Create account" }).last().click();
  await expect(mp).toHaveURL(/\/projects$/);
  // Build an app (demo mode makes a sample habit tracker) and let it sync.
  await mp.goto("/");
  await mp.getByLabel("Describe your app").fill("A habit tracker");
  await mp.keyboard.press("Enter");
  await expect(mp.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(mp.getByRole("status", { name: "Saved to your account" })).toBeVisible({ timeout: 15_000 });
  // The badge can show before a brand-new app's first save lands; wait for the account to have it.
  await expect.poll(async () => ((await (await mp.request.get("/api/projects")).json()).projects ?? []).length, { timeout: 20_000 }).toBe(1);

  await adminSignIn(page);
  // From the member's row to their apps.
  await page.getByRole("tab", { name: "members" }).click();
  await page.getByLabel("Search members by email").fill(email);
  await page.getByRole("button", { name: `Show ${email}'s 1 apps` }).click();
  await expect(page.getByRole("tab", { name: "apps" })).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("list", { name: "Apps" }).getByRole("listitem");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(email);

  // View it: live preview, listing and code, read-only.
  await card.getByRole("button", { name: /^View / }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(viewer.getByText("Original idea")).toBeVisible();
  await viewer.getByRole("tab", { name: /Code/ }).click();
  await expect(viewer.getByRole("button", { name: "App.js" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  // Delete it.
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: /^Delete / }).click();
  await expect(page.getByText(/^Deleted “/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Apps" })).toHaveCount(0);
  await member.close();
});

test("admin is warned about unsafe code in a member's app, and its preview waits", async ({ page, browser }) => {
  const email = `sneaky-${Date.now()}@example.com`;
  const member = await browser.newContext();
  const mp = await member.newPage();
  await mp.goto("/login");
  await mp.getByRole("tab", { name: "Create account" }).click();
  await mp.getByLabel("Email").fill(email);
  await mp.getByLabel("Password").fill("correct horse battery");
  await mp.getByRole("button", { name: "Create account" }).last().click();
  await expect(mp).toHaveURL(/\/projects$/);
  await mp.goto("/");
  await mp.getByLabel("Describe your app").fill("A habit tracker");
  await mp.keyboard.press("Enter");
  await expect(mp.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 30_000 });
  // A hand edit in the Code tab adds eval().
  await mp.getByRole("button", { name: "Code" }).click();
  const editor = mp.getByRole("textbox", { name: /Source of App\.js/ });
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially("\nconst hidden = eval('1 + 1');\n");
  const id = new URL(mp.url()).pathname.split("/").pop();
  await expect
    .poll(async () => ((await (await mp.request.get(`/api/projects/${id}`)).json()).project?.files?.["App.js"] ?? "") as string, { timeout: 20_000 })
    .toContain("eval('1 + 1')");

  await adminSignIn(page);
  await page.getByRole("tab", { name: "apps" }).click();
  await page.getByLabel(/Search apps/).fill(email);
  const card = page.getByRole("list", { name: "Apps" }).getByRole("listitem").filter({ hasText: email });
  await card.getByRole("button", { name: /^View / }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("alert")).toContainText("The safety check found code");
  await expect(viewer.getByRole("alert")).toContainText("eval()");
  await expect(viewer.getByText("Preview paused because of the safety check.")).toBeVisible();
  await expect(viewer.locator('iframe[title="App preview"]')).toHaveCount(0);
  await viewer.getByRole("button", { name: "Run it in the sandbox anyway" }).click();
  await expect(viewer.frameLocator('iframe[title="App preview"]').getByText(/habit/i).first()).toBeVisible({ timeout: 20_000 });
  await member.close();
});
