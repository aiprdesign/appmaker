import { describe, expect, it } from "vitest";
import { summarizeHtml } from "@/lib/site";

const url = new URL("https://luigis.example/menu");

describe("menu items and prices from a website", () => {
  it("reads a schema.org menu, with sections, prices and photos", () => {
    const menu = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "Luigi's",
      hasMenu: {
        "@type": "Menu",
        hasMenuSection: [
          {
            "@type": "MenuSection",
            name: "Pizza",
            hasMenuItem: [
              { "@type": "MenuItem", name: "Margherita", description: "Tomato, mozzarella", offers: { "@type": "Offer", price: "11", priceCurrency: "USD" }, image: "/img/margherita.jpg" },
              { "@type": "MenuItem", name: "Diavola", offers: { price: 13.5, priceCurrency: "GBP" } },
            ],
          },
        ],
      },
    };
    const { details } = summarizeHtml(`<html><head><script type="application/ld+json">${JSON.stringify(menu)}</script></head><body><p>Hi</p></body></html>`, url);
    expect(details.items).toEqual([
      { name: "Margherita", description: "Tomato, mozzarella", price: "$11", category: "Pizza", image: "https://luigis.example/img/margherita.jpg" },
      { name: "Diavola", description: "", price: "£13.50", category: "Pizza" },
    ]);
  });

  it("reads a price list written in the page, with its heading as the category", () => {
    const html = `<html><body><main>
      <h2>Haircuts</h2>
      <ul>
        <li><strong>Men's cut</strong> Wash and style <span>$25</span></li>
        <li><strong>Skin fade</strong> Clipper fade <span>$30</span></li>
        <li><strong>Kids' cut</strong> Under 12 <span>$18</span></li>
      </ul>
      <footer><p>Gift cards from $10</p></footer>
    </main></body></html>`;
    const { details } = summarizeHtml(html, url);
    expect(details.items.map((i) => [i.name, i.price, i.category])).toEqual([
      ["Men's cut", "$25", "Haircuts"],
      ["Skin fade", "$30", "Haircuts"],
      ["Kids' cut", "$18", "Haircuts"],
    ]);
    expect(details.items[0].description).toBe("Wash and style");
  });

  it("doesn't mistake a page with a price or two for a price list", () => {
    const { details } = summarizeHtml(`<html><body><p>Delivery from $5. Gift cards from $10.</p><p>Open every day.</p></body></html>`, url);
    expect(details.items).toEqual([]);
  });
});

describe("menu items written as headings", () => {
  it("reads 'Name — $price' headings, under the page's own heading", () => {
    const { details } = summarizeHtml(`<html><body><main><h1>Menu</h1><h2>Cacio e pepe — $19</h2><h2>Margherita pizza — $16</h2><h2>Tiramisu — $9</h2></main></body></html>`, url);
    expect(details.items.map((i) => [i.name, i.price])).toEqual([
      ["Cacio e pepe", "$19"],
      ["Margherita pizza", "$16"],
      ["Tiramisu", "$9"],
    ]);
  });
});
