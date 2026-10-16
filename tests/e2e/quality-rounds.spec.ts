import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { READY_PRESETS, readyAppFiles, readyDesign } from "@/lib/ready-app";
import { buildPreviewHtml } from "@/lib/preview";
import { writeFileSync } from "node:fs";

/**
 * Ten quality checks on every ready-made app, in a real browser (run with QA_ROUNDS=1; findings go to QA_OUT):
 * 1 no errors · 2 every tab opens · 3 picking an item works · 4 sending shows the live tracker · 5 dark mode contrast
 * 6 contact details on Info · 7 accessibility · 8 tap targets ≥ 44 · 9 nothing overflows on a 320px phone · 10 first screen under 4s
 */
test.skip(!process.env.QA_ROUNDS, "set QA_ROUNDS=1 to run the quality rounds");
test.describe.configure({ mode: "parallel" });
const OUT = process.env.QA_OUT ?? "test-results";
type Finding = { round: number; slug: string; issue: string };

async function open(page: Page, slug: string, scheme: "light" | "dark", width = 390) {
  const preset = READY_PRESETS[slug];
  const files = readyAppFiles(preset, preset.sample, readyDesign(preset.sample, slug));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/robots.txt");
  const t0 = Date.now();
  await page.setContent(buildPreviewHtml(files, new URL(page.url()).origin, "ios", scheme));
  await expect(page.getByText(preset.sample.name).first()).toBeVisible({ timeout: 20_000 });
  return { preset, errors, ms: Date.now() - t0 };
}

for (const slug of Object.keys(READY_PRESETS)) {
  test(`qa ${slug}`, async ({ page }) => {
    test.setTimeout(180_000);
    const f: Finding[] = [];
    const add = (round: number, issue: string) => f.push({ round, slug, issue });
    // 1: renders cleanly. 10: fast to first screen.
    const { preset, errors, ms } = await open(page, slug, "light");
    if (ms > 4000) add(10, `first screen took ${ms}ms`);
    // 2: every tab opens.
    for (const tab of ["Info", preset.itemsTab, "Home"]) {
      const t = page.getByRole("tab", { name: tab, exact: true });
      if (!(await t.count())) { add(2, `tab "${tab}" missing`); continue; }
      await t.click();
      await page.waitForTimeout(400);
    }
    // 7: accessibility (names, roles, contrast) on Home and the items list.
    for (const where of ["Home", preset.itemsTab]) {
      await page.getByRole("tab", { name: where, exact: true }).click();
      await page.waitForTimeout(1500);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["region", "landmark-one-main", "page-has-heading-one", "html-has-lang", "document-title"]).analyze();
      for (const v of axe.violations) add(7, `${where}: ${v.id} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`.slice(0, 260));
    }
    // 8: tap targets at least 44pt.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[role="button"],[role="tab"],button,[role="switch"]')]
        .map((e) => ({ r: e.getBoundingClientRect(), n: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40) }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 && r.height < 44))
        .map(({ r, n }) => `${n} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    if (small.length) add(8, `small tap targets: ${small.slice(0, 4).join("; ")}`);
    // 3: picking an item fills the basket / request.
    const first = preset.sample.items[0]?.name;
    if (first) {
      await page.getByRole("tab", { name: preset.itemsTab, exact: true }).click();
      await page.waitForTimeout(600);
      const pick = page.locator(`[role="button"][aria-label$="${first.replace(/"/g, '\\"')}"], [role="button"][aria-label*="${first.replace(/"/g, '\\"')},"]`).first();
      if (process.env.QA_DEBUG) console.log("PICK", slug, first, await pick.count(), await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].map((e) => e.getAttribute("aria-label")).filter(Boolean).slice(0, 12).join(" | ")));
      if (await pick.count()) {
        await pick.click();
        await page.waitForTimeout(500);
        if (process.env.QA_DEBUG) await page.screenshot({ path: `${OUT}/${slug}-picked.png` });
      } else add(3, `no button to pick "${first}"`);
    }
    // 4: the request form can be filled and sent, and the tracker appears.
    await page.getByRole("tab", { name: preset.kind === "order" ? undefined : undefined }).nth(2).click();
    await page.waitForTimeout(600);
    const nameBox = page.getByLabel("Your first name");
    if (await nameBox.count()) {
      await nameBox.fill("Ana");
      await page.getByLabel("Phone", { exact: true }).fill("5550100");
      if (await page.getByLabel("Address").count()) await page.getByLabel("Address").fill("1 High St");
      const details = page.locator("textarea").last();
      if (await details.count()) await details.fill("Test request");
      const send = page.getByRole("button", { name: /^(Send|Request|Book|Ask|Get|Place)/ }).last();
      await send.click().catch(() => add(4, "send button not clickable"));
      const ok = await page.getByText(/Your order|Your booking|Your request/).first().isVisible({ timeout: 8000 }).catch(() => false);
      if (!ok) { add(4, "after sending, no live tracker was shown"); await page.screenshot({ path: `${OUT}/${slug}-send.png`, fullPage: true }); }
    } else add(4, "request form not found");
    // 9: small phones (320 wide) don't scroll sideways or cut text.
    const p2 = await page.context().newPage();
    const o2 = await open(p2, slug, "light", 320);
    await p2.waitForTimeout(1500);
    const wide = await p2.evaluate(() =>
      [...document.querySelectorAll("div")]
        .filter((d) => d.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(d).overflowX === "visible" && !d.closest('[style*="overflow-x: auto"], [style*="overflow: auto"], .r-150rngu, [class*="ScrollView"]'))
        .map((d) => (d.textContent || "").trim().slice(0, 40) + " →" + Math.round(d.getBoundingClientRect().right)),
    );
    if (wide.length) add(9, `overflows at 320px: ${wide.slice(0, 3).join("; ")}`);
    errors.push(...o2.errors);
    await p2.close();
    // 5: dark mode renders cleanly and passes contrast.
    const p3 = await page.context().newPage();
    const o3 = await open(p3, slug, "dark");
    await p3.waitForTimeout(1500); // let fade-ins finish before measuring contrast
    const axe = await new AxeBuilder({ page: p3 }).withRules(["color-contrast"]).analyze();
    for (const v of axe.violations) for (const n of v.nodes) add(5, `dark: ${n.html.slice(0, 90)} :: ${n.failureSummary?.split("\n")[1]?.slice(0, 110) ?? ""}`);
    errors.push(...o3.errors);
    await p3.close();
    // 6: Info has the business's contact details.
    await page.getByRole("tab", { name: "Info", exact: true }).click();
    await page.waitForTimeout(500);
    if (preset.sample.phone && !(await page.getByText(preset.sample.phone).count())) add(6, "phone number missing on Info");
    if (preset.sample.address && !(await page.getByText(preset.sample.address.split(",")[0]).count())) add(6, "address missing on Info");
    for (const e of [...new Set(errors)]) add(1, e);
    writeFileSync(`${OUT}/${slug}.json`, JSON.stringify(f, null, 1));
    expect(f, slug).toEqual([]);
  });
}
