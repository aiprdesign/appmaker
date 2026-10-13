import { expect, test } from "@playwright/test";
import { A11Y_WIDGET } from "../../src/lib/site-a11y";
import { withSiteFeatures } from "../../src/lib/site-features";

const svg = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/></svg>`)}`;
const files = withSiteFeatures(
  {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home · Luigi's</title></head><body>
<main id="main"><h1>Luigi's</h1><img src="${svg("red")}" alt="The dining room" style="width:300px"><img src="${svg("blue")}" alt="Cacio e pepe" style="width:300px">
<form><label for="n">Name</label><input id="n" name="name" required><label for="e">Email</label><input id="e" type="email" name="email" required><button>Send</button></form></main>
<footer><p>© Luigi's</p></footer></body></html>`,
    "menu.html": `<!doctype html><html lang="en"><head><title>Menu · Luigi's</title></head><body><main><h1>Menu</h1><p>Handmade tagliatelle with ragù.</p></main><footer></footer></body></html>`,
  },
  { siteName: "Luigi's", phone: "+1 718 555 0142", email: "ciao@luigis.example", whatsapp: "17185550142", booking: "https://www.opentable.com/luigis", hours: ["Mo-Su 00:00-24:00"], primary: "#b91c1c" },
);
// The page as served, with its scripts inline (no server in the test).
const doc = files["index.html"]
  .replace('<script src="features.js" defer></script>', `<script>${files["search.js"]}</script><script>${files["features.js"]}</script>`)
  .replace("</body>", `<script>${A11Y_WIDGET}</script></body>`);

test("on phones: quick actions, open now, and nothing covers the accessibility button", async ({ page: p }) => {
  await p.setViewportSize({ width: 390, height: 800 });
  await p.setContent(doc);
  const bar = p.getByRole("navigation", { name: "Quick actions" });
  await expect(bar.getByRole("link")).toHaveText(["Call", "WhatsApp", "Book"]);
  await expect(bar.getByRole("link", { name: "Call Luigi's" })).toHaveAttribute("href", "tel:+17185550142");
  await expect(bar.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/17185550142");
  await expect(p.locator("footer [data-appmaker-open]")).toHaveText(/^Open now/);
  const widget = await p.locator(".a11y-ui").first().boundingBox();
  const barBox = await bar.boundingBox();
  expect(widget!.y + widget!.height).toBeLessThanOrEqual(barBox!.y);
  await p.setViewportSize({ width: 1280, height: 800 });
  await expect(bar).toBeHidden();
});

test("search, picture viewer and form help work with the keyboard", async ({ page: p }) => {
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.setContent(doc);
  // Search the whole site.
  await p.keyboard.press("/");
  const box = p.getByRole("searchbox", { name: "Search Luigi's" });
  await expect(box).toBeFocused();
  await box.fill("tagliatelle");
  await expect(p.getByRole("status").filter({ hasText: "found" })).toHaveText("1 page found");
  await expect(p.getByRole("link", { name: /^Menu/ })).toHaveAttribute("href", "menu.html");
  await p.keyboard.press("Escape");
  // Pictures open full size, arrows move between them, Escape returns focus.
  const pic = p.getByRole("button", { name: "The dining room, open full size" });
  await pic.focus();
  await p.keyboard.press("Enter");
  const viewer = p.getByRole("dialog", { name: "Picture" });
  await expect(viewer.locator("img")).toHaveAttribute("alt", "The dining room");
  await p.keyboard.press("ArrowRight");
  await expect(viewer.locator("img")).toHaveAttribute("alt", "Cacio e pepe");
  await p.keyboard.press("Escape");
  await expect(pic).toBeFocused();
  // Mistakes are explained in text, and the first one gets focus.
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByLabel("Name")).toBeFocused();
  await expect(p.getByText("Name is needed.")).toBeVisible();
  await p.getByLabel("Name").fill("Ana");
  await p.getByLabel("Email").fill("nope");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText("Enter an email address like name@example.com.")).toBeVisible();
  await expect(p.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  // Footer tools.
  await expect(p.locator("footer .am-tools button")).toHaveText(["Share this page", "Save to contacts", "Search this site"]);
});
