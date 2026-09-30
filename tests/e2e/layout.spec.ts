import { expect, test } from "@playwright/test";

test("an app that doesn't fill the screen gets a layout warning", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A dream diary");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText("Kicked off the project")).toBeVisible({ timeout: 30_000 });
  // The demo app fills the screen: no warning.
  await page.waitForTimeout(2500);
  await expect(page.getByText("The layout doesn't fill the screen")).toHaveCount(0);

  await page.getByRole("button", { name: "Code" }).click();
  await page.getByLabel("Source of App.js").fill(`import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
export default function App() {
  return (
    <View style={{ height: 520, backgroundColor: '#FFFFFF' }}>
      <ScrollView style={{ flex: 1 }}><Text style={{ fontSize: 28, padding: 20 }}>Your kitchen</Text></ScrollView>
      <View style={{ flexDirection: 'row' }}>
        {['Home', 'Pantry', 'Tips', 'Settings'].map((t) => <TouchableOpacity key={t} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text>{t}</Text></TouchableOpacity>)}
      </View>
    </View>
  );
}
`);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("The layout doesn't fill the screen")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/only fills the top 5[12][0-9]px of the 844px-tall screen/)).toBeVisible();
});
