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

  // Taken down: the link stops working.
  expect((await page.request.delete("/api/webapp?projectId=webproj0001", { headers: { "content-type": "application/json" } })).ok()).toBe(true);
  expect((await page.request.get(`/a/${id}`)).status()).toBe(404);
  await ctx.close();
});
