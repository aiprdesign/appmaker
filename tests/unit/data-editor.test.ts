import { describe, expect, it } from "vitest";
import { addStep, collectionRequest, fieldRequest, removeStep, screenName, toFieldName, usedBy } from "@/lib/data-editor";
import { parseRules } from "@/lib/app-data";
import { READY_PRESETS, readyRules, trackerStages } from "@/lib/ready-app";

const rules = parseRules({
  menu: { access: "public", fields: ["name", "price"] },
  orders: { access: "inbox", fields: ["name", "phone", "items"], statuses: ["new", "preparing", "ready", "collected"] },
});

describe("Your data", () => {
  it("turns words into field names, and refuses what must never be collected", () => {
    expect(toFieldName("Table number")).toBe("tableNumber");
    expect(toFieldName("  Allergies / notes ")).toBe("allergiesNotes");
    expect(() => toFieldName("Card number")).toThrow(/never stored/);
    expect(() => toFieldName("Password")).toThrow(/never stored/);
    expect(() => toFieldName("2nd phone")).toThrow(/Start the name with a letter/);
  });

  it("adds a step before the last one, and keeps the first, last and cancelled steps", () => {
    const next = addStep(rules, "orders", "Out for delivery");
    expect(next.orders.statuses).toEqual(["new", "preparing", "ready", "out for delivery", "collected", "cancelled"]);
    expect(parseRules(next)).toEqual(next); // the server accepts it as it is
    expect(() => addStep(next, "orders", "ready")).toThrow(/already/);
    expect(() => addStep(rules, "menu", "x")).toThrow(/Only orders/);
    expect(removeStep(next, "orders", "preparing").orders.statuses).toEqual(["new", "ready", "out for delivery", "collected", "cancelled"]);
    expect(() => removeStep(rules, "orders", "new")).toThrow(/always kept/);
    expect(() => removeStep(rules, "orders", "collected")).toThrow(/always kept/);
    expect(() => removeStep(rules, "orders", "cancelled")).toThrow(/always kept/);
  });

  it("knows which screens use what, so nothing a screen needs can simply disappear", () => {
    const files = {
      "src/screens/MenuScreen.js": "const { items } = useCollection('menu');",
      "src/screens/HomeScreen.js": "useCollection(\"menu\"); useCollection('orders')",
      "src/appdata.js": "export function useCollection(collection) {} useCollection('menu')",
    };
    expect(usedBy(files)).toEqual({ menu: ["src/screens/MenuScreen.js", "src/screens/HomeScreen.js"], orders: ["src/screens/HomeScreen.js"] });
    expect(screenName("src/screens/MenuScreen.js")).toBe("Menu screen");
  });

  it("asks the AI to change the forms with the data", () => {
    expect(fieldRequest("orders", { add: "tableNumber" })).toMatch(/Add a field “Table number” \(tableNumber\) to orders: add it to src\/data-rules.json and to the screen or form/);
    expect(fieldRequest("orders", { remove: "items" })).toMatch(/out of every form and screen/);
    expect(collectionRequest("reviews with stars")).toMatch(/reviews with stars/);
  });

  it("ready-made apps' trackers follow the steps the business set", () => {
    const p = READY_PRESETS["pizza-takeaway"];
    const r = addStep(readyRules(p, p.sample), "requests", "Out for delivery");
    expect(trackerStages(p, r).map((s) => s.label)).toEqual(["Order received", "In the oven", "Ready for pickup", "Out for delivery", "Collected"]);
    expect(trackerStages(p, r)[3]).toMatchObject({ status: "out for delivery", icon: "CircleDot" });
    expect(trackerStages(p, null).map((s) => s.status)).toEqual(["new", "in the oven", "ready", "collected"]);
  });
});
