import { expect, test, type Page, type Route } from "@playwright/test";

// Simulates the AI endpoint so the automatic quality loop can be tested
// deterministically without an API key.
const GOOD_APP = `import React from 'react';
import { View, Text } from 'react-native';
export default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Text>Fixed and working</Text></View>; }`;

const LISTING = JSON.stringify({
  name: "Mock App",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a,b",
  category: "Utilities",
  bundleId: "com.appmaker.mock",
  primaryColor: "#123456",
  iconEmoji: "🧪",
  privacyNotes: "None",
});

const reply = (code: string) =>
  `<plan>Mock</plan>\n<file path="App.js">\n${code}\n</file>\n<listing>${LISTING}</listing>\n<summary>Mock reply</summary>`;

async function mockAI(page: Page, responses: string[]) {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route: Route) => {
    prompts.push(JSON.parse(route.request().postData() || "{}").prompt);
    const body = responses[Math.min(prompts.length - 1, responses.length - 1)];
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body });
  });
  return prompts;
}

async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("anything");
  await page.keyboard.press("Enter");
  return page.frameLocator('iframe[title="App preview"]');
}

test("static quality issues are repaired automatically", async ({ page }) => {
  const bad = `import { NavigationContainer } from '@react-navigation/native';\nexport default function App() { return <div className="x" />; }`;
  const prompts = await mockAI(page, [reply(bad), reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("Automatic quality check");
  expect(prompts[1]).toContain("@react-navigation/native");
  expect(prompts[1]).toContain("className");
  await expect(page.getByText("Quality check found a problem")).toBeVisible();
});

test("runtime crashes are repaired automatically", async ({ page }) => {
  const crash = `import { View } from 'react-native';\nexport default function App() { const x = undefined; return <View>{x.boom}</View>; }`;
  const prompts = await mockAI(page, [reply(crash), reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("boom");
});

test("auto-repair stops after its budget and hands back to the user", async ({ page }) => {
  const crash = `import { View } from 'react-native';\nexport default function App() { return <View>{undefined.boom}</View>; }`;
  const prompts = await mockAI(page, [reply(crash)]);
  await start(page);
  await expect(page.getByRole("button", { name: "Fix with AI" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  expect(prompts).toHaveLength(3); // the request + at most 2 automatic repairs
});

test("files outside the project are never accepted", async ({ page }) => {
  const evil = reply(GOOD_APP).replace("<listing>", '<file path="../../evil.js">\nx\n</file>\n<file path="package.json">\n{}\n</file>\n<listing>');
  const prompts = await mockAI(page, [evil, reply(GOOD_APP)]);
  const app = await start(page);
  await expect(app.getByText("Fixed and working")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Code" }).click();
  await expect(page.getByRole("button", { name: /evil|package\.json/ })).toHaveCount(0);
  expect(prompts[1] ?? "").toContain("was ignored");
});

test("a big app cut off at the model's length limit is finished automatically in a second part", async ({ page }) => {
  const app = `import React from 'react';
import { View } from 'react-native';
import Menu from './src/screens/Menu';
export default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Menu /></View>; }`;
  const menu = `import React from 'react';
import { Text } from 'react-native';
export default function Menu() { return <Text>Full menu is here</Text>; }`;
  const prompts = await mockAI(page, [
    // Part one: App.js finished, the menu screen cut off mid-file.
    `<plan>A restaurant app with a menu screen</plan>\n<file path="App.js">\n${app}\n</file>\n<file path="src/screens/Menu.js">\nimport React from 'react';\n\n<error>The app was too large to finish in one pass. Ask for a smaller first version, or choose a model with a larger output limit in AI settings.</error>`,
    `<plan>Finish the menu</plan>\n<file path="src/screens/Menu.js">\n${menu}\n</file>\n<listing>${LISTING}</listing>\n<summary>Finished the app.</summary>`,
  ]);
  const preview = await start(page);
  await expect(preview.getByText("Full menu is here")).toBeVisible({ timeout: 20_000 });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toMatch(/cut off before it finished/);
  expect(prompts[1]).toMatch(/src\/screens\/Menu/);
  expect(prompts[1]).toMatch(/Files already written: App\.js/);
  await expect(page.getByText(/writing it in parts/)).toBeVisible();
  await expect(page.getByText(/too large to finish/)).toHaveCount(0);
});

test("a hero slider built the way the AI is told works in the preview: arrows, mouse drag, dots and auto-advance", async ({ page }) => {
  const slider = `import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
const SLIDES = ['Fresh pasta daily', 'Wood-fired pizza', 'Book your table'];
export default function HeroSlider() {
  const { width } = useWindowDimensions();
  const w = width - 40;
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const dragging = useRef(false);
  const go = (i) => {
    setIndex(i);
    ref.current?.scrollTo({ x: i * w, animated: true });
  };
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (dragging.current) return;
      setIndex((i) => {
        const next = (i + 1) % SLIDES.length;
        ref.current?.scrollTo({ x: next * w, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [w, paused]);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Pause slideshow" onPress={() => setPaused(true)} style={{ minHeight: 44, minWidth: 88, justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>Pause</Text></Pressable>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onMomentumScrollEnd={(e) => { dragging.current = false; setIndex(Math.round(e.nativeEvent.contentOffset.x / w)); }}>
        {SLIDES.map((s) => (
          <View key={s} style={{ width: w, height: 200, borderRadius: 20, backgroundColor: '#B91C1C', justifyContent: 'flex-end', padding: 16 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{s}</Text>
          </View>
        ))}
      </ScrollView>
      {index > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Previous slide" onPress={() => go(index - 1)} style={{ position: 'absolute', left: 8, top: 78, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft color="#fff" size={24} />
        </Pressable>
      )}
      {index < SLIDES.length - 1 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Next slide" onPress={() => go(index + 1)} style={{ position: 'absolute', right: 8, top: 78, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight color="#fff" size={24} />
        </Pressable>
      )}
      <Text accessibilityLabel="slide position">Slide {index + 1} of {SLIDES.length}</Text>
    </View>
  );
}`;
  const app = `import React from 'react';
import { View } from 'react-native';
import HeroSlider from './src/components/HeroSlider';
export default function App() { return <View style={{ flex: 1, paddingTop: 80, paddingHorizontal: 20 }}><HeroSlider /></View>; }`;
  await mockAI(page, [
    `<plan>Slider</plan>\n<file path="App.js">\n${app}\n</file>\n<file path="src/components/HeroSlider.js">\n${slider}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
  ]);
  const preview = await start(page);
  await expect(preview.getByText("Fresh pasta daily")).toBeVisible({ timeout: 20_000 });
  await expect(preview.getByText("Slide 1 of 3")).toBeVisible();
  await expect(preview.getByText("Slide 2 of 3")).toBeVisible({ timeout: 6_000 });
  // No "Previous" on the first slide; the arrows move it.
  const frame = page.frames().find((f) => f.url() === "about:srcdoc")!;
  // Waits for the slide to arrive, as a person would before tapping again.
  const arrived = (n: number) =>
    expect
      .poll(() => frame.evaluate(() => [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowX === "auto")?.scrollLeft ?? -1))
      .toBe(n * 350);
  await preview.getByRole("button", { name: "Pause slideshow" }).click();
  await arrived(1);
  await preview.getByRole("button", { name: "Previous slide" }).click();
  await expect(preview.getByText("Slide 1 of 3")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Previous slide" })).toHaveCount(0);
  await arrived(0);
  await preview.getByRole("button", { name: "Next slide" }).click();
  await arrived(1);
  await preview.getByRole("button", { name: "Next slide" }).click();
  await expect(preview.getByText("Slide 3 of 3")).toBeVisible();
  await arrived(2);
  await expect(preview.getByRole("button", { name: "Next slide" })).toHaveCount(0);
  // A mouse can drag the slides like a finger, and the dots follow.
  const slide = preview.getByText("Book your table");
  await slide.scrollIntoViewIfNeeded();
  const box = (await slide.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 5, { steps: 8 });
  await page.mouse.up();
  await expect(preview.getByText("Slide 2 of 3")).toBeVisible();
});

test("tapping a link in the preview explains it works in the real app on a phone", async ({ page }) => {
  const app = `import React from 'react';
import { View, Text, Pressable, Linking, Alert } from 'react-native';
export default function App() {
  const open = (url) => Linking.openURL(url).catch(() => Alert.alert("Couldn't open", url));
  return (
    <View style={{ flex: 1, paddingTop: 80, paddingHorizontal: 20, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => open('tel:+15551234567')} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>Call us</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => open('https://www.example.com/menu')} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>Website</Text></Pressable>
    </View>
  );
}`;
  await mockAI(page, [`<plan>Links</plan>\n<file path="App.js">\n${app}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`]);
  const preview = await start(page);
  await preview.getByRole("button", { name: "Call us" }).click();
  await expect(preview.getByText("📞 Calls +15551234567")).toBeVisible();
  await expect(preview.getByText(/Links work in the real app.*Test it on your phone/)).toBeVisible();
  await preview.getByRole("button", { name: "Website" }).click();
  await expect(preview.getByText("🌐 Opens example.com")).toBeVisible();
});

test("apps can use professional Lucide icons, drawn as SVG in the preview", async ({ page }) => {
  const app = `import React from 'react';
import { View, Text } from 'react-native';
import { House, Heart, ShoppingBagIcon } from 'lucide-react-native';
export default function App() {
  return (
    <View style={{ flex: 1, paddingTop: 80, flexDirection: 'row', gap: 12 }}>
      <House color="#6D28D9" size={28} />
      <Heart color="#DB2777" size={28} strokeWidth={2.5} />
      <ShoppingBagIcon color="#111" size={28} />
      <Text>Icons ready</Text>
    </View>
  );
}`;
  await mockAI(page, [`<plan>Icons</plan>\n<file path="App.js">\n${app}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`]);
  const preview = await start(page);
  await expect(preview.getByText("Icons ready")).toBeVisible({ timeout: 20_000 });
  await expect(preview.locator('svg[data-lucide="House"]')).toHaveAttribute("stroke", "#6D28D9");
  await expect(preview.locator('svg[data-lucide="Heart"]')).toHaveAttribute("stroke-width", "2.5");
  await expect(preview.locator('svg[data-lucide="ShoppingBag"]')).toHaveAttribute("width", "28");
  await expect(preview.locator('svg[data-lucide="House"] path')).toHaveCount(2);
});
