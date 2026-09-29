import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { babelStripTypes, fixRequest, ImportError, importApp, type UploadEntry } from "@/lib/import-app";

const require = createRequire(import.meta.url);
const strip = babelStripTypes(require("@babel/standalone"));
const up = (files: Record<string, string | null>): UploadEntry[] => Object.entries(files).map(([path, text]) => ({ path, text }));

describe("importing an uploaded app", () => {
  it("imports an Appmaker download as-is, with its store listing", () => {
    const app = importApp(
      up({
        "streaks/App.js": "import { theme } from './src/theme';\nexport default function App() { return null; }\n",
        "streaks/src/theme.js": "export const theme = {};\n",
        "streaks/index.js": "import { registerRootComponent } from 'expo';",
        "streaks/app.json": JSON.stringify({
          expo: { name: "Streaks", ios: { bundleIdentifier: "com.acme.streaks" }, splash: { backgroundColor: "#112233" } },
        }),
        "streaks/appmaker.json": JSON.stringify({ listing: { subtitle: "Daily habits", keywords: "habits", bogus: "x" } }),
        "streaks/package.json": "{}",
        "streaks/eas.json": "{}",
        "streaks/babel.config.js": "module.exports = {}",
        "streaks/README.md": "# Streaks",
        "streaks/assets/icon.png": null,
      }),
      strip,
    );
    expect(Object.keys(app.files).sort()).toEqual(["App.js", "src/theme.js"]);
    expect(app.files["App.js"]).toContain("from './src/theme'");
    expect(app.listing).toMatchObject({ name: "Streaks", bundleId: "com.acme.streaks", primaryColor: "#112233", subtitle: "Daily habits", keywords: "habits" });
    expect(app.listing).not.toHaveProperty("bogus");
    expect(app.skipped).toEqual([{ path: "assets/icon.png", reason: expect.stringMatching(/images/) }]);
    expect(app.issues).toEqual([]);
    expect(app.converted).toEqual([]);
  });

  it("converts TypeScript, moves folders under src/ and rewrites imports", () => {
    const app = importApp(
      up({
        "App.tsx": [
          "import React from 'react';",
          "import type { Item } from './types';",
          "import { Card } from './components/Card';",
          "import { styles } from './components/Card.styles';",
          "import data from './data/items.json';",
          "import { helper } from '@/utils';",
          "export default function App(): JSX.Element { const x: Item[] = data; return <Card items={x} n={helper(1)} style={styles.card} />; }",
        ].join("\n"),
        "types.ts": "export interface Item { id: string }",
        "components/Card.tsx":
          "import { View } from 'react-native';\nimport { helper } from '../utils/index';\nexport const Card = ({ items }: { items: unknown[] }) => <View key={helper(items.length)} />;",
        "components/Card.styles.ts": "import { StyleSheet } from 'react-native';\nexport const styles = StyleSheet.create({ card: {} });",
        "data/items.json": "[]",
        "utils/index.ts": "export const helper = (n: number) => n;",
        "components/Card.test.tsx": "it('x', () => {})",
        "types.d.ts": "declare const x: number;",
        "node_modules/react/index.js": "nope",
        "ios/Podfile": "nope",
      }),
      strip,
    );
    expect(Object.keys(app.files).sort()).toEqual([
      "App.js",
      "src/components/Card-styles.js",
      "src/components/Card.js",
      "src/data/items.json",
      "src/types.js",
      "src/utils/index.js",
    ]);
    const main = app.files["App.js"];
    expect(main).not.toMatch(/: Item\[\]|JSX\.Element|import type/);
    expect(main).toContain("from './src/components/Card'");
    expect(main).toContain("from './src/components/Card-styles'");
    expect(main).toContain("from './src/data/items.json'");
    expect(main).toContain("from './src/utils/index'");
    expect(main).toContain("<Card");
    expect(app.files["src/components/Card.js"]).toContain("from '../utils/index'");
    expect(app.files["src/components/Card.js"]).not.toContain(": {");
    expect(app.converted).toHaveLength(5);
    expect(app.skipped.map((s) => s.path)).toEqual(["components/Card.test.tsx", "types.d.ts"]);
    expect(app.issues).toEqual([]);
  });

  it("wraps an app whose root is src/App, and flags what Appmaker can't run", () => {
    const app = importApp(
      up({
        "package.json": JSON.stringify({ main: "expo-router/entry", dependencies: { "expo-router": "~5.0.0" } }),
        "src/App.js":
          "import { NavigationContainer } from '@react-navigation/native';\nimport logo from '../assets/logo.png';\nexport default function App() { return null; }",
        "assets/logo.png": null,
      }),
      strip,
    );
    expect(app.files["App.js"]).toBe("import App from './src/App';\n\nexport default App;\n");
    expect(app.issues.map((i) => i.message).join("\n")).toMatch(/@react-navigation\/native/);
    expect(app.notes[0]).toMatch(/Expo Router/);
    const fix = fixRequest(app);
    expect(fix).toMatch(/Make it work in Appmaker/);
    expect(fix).toMatch(/@react-navigation\/native/);
    expect(fix).toMatch(/assets\/logo\.png/);
  });

  it("explains uploads it can't use", () => {
    expect(() => importApp([], strip)).toThrow(ImportError);
    expect(() => importApp(up({ "notes.txt": "hi", "logo.png": null }), strip)).toThrow(/No app source files/);
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`src/f${i}.js`, "export default 1;"]));
    expect(() => importApp(up({ "App.js": "export default () => null;", ...many }), strip)).toThrow(/up to 60/);
    expect(() => importApp(up({ "App.js": `export default () => null; // ${"x".repeat(600_001)}` }), strip)).toThrow(/KB/);
  });

  it("keeps a TypeScript file it can't convert out, and says why", () => {
    const app = importApp(up({ "App.js": "export default () => null;", "src/bad.ts": "const x: = ;" }), strip);
    expect(app.files).not.toHaveProperty("src/bad.js");
    expect(app.skipped[0]).toMatchObject({ path: "src/bad.ts", reason: expect.stringMatching(/couldn't convert/) });
  });
});
