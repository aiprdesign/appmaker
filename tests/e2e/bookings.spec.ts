import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Simple booking. Needs TEST_DATABASE_URL (accounts, bookings and the admin switch live in the database).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");
// Both tests flip the same site-wide switch.
test.describe.configure({ mode: "serial" });

// One admin sign-in for the file: admin sign-ins are rate limited.
let admin: Page;
test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.66.0.1" } })).newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Admin password").fill("e2e-admin-password");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.getByRole("tab", { name: "settings" }).click();
});
test.afterAll(async () => {
  await bookingsSwitch(false);
  await admin.context().close();
});

async function bookingsSwitch(on: boolean) {
  const toggle = admin.getByRole("switch", { name: "Bookings" });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

test("bookings: off until admin turns it on, then book in the app and manage it on the owner page", async ({ browser }) => {
  const maker = await (await browser.newContext()).newPage();
  const email = `bookings-${Date.now()}@example.com`;
  await maker.goto("/login");
  await maker.getByRole("tab", { name: "Create account" }).click();
  await maker.getByLabel("Email").fill(email);
  await maker.getByLabel("Password").fill("correct horse battery");
  await maker.getByRole("button", { name: "Create account" }).last().click();
  await expect(maker).toHaveURL(/\/projects$/);

  await bookingsSwitch(false);
  await maker.goto("/");
  await maker.getByLabel("Describe your app").fill("A dream diary");
  await maker.keyboard.press("Enter");
  const app = maker.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  await maker.getByRole("button", { name: "Publish" }).first().click();
  await expect(maker.getByRole("region", { name: "Live updates from your website" })).toHaveCount(0);
  await expect(maker.getByRole("region", { name: "Bookings" })).toHaveCount(0);

  await bookingsSwitch(true);
  await maker.reload();
  await maker.getByRole("button", { name: "Publish" }).first().click();
  const panel = maker.getByRole("region", { name: "Bookings" });
  await expect(panel.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Sunday" })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "Sunday" }).check();
  await panel.getByLabel("Services (optional)").fill("Haircut, Colour");
  const request = maker.waitForRequest("**/api/generate");
  await panel.getByRole("button", { name: "Turn on bookings" }).click();
  // Appmaker asks the AI to add the Book tab, and shows the preview while it does.
  expect((await request).postDataJSON().prompt).toMatch(/Add a Book tab/);
  await expect(maker.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(maker.locator("aside").getByText(/Demo mode is active/)).toBeVisible({ timeout: 15_000 });
  await maker.getByRole("button", { name: "Publish" }).first().click();
  await expect(panel.getByText("Bookings are on.")).toBeVisible();
  // Demo mode can't edit apps, so show the booking screen by hand.
  await maker.getByRole("button", { name: "Code" }).click();
  await maker
    .getByLabel("Source of App.js")
    .fill(
      "import React from 'react';\nimport BookingScreen from './src/booking';\nexport default function App() { return <BookingScreen phone=\"+1 555 0100\" />; }\n",
    );
  await maker.getByRole("button", { name: "Preview", exact: true }).click();

  await expect(app.getByText("Book a time")).toBeVisible({ timeout: 15_000 });
  await app.getByText("Colour", { exact: true }).click();
  await app
    .getByText(/^\d{1,2}:\d{2} (AM|PM)$/)
    .first()
    .click();
  await app.getByPlaceholder("Your name").fill("Ana Test");
  await app.getByPlaceholder("Phone number").fill("+1 555 0142");
  await app.getByText(/^Book \d/).click();
  await expect(app.getByText(/^Booked for /)).toBeVisible();

  // The owner page shows it, and cancelling frees the time.
  await maker.getByRole("button", { name: "Publish" }).first().click();
  const [owner] = await Promise.all([maker.waitForEvent("popup"), panel.getByRole("link", { name: "Open bookings page" }).click()]);
  await expect(owner.getByText("Ana Test")).toBeVisible();
  await expect(owner.getByText("Colour · +1 555 0142")).toBeVisible();
  expect(owner.url()).not.toContain("#k=");
  const axe = await new AxeBuilder({ page: owner }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await owner.getByRole("button", { name: "Cancel Ana Test's booking" }).click();
  await owner.getByRole("button", { name: "Cancel booking" }).click();
  await expect(owner.getByText(/No bookings yet/)).toBeVisible();

  // The business opens the owner link without an account.
  const ownerUrl = await maker.evaluate(() =>
    fetch(`/api/bookings?projectId=${location.pathname.split("/").pop()}`)
      .then((r) => r.json())
      .then((d) => d.setup.ownerUrl),
  );
  const business = await (await browser.newContext()).newPage();
  await business.goto(ownerUrl);
  await expect(business.getByRole("heading", { name: "Upcoming bookings" })).toBeVisible();
  await business.getByRole("button", { name: "Block" }).click();
  await expect(business.getByText(/all day/)).toBeVisible();
  // Without the link, nothing.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(ownerUrl.split("#")[0]);
  await expect(stranger.getByText("Can't open bookings")).toBeVisible();

  // My apps links to the bookings page.
  await maker.goto("/projects");
  await expect(maker.getByRole("link", { name: "Bookings" })).toBeVisible();

  await bookingsSwitch(false);
});

test("the owner page works on a phone", async ({ browser }) => {
  await bookingsSwitch(true);
  const maker = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await maker.goto("/login");
  await maker.getByRole("tab", { name: "Create account" }).click();
  await maker.getByLabel("Email").fill(`bookings-phone-${Date.now()}@example.com`);
  await maker.getByLabel("Password").fill("correct horse battery");
  await maker.getByRole("button", { name: "Create account" }).last().click();
  await expect(maker).toHaveURL(/\/projects$/);
  const { setup } = await maker.evaluate(() =>
    fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "phone123abc",
        name: "Cuts",
        settings: {
          timezone: "UTC",
          slotMinutes: 30,
          hours: Array(7).fill({ open: "09:00", close: "17:00" }),
          services: [],
          daysAhead: 30,
          noticeMinutes: 60,
          clock: "12h",
        },
      }),
    }).then((r) => r.json()),
  );
  await maker.goto(setup.ownerUrl);
  await expect(maker.getByRole("heading", { name: "Cuts" })).toBeVisible();
  expect(await maker.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await bookingsSwitch(false);
});
