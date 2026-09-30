import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// UX & accessibility audit of Appmaker's own interface: every main screen at
// phone, tablet and desktop sizes, checked against WCAG 2.1 AA (axe-core),
// horizontal overflow, console errors and minimum tap-target size.

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
];

type Screen = { name: string; open: (page: Page) => Promise<void> };

async function buildDemoApp(page: Page) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Today").first()).toBeVisible({ timeout: 30_000 });
}

const SCREENS: Screen[] = [
  { name: "home", open: async (page) => void (await page.goto("/")) },
  { name: "home: website import open", open: async (page) => {
      await page.goto("/");
      await page.getByRole("tab", { name: "URL to App" }).click();
    } },
  { name: "home: AI settings dialog", open: async (page) => {
      await page.goto("/");
      await page.getByRole("button", { name: "AI model settings" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    } },
  { name: "my apps (empty)", open: async (page) => void (await page.goto("/projects")) },
  { name: "builder: chat + preview", open: async (page) => {
      await buildDemoApp(page);
      if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Chat" }).click();
    } },
  { name: "builder: code", open: async (page) => {
      await buildDemoApp(page);
      await page.getByRole("button", { name: "Code" }).click();
    } },
  { name: "builder: publish", open: async (page) => {
      await buildDemoApp(page);
      await page.getByRole("button", { name: "Publish" }).first().click();
      await expect(page.getByLabel("App name")).toBeVisible();
    } },
  { name: "my apps (with an app)", open: async (page) => {
      await buildDemoApp(page);
      await page.goto("/projects");
    } },
];

test.skip(({ isMobile }) => !!isMobile, "viewports are covered inside each test");

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    test(`${vp.name} · ${screen.name}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      page.on("pageerror", (e) => consoleErrors.push(e.message));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await screen.open(page);
      await page.waitForTimeout(300);

      // WCAG 2.1 AA. The phone preview renders the generated app, which is
      // audited separately by the app-quality grader.
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude('iframe[title="App preview"]').analyze();
      const violations = axe.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(violations, violations.join("\n")).toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);

      if (vp.name === "phone") {
        // WCAG 2.2 target size (minimum): 24×24 CSS px for controls.
        const small = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button], input, select, textarea, summary"))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && (r.width < 24 || r.height < 24);
            })
            .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`),
        );
        expect(small, `tap targets under 24px:\n${small.join("\n")}`).toEqual([]);
      }

      expect(consoleErrors).toEqual([]);
    });
  }
}

test("keyboard: build an app and use the settings dialog without a mouse", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").focus();
  await page.keyboard.type("A budget tracker");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/build\//);
  await page.goto("/");
  await page.getByRole("button", { name: "AI model settings" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("keyboard focus is always visible", async ({ page }) => {
  await page.goto("/");
  const invisible: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    // Visible = the focused element or one of its close ancestors (e.g. a
    // focus-within ring on a wrapper) looks different when focused.
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const chain = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean) as HTMLElement[];
      const snap = () => chain.map((n) => { const s = getComputedStyle(n); return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}|${s.borderColor}`; }).join("#");
      const focused = snap();
      el.blur();
      const blurred = snap();
      el.focus();
      return { visible: focused !== blurred, label: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"` };
    });
    if (info && !info.visible) invisible.push(info.label);
  }
  expect(invisible, `no visible focus indicator:\n${invisible.join("\n")}`).toEqual([]);
});
