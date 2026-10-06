import { describe, expect, it } from "vitest";
import { buildingParts, buildProgress, colorName, friendlyFile, kebabIcon, progressNote, takeSignals, type LiveGeneration } from "@/lib/progress";
import { autoDesign, PALETTES } from "@/lib/design";

describe("build progress", () => {
  it("names files the way people would", () => {
    expect(friendlyFile("src/screens/HomeScreen.js")).toBe("Home screen");
    expect(friendlyFile("App.js")).toBe("App");
    expect(friendlyFile("src/components/habit-row.jsx")).toBe("Habit row");
  });
  it("moves through the steps as the AI streams", () => {
    expect(buildProgress(null).stage).toBe(0);
    const base = { plan: "", summary: "", files: {}, deleted: [], listing: null, writing: null };
    expect(buildProgress({ ...base, plan: "A habit app" }).stage).toBe(1);
    const writing = buildProgress({ ...base, plan: "x", files: { "App.js": "" }, writing: "App.js" });
    expect(writing.stage).toBe(2);
    expect(writing.steps[2]).toBe("Writing code (1 file)");
    expect(buildProgress({ ...base, plan: "x", files: { "App.js": "" }, listing: { name: "Streakly" } }).stage).toBe(3);
  });
});

describe("signs of life while the AI works", () => {
  const base = { plan: "", summary: "", files: {}, deleted: [], listing: null, writing: null };
  it("removes the server's signals and notices thinking", () => {
    expect(takeSignals('<plan>Hi<alive/></plan><file path="App.js">a<thinking/>b</file>')).toEqual({
      text: '<plan>Hi</plan><file path="App.js">ab</file>',
      thinking: true,
    });
    expect(takeSignals("<alive/>").thinking).toBe(false);
  });
  it("says the AI is thinking, then warns when it's slow or the connection drops", () => {
    const start = 1_000_000;
    expect(buildProgress({ ...base, thinking: true }).steps[0]).toBe("Thinking through your idea");
    expect(progressNote({ ...base, thinking: true, lastActivity: start + 60_000 }, start, start + 61_000)?.text).toMatch(/thinking through your app/);
    expect(progressNote({ ...base, lastActivity: start + 200_000 }, start, start + 200_000)).toMatchObject({
      stalled: true,
      text: expect.stringMatching(/hasn't started writing after 3 minutes/),
    });
    expect(progressNote({ ...base, lastActivity: start }, start, start + 50_000)).toMatchObject({
      stalled: true,
      text: expect.stringMatching(/connection.*dropped/),
    });
    expect(progressNote({ ...base, plan: "x", files: { "App.js": "" }, lastActivity: start + 95_000 }, start, start + 95_000)?.stalled).toBe(false);
  });
});

describe("the app taking shape on the phone", () => {
  const live = (files: Record<string, string>, extra: Partial<LiveGeneration> = {}): LiveGeneration => ({
    plan: "p",
    summary: "",
    files,
    deleted: [],
    listing: null,
    writing: null,
    ...extra,
  });
  const home = `import { House, HeartIcon, LucideShoppingBag, Search as Find } from 'lucide-react-native';
const hero = { uri: 'https://cdn.example.com/hero.jpg?w=800' };
const team = "https://images.unsplash.com/photo-123?w=400";
const notAPhoto = 'https://example.com/menu';`;

  it("collects the icons and photos the code uses, in order, with a feed of what was added", () => {
    const parts = buildingParts(live({ "App.js": home, "src/screens/Menu.js": "import { House, Coffee } from 'lucide-react-native';" }, { writing: "src/screens/Menu.js" }));
    expect(parts.icons).toEqual(["House", "Heart", "ShoppingBag", "Search", "Coffee"]);
    expect(parts.images).toEqual(["https://cdn.example.com/hero.jpg?w=800", "https://images.unsplash.com/photo-123?w=400"]);
    expect(parts.imagesFromSite).toBe(false);
    expect(parts.colors).toBeNull();
    // The latest four; the file still being written isn't "ready" yet.
    expect(parts.events.map((e) => e.text)).toEqual(["Added the first photo", "Added photo 2", "App ready", "Added the coffee icon"]);
  });

  it("shows the website's photos and colors before the code uses them", () => {
    const source = { siteName: "Luigi's", colors: ["#B91C1C", "#F59E0B"], images: ["https://luigis.example/a.jpg", "http://insecure.example/b.jpg"], logo: "https://luigis.example/logo.png" };
    const parts = buildingParts(live({}), { source });
    expect(parts.images).toEqual(["https://luigis.example/logo.png", "https://luigis.example/a.jpg"]);
    expect(parts.imagesFromSite).toBe(true);
    expect(parts.colors).toEqual({ primary: "#B91C1C", accent: "#F59E0B", name: "Brand colors from Luigi's" });
    expect(parts.events.map((e) => e.text)).toEqual(["Found 2 photos on Luigi's", "Brand colors from Luigi's"]);
  });

  it("picks the color scheme once the AI names the brand color, unless the person chose one", () => {
    const prompt = "a habit tracker";
    const auto = (primaryColor: string) => autoDesign({ primaryColor }, prompt);
    const named = buildingParts(live({}, { listing: { primaryColor: "#4F46E5" } }), { palettes: PALETTES, autoColors: auto });
    expect(buildingParts(live({}), { palettes: PALETTES, autoColors: auto }).events.map((e) => e.text)).toEqual(["Trying colors: Aurora"]);
    expect(named.colors).toMatchObject({ primary: "#4F46E5", name: "Aurora" });
    expect(named.events.at(-1)?.text).toBe("Picked colors: Aurora");
    const chosen = buildingParts(live({}, { listing: { primaryColor: "#4F46E5" } }), { design: { primary: "#0369A1", accent: "#0D9488" }, palettes: PALETTES, autoColors: auto });
    expect(chosen.colors).toEqual({ primary: "#0369A1", accent: "#0D9488", name: "Ocean" });
  });

  it("names custom colors the way people say them", () => {
    const auto = (primaryColor: string) => autoDesign({ primaryColor }, "an Italian restaurant");
    const parts = buildingParts(live({}, { listing: { primaryColor: "#B91C1C" } }), { palettes: PALETTES, autoColors: auto });
    expect(parts.events.at(-1)?.text).toMatch(/^Picked colors: Red( and [a-z]+)?$/);
    expect(colorName("#B91C1C")).toBe("red");
    expect(colorName("#0369A1")).toBe("blue");
    expect(colorName("#15803D")).toBe("green");
    expect(colorName("#7C4A2D")).toBe("brown");
    expect(colorName("#334155")).toBe("blue");
    expect(colorName("#333333")).toBe("gray");
  });

  it("names icons the way lucide-react loads them", () => {
    expect(kebabIcon("ShoppingBag")).toBe("shopping-bag");
    expect(kebabIcon("Building2")).toBe("building-2");
    expect(kebabIcon("Grid2x2")).toBe("grid-2x2");
    expect(kebabIcon("House")).toBe("house");
  });
});
