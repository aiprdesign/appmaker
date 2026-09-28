import { expect, test, type Page } from "@playwright/test";

// Notifications, photo picking and live internet data working in the preview.

const LISTING = JSON.stringify({
  name: "Feature App",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Utilities",
  bundleId: "com.example.feature",
  primaryColor: "#123456",
  iconEmoji: "🧪",
  privacyNotes: "None",
});

const reply = (code: string) => `<plan>x</plan>\n<file path="App.js">\n${code}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`;

async function build(page: Page, code: string) {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply(code) }),
  );
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("feature test");
  await page.keyboard.press("Enter");
  return page.frameLocator('iframe[title="App preview"]');
}

test("reminders: scheduling shows a confirmation, and due reminders pop up", async ({ page }) => {
  const app = await build(
    page,
    `import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
export default function App() {
  const daily = async () => {
    await Notifications.requestPermissionsAsync();
    await Notifications.scheduleNotificationAsync({ content: { title: 'Drink water', body: 'Time for a glass' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 } });
  };
  const soon = () => Notifications.scheduleNotificationAsync({ content: { title: 'Stand up!', body: 'Stretch your legs' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 } });
  return (
    <View style={{ flex: 1, padding: 60 }}>
      <TouchableOpacity onPress={daily}><Text>Daily reminder</Text></TouchableOpacity>
      <TouchableOpacity onPress={soon}><Text>Remind me in 1 second</Text></TouchableOpacity>
    </View>
  );
}`,
  );
  await app.getByText("Daily reminder").click();
  await expect(app.getByText(/Every day at 8:00 PM — “Drink water”/)).toBeVisible();
  await app.getByText("Remind me in 1 second").click();
  await expect(app.getByText("Stand up!")).toBeVisible({ timeout: 5_000 });
  await expect(app.getByText("Stretch your legs")).toBeVisible();
});

test("the habit tracker demo has a working daily reminder", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  await app.getByText("Stats", { exact: true }).click();
  await app.getByRole("switch").click();
  await expect(app.getByText(/Every day at 8:00 PM — “Time to check in/)).toBeVisible();
  await app.getByText("8:00 AM").click();
  await expect(app.getByText("Every day at 8:00 AM").first()).toBeVisible();
});

test("photos: choosing an image shows it in the app", async ({ page }) => {
  const app = await build(
    page,
    `import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
export default function App() {
  const [photo, setPhoto] = useState(null);
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    setPhoto(result.assets[0]);
  };
  return (
    <View style={{ flex: 1, padding: 60 }}>
      <TouchableOpacity onPress={pick}><Text>Choose photo</Text></TouchableOpacity>
      {photo && <Image testID="photo" source={{ uri: photo.uri }} style={{ width: 120, height: 120 }} />}
      {photo && <Text>{photo.width}x{photo.height}</Text>}
    </View>
  );
}`,
  );
  // A tiny 2x2 red PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMAAAB0SAgF/0nNTAAAAAElFTkSuQmCC", "base64");
  const chooser = page.waitForEvent("filechooser");
  await app.getByText("Choose photo").click();
  await (await chooser).setFiles({ name: "red.png", mimeType: "image/png", buffer: png });
  await expect(app.getByText("2x2")).toBeVisible();
  await expect(app.locator('[data-testid="photo"]')).toBeVisible();
});

test("live data: the app fetches from a public API and shows it", async ({ page }) => {
  let calls = 0;
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ current: { temperature_2m: 21.4 } }),
    });
  });
  const app = await build(
    page,
    `import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
export default function App() {
  const [temp, setTemp] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&current=temperature_2m')
      .then((r) => r.json())
      .then((d) => setTemp(d.current.temperature_2m))
      .catch(() => setError('offline'));
  }, []);
  return <View style={{ flex: 1, padding: 60 }}><Text>{temp != null ? 'London: ' + temp + '°C' : error || 'Loading…'}</Text></View>;
}`,
  );
  await expect(app.getByText("London: 21.4°C")).toBeVisible({ timeout: 10_000 });
  expect(calls).toBeGreaterThan(0);
});
