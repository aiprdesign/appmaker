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

describe("model artifacts", () => {
  it("drops control markup some models leak into files", () => {
    const raw = `<plan>x</plan>\n<file path="src/storage.js">\nexport function load() {\n  return 1;\n}\n</｜DSML｜ parameter>\n</file>\n<file path="App.js">\n<｜end▁of▁sentence｜>export default () => null;<|im_end|>\n</parameter>\n</file>`;
    const parsed = parseGeneration(raw);
    expect(parsed.files["src/storage.js"]).toBe("export function load() {\n  return 1;\n}\n");
    expect(parsed.files["App.js"]).toBe("export default () => null;\n");
  });

  it("leaves real code that looks similar alone", () => {
    const code = "const a = x || y;\nconst el = <View>{a | b}</View>;\nexport default () => el;";
    expect(parseGeneration(`<file path="App.js">\n${code}\n</file>`).files["App.js"]).toBe(`${code}\n`);
  });
});

describe("cleaning saved apps", () => {
  it("repairs files saved with model markup and leaves clean ones untouched", async () => {
    const { cleanFiles } = await import("@/lib/parse");
    const dirty = { "src/storage.js": "export const a = 1;\n</｜DSML｜ parameter>\n", "App.js": "export default () => null;\n" };
    expect(cleanFiles(dirty)).toEqual({ "src/storage.js": "export const a = 1;\n", "App.js": "export default () => null;\n" });
    const clean = { "App.js": "export default () => null;\n" };
    expect(cleanFiles(clean)).toBe(clean);
  });
});
