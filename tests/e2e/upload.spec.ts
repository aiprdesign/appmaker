import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

// Uploading an existing Expo / React Native app to keep building it. The AI
// is mocked; the upload is read and converted in the browser.

async function zipOf(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function openUploadTab(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload an app" }).click();
}

test("upload a TypeScript app as a zip, preview it and edit it with the AI", async ({ page }) => {
  const zip = await zipOf({
    "hello-app/package.json": JSON.stringify({ main: "index.js", dependencies: { expo: "~57.0.0" } }),
    "hello-app/app.json": JSON.stringify({ expo: { name: "Hello App", ios: { bundleIdentifier: "com.acme.hello" } } }),
    "hello-app/index.js": "import { registerRootComponent } from 'expo';\nimport App from './App';\nregisterRootComponent(App);",
    "hello-app/App.tsx": [
      "import React from 'react';",
      "import { View } from 'react-native';",
      "import { Greeting } from './components/Greeting';",
      "export default function App(): React.ReactElement {",
      "  return <View style={{ flex: 1, justifyContent: 'center' }}><Greeting name=\"upload\" /></View>;",
      "}",
    ].join("\n"),
    "hello-app/components/Greeting.tsx": "import { Text } from 'react-native';\ntype Props = { name: string };\nexport function Greeting({ name }: Props) { return <Text>Hello from {name}</Text>; }",
    "hello-app/assets/splash.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    "hello-app/node_modules/react/index.js": "module.exports = {}",
  });

  const requests: { prompt: string; files: Record<string, string> }[] = [];
  await page.route("**/api/generate", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const updated = body.files["App.js"].replace("justifyContent: 'center'", "justifyContent: 'center', backgroundColor: '#fde68a'");
    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>Change the background</plan>\n<file path="App.js">\n${updated}\n</file>\n<summary>Made the background yellow.</summary>`,
    });
  });

  await openUploadTab(page);
  await page.getByLabel("Upload a .zip or app files").setInputFiles({ name: "hello-app.zip", mimeType: "application/zip", buffer: zip });
  const summary = page.getByRole("region", { name: "Upload summary" });
  await expect(summary.getByText("Hello App")).toBeVisible();
  await expect(summary.getByText(/2 source files ready · 2 converted from TypeScript/)).toBeVisible();
  await expect(summary.getByText("Passed the automatic check: it should run as-is.")).toBeVisible();
  await summary.getByText("1 file left out").click();
  await expect(summary.getByText("assets/splash.png")).toBeVisible();

  const axe = await new AxeBuilder({ page }).include("#start").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  await summary.getByRole("button", { name: "Open in the builder" }).click();
  await page.waitForURL(/\/build\/[^?]+$/);
  const preview = page.frameLocator('iframe[title="App preview"]');
  await expect(preview.getByText("Hello from upload")).toBeVisible();
  await expect(page.getByText(/Uploaded \*?\*?Hello App/).first()).toBeVisible();
  expect(requests).toHaveLength(0);

  // Code tab: the converted files, editable by hand.
  await page.getByRole("button", { name: "Code" }).click();
  await expect(page.getByRole("main").getByRole("button", { name: "src/components/Greeting.js" })).toBeVisible();

  // Chat: the AI edits the uploaded app.
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByPlaceholder(/Ask for a change/).fill("Make the background yellow");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Made the background yellow.")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(Object.keys(requests[0].files).sort()).toEqual(["App.js", "src/components/Greeting.js"]);
  expect(requests[0].files["App.js"]).toContain("from './src/components/Greeting'");
  expect(requests[0].files["App.js"]).not.toContain("React.ReactElement");
  await expect(preview.getByText("Hello from upload")).toBeVisible();

  // The store listing came from app.json.
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByLabel("App name")).toHaveValue("Hello App");
});

test("an app that needs changes opens and the AI fixes it straight away", async ({ page }) => {
  const requests: { prompt: string; files: Record<string, string> }[] = [];
  await page.route("**/api/generate", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: `<plan>Replace navigation</plan>\n<file path="App.js">\nimport { Text } from 'react-native';\nexport default function App() { return <Text>Fixed app</Text>; }\n</file>\n<summary>It now runs in Appmaker.</summary>`,
    });
  });
  await openUploadTab(page);
  await page.getByLabel("Upload a .zip or app files").setInputFiles([
    {
      name: "App.js",
      mimeType: "text/javascript",
      buffer: Buffer.from("import { NavigationContainer } from '@react-navigation/native';\nexport default function App() { return <NavigationContainer />; }"),
    },
  ]);
  const summary = page.getByRole("region", { name: "Upload summary" });
  await expect(summary.getByText(/1 thing to fix before it runs in Appmaker/)).toBeVisible();
  await expect(summary.getByText(/@react-navigation\/native/)).toBeVisible();
  await expect(summary.getByRole("checkbox", { name: /Let the AI fix these/ })).toBeChecked();
  await summary.getByRole("button", { name: "Open and fix with AI" }).click();

  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Fixed app")).toBeVisible();
  expect(requests[0].prompt).toMatch(/I uploaded this app\. Make it work in Appmaker/);
  expect(requests[0].prompt).toMatch(/@react-navigation\/native/);
  expect(requests[0].files["App.js"]).toContain("NavigationContainer");
});

test("uploads that can't be used are explained", async ({ page }) => {
  await openUploadTab(page);
  await page.getByLabel("Upload a .zip or app files").setInputFiles({ name: "broken.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await expect(page.locator("#start").getByRole("alert")).toContainText("isn't a zip file");
  await page.getByLabel("Upload a .zip or app files").setInputFiles({ name: "notes.zip", mimeType: "application/zip", buffer: await zipOf({ "notes.txt": "hi" }) });
  await expect(page.locator("#start").getByRole("alert")).toContainText("No app source files found");
});
