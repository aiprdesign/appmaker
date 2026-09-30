import { describe, expect, it } from "vitest";
import { BRAND_FILE, brandModule } from "@/lib/branding";
import { checkCodeSafety } from "@/lib/code-safety";
import { defaultDesign, THEME_FILE, themeModule } from "@/lib/design";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { validateApp } from "@/lib/validate";

describe("Made with Appmaker", () => {
  it("shows the line on the free plan and nothing on the paid plan, and passes the app checks", () => {
    expect(brandModule(true)).toContain("Made with Appmaker");
    expect(brandModule(false)).toContain("return null");
    for (const show of [true, false]) {
      const files = {
        "App.js": "import React from 'react';\nimport MadeWith from './src/appmaker';\nexport default function App() { return <MadeWith />; }\n",
        [BRAND_FILE]: brandModule(show),
        [THEME_FILE]: themeModule(defaultDesign()),
      };
      expect(checkCodeSafety(files)).toEqual([]);
      expect(validateApp(files)).toEqual([]);
    }
  });

  it("tells the AI where to show it and not to write it", () => {
    expect(SYSTEM_PROMPT).toContain("import MadeWith from './src/appmaker';");
    expect(SYSTEM_PROMPT).toContain("Never write, change or delete `src/appmaker.js`");
  });
});
