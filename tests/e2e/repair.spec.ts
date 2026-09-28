import { expect, test } from "@playwright/test";

// Apps saved before model markup was stripped open repaired.
test("an app saved with leaked model markup is repaired when opened", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const now = Date.now();
    const project = {
      id: "dirty12345",
      name: "Notes",
      prompt: "notes",
      files: {
        "App.js": "import React from 'react';\nimport { View, Text } from 'react-native';\nimport { label } from './src/storage';\nexport default function App() { return <View style={{ flex: 1, paddingTop: 80 }}><Text>{label}</Text></View>; }\n",
        "src/storage.js": "export const label = 'Repaired and running';\n</｜DSML｜ parameter>\n",
      },
      messages: [],
      listing: { name: "Notes", subtitle: "", description: "", keywords: "", category: "Productivity", bundleId: "com.acme.notes", primaryColor: "#6440F0", iconEmoji: "📝", privacyNotes: "" },
      createdAt: now,
      updatedAt: now,
    };
    localStorage.setItem("appmaker.projects.v1", JSON.stringify({ [project.id]: project }));
  });
  await page.goto("/build/dirty12345");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Repaired and running")).toBeVisible();
  await expect(page.getByText(/Syntax error/)).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("appmaker.projects.v1")!).dirty12345.files["src/storage.js"]);
  expect(saved).not.toContain("DSML");
});
