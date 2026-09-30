import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { gradeApp } from "../../evals/grade";

// Proves the app-quality grader catches each class of problem: every broken
// app below has exactly one defect and must fail exactly that check.

const LISTING = {
  name: "Test App",
  subtitle: "Testing things",
  description: "A".repeat(150),
  keywords: "test,app",
  category: "Utilities",
  bundleId: "com.appmaker.test",
  primaryColor: "#2563EB",
  iconEmoji: "🧪",
  privacyNotes: "Data is stored on-device only.",
};

/** A small, good app; each case below breaks one thing about it. */
function app(opts: { extra?: string; body?: string; styles?: string; save?: string; imports?: string } = {}) {
  return {
    "App.js": `import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
${opts.imports ?? ""}
export default function App() {
  const [tab, setTab] = useState('list');
  const [items, setItems] = useState(['Water the plants']);
  const [draft, setDraft] = useState('');
  useEffect(() => { AsyncStorage.getItem('items').then((r) => r && setItems(JSON.parse(r))); }, []);
  const add = () => { if (!draft) return; const next = [...items, draft]; ${opts.save ?? "setItems(next); AsyncStorage.setItem('items', JSON.stringify(next));"} setDraft(''); setTab('list'); };
  ${opts.extra ?? ""}
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        ${
          opts.body ??
          `{tab === 'list' && <View><Text style={s.title}>My list</Text>{items.map((i) => <Text key={i} style={s.item}>{i}</Text>)}</View>}
        {tab === 'add' && <View><Text style={s.title}>New item</Text><TextInput style={s.input} value={draft} onChangeText={setDraft} placeholder="What needs doing?" /><TouchableOpacity style={s.button} onPress={add}><Text style={s.buttonText}>Save item</Text></TouchableOpacity></View>}
        {tab === 'about' && <View><Text style={s.title}>About</Text><Text style={s.item}>Version 1.0</Text></View>}`
        }
      </ScrollView>
      <View style={s.tabs}>
        {['list', 'add', 'about'].map((t) => <TouchableOpacity key={t} style={s.tab} onPress={() => setTab(t)}><Text style={s.tabText}>{t.toUpperCase()}</Text></TouchableOpacity>)}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 12 },
  item: { fontSize: 16, color: '#111827', paddingVertical: 12 },
  input: { borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, padding: 14, fontSize: 16, color: '#111827' },
  button: { marginTop: 16, backgroundColor: '#1D4ED8', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#E5E7EB' },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  ${opts.styles ?? ""}
});
`,
  };
}

function failedChecks(result: Awaited<ReturnType<typeof gradeApp>>) {
  return result.checks.filter((c) => !c.pass).map((c) => c.id);
}

test.describe.configure({ mode: "parallel" });
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !!isMobile, "grader runs once, on desktop Chromium");

test("a well-built app passes every check", async ({ browser }) => {
  const result = await gradeApp(browser, app(), LISTING);
  expect(failedChecks(result), JSON.stringify(result.checks, null, 1)).toEqual([]);
  expect(result.shippable).toBe(true);
  expect(result.checks.map((c) => c.id)).toEqual(expect.arrayContaining(["adds", "persists", "taps", "navigation", "touch-targets"]));
});

const BROKEN: [string, string, Parameters<typeof app>[0], Partial<typeof LISTING>?][] = [
  ["crashes on launch", "renders", { extra: "const boom = undefined; boom.explode();" }],
  ["crashes when a button is tapped", "taps", { extra: "const [crash, setCrash] = useState(false); if (crash) throw new Error('tapped bomb');", body: "<Text style={s.title}>Home</Text><TouchableOpacity style={s.button} onPress={() => setCrash(true)}><Text style={s.buttonText}>Do it</Text></TouchableOpacity>{tab !== 'list' && <Text style={s.item}>{tab}</Text>}" }],
  ["has tiny buttons", "touch-targets", { styles: "", body: "<Text style={s.title}>Tiny</Text>{[1,2,3,4].map((n) => <TouchableOpacity key={n} style={{ width: 24, height: 24, backgroundColor: '#1D4ED8', margin: 4 }} onPress={() => setTab('list')} />)}<Text style={s.item}>{tab}</Text>" }],
  ["has unreadable grey text", "readable-contrast", { body: "<Text style={s.title}>Hello</Text><Text style={{ color: '#D1D5DB', fontSize: 14 }}>Faint text one</Text><Text style={{ color: '#D1D5DB', fontSize: 14 }}>Faint text two</Text><Text style={s.item}>{tab}</Text>" }],
  ["uses tiny text", "readable-size", { body: "<Text style={s.title}>Hello</Text><Text style={{ fontSize: 9, color: '#111827' }}>Fine print nobody can read</Text><Text style={s.item}>{tab}</Text>" }],
  ["overflows the screen", "fits-screen", { body: "<Text style={s.title}>Wide</Text><View style={{ width: 700, height: 40, backgroundColor: '#1D4ED8' }} /><Text style={s.item}>{tab}</Text>" }],
  ["doesn't fill the screen", "fills-screen", { styles: "root: { height: 520, backgroundColor: '#FFFFFF' }," }],
  ["has its tab bar floating above the bottom", "fills-screen", { styles: "tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#E5E7EB', marginBottom: 280 }," }],
  ["contains lorem ipsum", "content", { body: "<Text style={s.title}>Lorem ipsum dolor</Text><Text style={s.item}>{tab}</Text>" }],
  ["forgets data when reopened", "persists", { save: "setItems(next);" }],
  ["has a Save button that does nothing", "adds", { save: "" }],
  ["imports a library that isn't available", "code", { imports: "import { NavigationContainer } from '@react-navigation/native';" }],
];

for (const [name, expected, opts] of BROKEN) {
  test(`catches an app that ${name}`, async ({ browser }) => {
    const result = await gradeApp(browser, app(opts), LISTING);
    expect(failedChecks(result)).toContain(expected);
  });
}

test("does not flag a sideways-scrolling carousel as overflow", async ({ browser }) => {
  const body =
    "<Text style={s.title}>Carousel</Text><ScrollView horizontal>{[1,2,3,4,5].map((n) => <View key={n} style={{ width: 220, height: 80, marginRight: 12, backgroundColor: '#DBEAFE' }}><Text style={s.item}>Card {n}</Text></View>)}</ScrollView><Text style={s.item}>{tab}</Text>";
  const result = await gradeApp(browser, app({ body }), LISTING);
  expect(failedChecks(result)).not.toContain("fits-screen");
});

test("catches an invalid store listing", async ({ browser }) => {
  const result = await gradeApp(browser, app(), { ...LISTING, name: "A name that is far too long for the App Store", bundleId: "Not A Bundle" });
  expect(failedChecks(result)).toEqual(["listing"]);
  expect(result.shippable).toBe(false);
});

test("catches a static app with nothing to tap", async ({ browser }) => {
  const files = { "App.js": "import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() { return <View style={{ flex: 1, padding: 40 }}><Text style={{ fontSize: 20, color: '#111' }}>Just a static page of words here</Text></View>; }\n" };
  const result = await gradeApp(browser, files, LISTING);
  expect(failedChecks(result)).toEqual(expect.arrayContaining(["interactive", "navigation"]));
  expect(result.shippable).toBe(false);
});

function readDir(root: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, rel))) {
    const p = rel ? `${rel}/${entry}` : entry;
    if (statSync(path.join(root, p)).isDirectory()) Object.assign(out, readDir(root, p));
    else out[p] = readFileSync(path.join(root, p), "utf8");
  }
  return out;
}

for (const demo of ["habits", "budget", "fitness", "journal"]) {
  test(`built-in demo app '${demo}' scores 100`, async ({ browser }) => {
    const files = readDir(path.join(process.cwd(), "demo-apps", demo));
    if (files["App.js"].includes("'__APP_NAME__'")) files["App.js"] = files["App.js"].replace("'__APP_NAME__'", "'Notes'");
    const result = await gradeApp(browser, files, LISTING);
    expect(failedChecks(result), JSON.stringify(result.checks.filter((c) => !c.pass))).toEqual([]);
    expect(result.score).toBe(100);
  });
}
