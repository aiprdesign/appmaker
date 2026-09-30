import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedPath, validateApp } from "@/lib/validate";

const OK_APP = `import React from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Card from './src/Card';
export default function App() { return <View><Card /><Text>Hi</Text></View>; }
`;

function readDir(root: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, rel))) {
    const p = rel ? `${rel}/${entry}` : entry;
    if (statSync(path.join(root, p)).isDirectory()) Object.assign(out, readDir(root, p));
    else out[p] = readFileSync(path.join(root, p), "utf8");
  }
  return out;
}

describe("isAllowedPath", () => {
  it.each(["App.js", "App.jsx", "src/a.js", "src/screens/Home.jsx", "src/data.json"])("allows %s", (p) =>
    expect(isAllowedPath(p)).toBe(true),
  );
  it.each(["package.json", "app.json", "../evil.js", "src/../../x.js", "/etc/passwd", "src/a.ts", "assets/x.png", "src/./a.js"])(
    "rejects %s",
    (p) => expect(isAllowedPath(p)).toBe(false),
  );
});

describe("validateApp", () => {
  it("accepts a well-formed app", () => {
    expect(validateApp({ "App.js": OK_APP, "src/Card.js": "export default function Card() { return null; }" })).toEqual([]);
  });

  it("requires App.js with a default export", () => {
    expect(validateApp({})[0].message).toMatch(/missing/);
    expect(validateApp({ "App.js": "export const App = 1;" })[0].message).toMatch(/export default/);
  });

  it("flags unavailable packages and missing local files", () => {
    const issues = validateApp({
      "App.js": "import { NavigationContainer } from '@react-navigation/native';\nimport X from './src/Missing';\nexport default () => null;",
    });
    expect(issues.map((i) => i.message).join("\n")).toMatch(/@react-navigation\/native/);
    expect(issues.map((i) => i.message).join("\n")).toMatch(/\.\/src\/Missing/);
  });

  it("explains that apps can't include image files", () => {
    const issues = validateApp({ "App.js": "import React from 'react';\nconst gold = require('./assets/gold.png');\nexport default () => null;" });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/asset file '\.\/assets\/gold\.png'.*emoji/);
  });

  it("detects side-effect imports without skipping later imports", () => {
    const issues = validateApp({ "App.js": "import './src/nope';\nimport React from 'react';\nexport default () => null;" });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/\.\/src\/nope/);
  });

  it("flags web-only code", () => {
    const issues = validateApp({
      "App.js": "export default function App() { localStorage.setItem('a','b'); return <div className=\"x\">hi</div>; }",
    });
    const text = issues.map((i) => i.message).join("\n");
    expect(text).toMatch(/localStorage/);
    expect(text).toMatch(/className/);
    expect(text).toMatch(/HTML elements/);
  });

  it("flags disallowed paths and invalid JSON", () => {
    const issues = validateApp({ "App.js": OK_APP, "src/Card.js": "export default () => null;", "package.json": "{}", "src/d.json": "{" });
    expect(issues.map((i) => i.file).sort()).toEqual(["package.json", "src/d.json"]);
  });

  it.each(readdirSync(path.join(process.cwd(), "demo-apps")))("built-in demo app '%s' passes every check", (demo) => {
    expect(validateApp(readDir(path.join(process.cwd(), "demo-apps", demo)))).toEqual([]);
  });
});

describe("device features", () => {
  it("allows notifications and the image picker", () => {
    const app = `import * as Notifications from 'expo-notifications';\nimport * as ImagePicker from 'expo-image-picker';\nexport default function App() { return null; }`;
    expect(validateApp({ "App.js": app })).toEqual([]);
  });

  it("flags insecure http requests and embedded secret keys", () => {
    const messages = validateApp({
      "App.js": `const API_KEY = "sk_live_abcdefghijklmnop1234";\nexport default function App() { fetch('http://api.example.com/data'); return null; }`,
    }).map((i) => i.message);
    expect(messages.join("\n")).toMatch(/insecure http/);
    expect(messages.join("\n")).toMatch(/secret API key/);
  });

  it("allows https requests to public APIs", () => {
    expect(
      validateApp({ "App.js": "export default function App() { fetch('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2'); return null; }" }),
    ).toEqual([]);
  });
});

describe("booking wording", () => {
  const app = (text: string) => ({ "App.js": `import { Text } from 'react-native';\nexport default function App() { return <Text>${text}</Text>; }\n` });
  it("never lets an app claim a booking is confirmed", () => {
    for (const text of ["Booking confirmed!", "Your reservation has been confirmed", "You're booked for Tuesday", "Appointment successful"]) {
      expect(validateApp(app(text)).map((i) => i.message).join(), text).toMatch(/can't confirm bookings/);
    }
  });
  it("allows honest request wording", () => {
    for (const text of ["Request sent — we'll confirm with you", "Book a table", "Confirm your details"]) expect(validateApp(app(text)), text).toEqual([]);
  });
});
