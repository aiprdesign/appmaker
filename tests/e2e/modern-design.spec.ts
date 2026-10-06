import { expect, test } from "@playwright/test";

const LISTING = JSON.stringify({
  name: "Calm Days",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Health & Fitness",
  bundleId: "com.example.calm",
  primaryColor: "#0E7490",
  iconEmoji: "🌿",
  privacyNotes: "None",
});
const APP = `import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, card, gradient, onGradient, backgroundGradient, glass, mode } from './src/theme';
export default function App() {
  const Screen = glass ? LinearGradient : View;
  return (
    <Screen colors={backgroundGradient} style={{ flex: 1, padding: 24, paddingTop: 60, backgroundColor: glass ? undefined : colors.background }}>
      <LinearGradient testID="hero" colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 20 }}>
        <Text accessibilityRole="header" style={{ color: onGradient, fontSize: 24, fontWeight: '800' }}>Good morning</Text>
        <Text style={{ color: onGradient, fontSize: 15 }}>Three minutes of calm</Text>
      </LinearGradient>
      <View testID="card" style={[card, { padding: 16, marginTop: 16 }]}>
        <Text style={{ color: colors.text, fontSize: 16 }}>Breathing exercise</Text>
      </View>
      <BlurView testID="bar" intensity={40} tint={mode} style={{ marginTop: 16, padding: 16, borderRadius: 16 }}>
        <Text style={{ color: colors.text, fontSize: 16 }}>Frosted bar</Text>
      </BlurView>
    </Screen>
  );
}`;

test("gradients and frosted glass render in the preview, are measured fairly, and Glass cards can be chosen", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${APP}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`,
    });
  });
  await page.route("**/api/brief", (route) => route.fulfill({ json: { brief: null } }));
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A meditation app with breathing exercises and sleep sounds");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText("Good morning")).toBeVisible({ timeout: 30_000 });

  // The hero is painted with the theme's gradient; the bar is frosted.
  await expect.poll(() => app.getByTestId("hero").evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  await expect.poll(() => app.getByTestId("bar").evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur");

  // A meditation app gets glass cards automatically, so the card is translucent.
  await expect.poll(() => app.getByTestId("card").evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgba\(.*0\.\d+\)$/);

  // White text on the gradient isn't mistaken for low contrast: no automatic fix is sent.
  await page.waitForTimeout(6000);
  expect(prompts).toHaveLength(1);
  await expect(page.getByText("The quality check found something to improve")).toHaveCount(0);

  // The Design tab shows the chosen look, and Raised cards make the card solid again.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  const panel = page.getByRole("region", { name: "Design" });
  await expect(panel.getByRole("radio", { name: "Glass" })).toHaveAttribute("aria-checked", "true");
  await panel.getByRole("radio", { name: "Raised" }).click();
  await expect.poll(() => app.getByTestId("card").evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(255, 255, 255\)$/);
});
