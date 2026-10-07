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
      <TouchableOpacity style={{ minHeight: 48, justifyContent: 'center' }} onPress={daily}><Text>Daily reminder</Text></TouchableOpacity>
      <TouchableOpacity style={{ minHeight: 48, justifyContent: 'center' }} onPress={soon}><Text>Remind me in 1 second</Text></TouchableOpacity>
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
      <TouchableOpacity accessibilityRole="button" onPress={pick} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: '#111827' }}>Choose photo</Text></TouchableOpacity>
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

test("confirmations and the back button work in the preview", async ({ page }) => {
  const app = await build(
    page,
    `import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, BackHandler } from 'react-native';
export default function App() {
  const [items, setItems] = useState(['Basil', 'Mint']);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(null); return true; });
    return () => sub.remove();
  }, [open]);
  const remove = (name) => Alert.alert('Delete ' + name + '?', 'This can't be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => setItems((x) => x.filter((i) => i !== name)) },
  ]);
  if (open) return (<View style={{ flex: 1, padding: 60 }}><Text>Details of {open}</Text></View>);
  return (
    <View style={{ flex: 1, padding: 60 }}>
      {items.map((name) => (
        <View key={name} style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(name)}><Text>Open {name}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => remove(name)}><Text>Delete {name}</Text></Pressable>
        </View>
      ))}
    </View>
  );
}`.replace("can't", "can not"),
  );
  await expect(app.getByText("Open Basil")).toBeVisible({ timeout: 30_000 });
  // Cancel keeps the item; Delete removes it.
  page.once("dialog", (d) => {
    expect(d.message()).toContain("Delete Basil?");
    void d.dismiss();
  });
  await app.getByText("Delete Basil").click();
  await expect(app.getByText("Open Basil")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await app.getByText("Delete Basil").click();
  await expect(app.getByText("Open Basil")).toHaveCount(0);
  // Escape acts as Android's back button.
  await app.getByText("Open Mint").click();
  await expect(app.getByText("Details of Mint")).toBeVisible();
  await app.getByText("Details of Mint").press("Escape");
  await expect(app.getByText("Open Mint")).toBeVisible();
});

const SENSOR_LISTING = JSON.stringify({
  name: "Trail Mate",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Health & Fitness",
  bundleId: "com.example.trail",
  primaryColor: "#15803D",
  iconEmoji: "🥾",
  privacyNotes: "Location and motion stay on the device.",
});
const SENSOR_APP = `import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer, Magnetometer } from 'expo-sensors';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';

function Button({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [place, setPlace] = useState('');
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    const sub = Pedometer.watchStepCount((r) => setSteps(r.steps));
    Magnetometer.setUpdateInterval(200);
    const mag = Magnetometer.addListener(({ x, y }) => setHeading(Math.round((Math.atan2(y, x) * 180) / Math.PI + 360) % 360));
    return () => { sub.remove(); mag.remove(); };
  }, []);

  const locate = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [addr] = await Location.reverseGeocodeAsync(pos.coords);
    setPlace(addr.city + ' ' + pos.coords.latitude.toFixed(2));
  };

  if (scanning) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { setCode(data); setScanning(false); }} />
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Steps: {steps}</Text>
      <Text style={styles.text}>{heading === null ? 'No heading' : 'Heading set'}</Text>
      <Text style={styles.text}>{place ? 'Near ' + place : 'Where am I?'}</Text>
      <Text style={styles.text}>{code ? 'Scanned ' + code : 'Nothing scanned'}</Text>
      <Text style={styles.text}>{unlocked || 'Locked'}</Text>
      <Button label="Find me" onPress={locate} />
      <Button label="Scan a code" onPress={async () => { if (!permission?.granted) await requestPermission(); setScanning(true); }} />
      <Button label="Unlock" onPress={async () => { const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Trail Mate' }); setUnlocked(r.success ? 'Unlocked' : 'Still locked'); }} />
      <Button label="Copy code" onPress={() => Clipboard.setStringAsync(code)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF', gap: 8 },
  text: { fontSize: 17, color: '#111827' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#15803D', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});`;

test("apps can use location, motion sensors, the camera scanner and Face ID, with sample data in the preview", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/brief", (route) => route.fulfill({ json: { brief: null } }));
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>x</plan>\n<file path="App.js">\n${SENSOR_APP}\n</file>\n<listing>${SENSOR_LISTING}</listing>\n<summary>ok</summary>`,
    });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A hiking companion that counts steps, scans trail QR codes and locks with Face ID");
  await page.keyboard.press("Enter");
  const app = page.frameLocator('iframe[title="App preview"]');
  await expect(app.getByText(/^Steps: /)).toBeVisible({ timeout: 30_000 });

  // Simulated steps and compass.
  await expect(app.getByText(/^Steps: [1-9]/)).toBeVisible({ timeout: 10_000 });
  await expect(app.getByText("Heading set")).toBeVisible();
  // A sample location, said to be a sample.
  await app.getByRole("button", { name: "Find me" }).click();
  await expect(app.getByText("Near San Francisco 37.78")).toBeVisible();
  await expect(app.getByText(/This preview uses sample data/).first()).toBeVisible();
  // The camera scanner, with a simulated scan.
  await app.getByRole("button", { name: "Scan a code" }).click();
  await expect(app.getByText("Camera preview: the live camera shows on your phone")).toBeVisible();
  await app.getByRole("button", { name: "Simulate a scan" }).click();
  await expect(app.getByText("Scanned https://example.com/hello")).toBeVisible();
  // Face ID: OK unlocks.
  page.once("dialog", (d) => d.accept());
  await app.getByRole("button", { name: "Unlock" }).click();
  await expect(app.getByText("Unlocked")).toBeVisible();
  await app.getByRole("button", { name: "Copy code" }).click();

  // None of it counts as a problem: no automatic fix was needed.
  await page.waitForTimeout(4000);
  expect(prompts).toHaveLength(1);
});
