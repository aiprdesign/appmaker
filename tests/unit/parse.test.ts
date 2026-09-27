import { describe, expect, it } from "vitest";
import { parseGeneration } from "@/lib/parse";

const FULL = [
  "<plan>Build a timer</plan>",
  '<file path="App.js">',
  "```jsx",
  "export default function App() { return null; }",
  "```",
  "</file>",
  '<file path="./src/util.js">',
  "export const add = (a, b) => a + b;",
  "</file>",
  '<delete path="src/old.js"/>',
  '<listing>{"name":"Timer","bundleId":"com.example.timer"}</listing>',
  "<summary>Done.\n- Add sounds</summary>",
].join("\n");

describe("parseGeneration", () => {
  it("parses a complete response", () => {
    const p = parseGeneration(FULL);
    expect(p.plan).toBe("Build a timer");
    expect(p.files).toEqual({
      "App.js": "export default function App() { return null; }\n",
      "src/util.js": "export const add = (a, b) => a + b;\n",
    });
    expect(p.deleted).toEqual(["src/old.js"]);
    expect(p.listing).toEqual({ name: "Timer", bundleId: "com.example.timer" });
    expect(p.summary).toContain("Add sounds");
    expect(p.writing).toBeNull();
  });

  it("tracks the file being written mid-stream", () => {
    const cut = FULL.indexOf("export const add") + 5;
    const p = parseGeneration(FULL.slice(0, cut));
    expect(Object.keys(p.files)).toEqual(["App.js", "src/util.js"]);
    expect(p.writing).toBe("src/util.js");
    expect(p.listing).toBeNull();
  });

  it("ignores an unfinished or malformed listing", () => {
    expect(parseGeneration('<listing>{"name":"X"').listing).toBeNull();
    expect(parseGeneration("<listing>{oops}</listing>").listing).toBeNull();
  });

  it("returns empty results for text without tags", () => {
    const p = parseGeneration("hello");
    expect(p.files).toEqual({});
    expect(p.plan).toBe("");
  });
});
