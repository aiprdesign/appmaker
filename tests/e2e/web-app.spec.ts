import { expect, test } from "@playwright/test";

// Apps published to the web: needs TEST_DATABASE_URL (they're stored in the database).
test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

const APP = `import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
export default function App() {
  const [n, setN] = useState(null);
  useEffect(() => { AsyncStorage.getItem('taps').then((v) => setN(Number(v || 0))); }, []);
  const tap = () => { const next = n + 1; setN(next); AsyncStorage.setItem('taps', String(next)); };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Luigi web app</Text>
      <Pressable accessibilityRole="button" onPress={tap}><Text>Taps: {n === null ? '…' : n}</Text></Pressable>
    </View>
  );
}
`;

test("an app published to the web opens full screen, installs, and keeps what it saves", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.68.0.1" } });
  const page = await ctx.newPage();
  await page.goto("/");
  expect((await page.request.post("/api/auth/signup", { data: { email: `web-${Date.now()}@webapp.example.com`, password: "correct horse" } })).ok()).toBe(true);
  const res = await page.request.post("/api/webapp", { data: { projectId: "webproj0001", name: "Luigi's", color: "#aa3300", files: { "App.js": APP } } });
  expect(res.ok()).toBe(true);
  const { url, id } = await res.json();
  expect(url).toMatch(new RegExp(`/a/${id}$`));

  // Installable: a manifest that opens it full screen.
  const manifest = await (await page.request.get(`/a/${id}/app.webmanifest`)).json();
  expect(manifest).toMatchObject({ name: "Luigi's", start_url: `/a/${id}`, display: "standalone" });

  // The poster for the counter: QR code and steps for iPhone and Android.
  const poster = await browser.newPage();
  await poster.goto(`/a/${id}/install`);
  await expect(poster.getByRole("heading", { name: "Get the Luigi's app" })).toBeVisible();
  await expect(poster.getByRole("img", { name: "QR code to open the Luigi's app" })).toHaveAttribute("data-qr-value", new RegExp(`/a/${id}$`));
  await expect(poster.getByText("Add to Home Screen")).toBeVisible();
  await expect(poster.getByText("No button? Menu")).toBeVisible();
  await expect(poster.getByRole("heading", { name: /Get a ping/ })).toBeVisible();
  await poster.close();

  // A customer (not signed in) opens it: the app runs, and what it saves is there next time.
  const customer = await browser.newPage();
  await customer.goto(`/a/${id}`);
  await expect(customer).toHaveTitle("Luigi's");
  await expect(customer.locator('link[rel="manifest"]')).toHaveAttribute("href", `/a/${id}/app.webmanifest`);
  const app = customer.frameLocator('iframe[title="Luigi\'s"]');
  await expect(app.getByText("Luigi web app")).toBeVisible({ timeout: 30_000 });
  await app.getByText("Taps: 0").click();
  await app.getByText("Taps: 1").click();
  await expect(app.getByText("Taps: 2")).toBeVisible();
  await customer.reload();
  await expect(customer.frameLocator('iframe[title="Luigi\'s"]').getByText("Taps: 2")).toBeVisible({ timeout: 30_000 });
  await customer.close();

  // Order updates: the app asks, and the customer answers on the page around it.
  const ASK = `import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
export default function App() {
  const [answer, setAnswer] = useState('');
  const ask = async () => setAnswer((await Notifications.requestPermissionsAsync()).granted ? 'yes' : 'no');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" onPress={ask}><Text>Ask for updates</Text></Pressable>
      <Text>Answer: {answer}</Text>
    </View>
  );
}
`;
  const asked = await page.request.post("/api/webapp", { data: { projectId: "webproj0002", name: "Asker", files: { "App.js": ASK } } });
  const askId = (await asked.json()).id;
  const c2ctx = await browser.newContext({ permissions: ["notifications"] });
  // Headless Chromium always reports notifications as blocked: act like a phone that hasn't been asked yet.
  await c2ctx.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
  const c2 = await c2ctx.newPage();
  await c2.goto(`/a/${askId}`);
  const askApp = c2.frameLocator('iframe[title="Asker"]');
  await askApp.getByText("Ask for updates").click({ timeout: 30_000 });
  await expect(c2.getByRole("dialog", { name: "Get a ping when it's ready?" })).toBeVisible();
  await expect(c2.getByRole("button", { name: "Turn on updates" })).toBeFocused();
  await c2.keyboard.press("Escape");
  await expect(askApp.getByText("Answer: no")).toBeVisible();
  await askApp.getByText("Ask for updates").click();
  await expect(c2.getByRole("button", { name: "Turn on updates" })).toBeVisible();
  await c2.getByRole("button", { name: "Not now" }).click();
  await expect(askApp.getByText("Answer: no")).toBeVisible();
  await c2ctx.close();

  // In a published web app, links really open (here a payment page in a new tab).
  const LINK = `import React from 'react';
import { Pressable, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
export default function App() {
  return <Pressable accessibilityRole="button" onPress={() => WebBrowser.openBrowserAsync('https://paypal.me/luigis/26')}><Text>Pay now</Text></Pressable>;
}
`;
  const linkId = (await (await page.request.post("/api/webapp", { data: { projectId: "webproj0003", name: "Payer", files: { "App.js": LINK } } })).json()).id;
  const c3 = await browser.newPage();
  await c3.context().route("https://paypal.me/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>PayPal</title>" }));
  await c3.goto(`/a/${linkId}`);
  const [popup] = await Promise.all([c3.waitForEvent("popup"), c3.frameLocator('iframe[title="Payer"]').getByText("Pay now").click({ timeout: 30_000 })]);
  await popup.waitForURL(/paypal\.me\/luigis\/26/);
  await c3.close();

  // Taken down: the link stops working.
  expect((await page.request.delete("/api/webapp?projectId=webproj0001", { headers: { "content-type": "application/json" } })).ok()).toBe(true);
  expect((await page.request.get(`/a/${id}`)).status()).toBe(404);
  await ctx.close();
});
