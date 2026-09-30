import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import lucideIcons from "@/lib/lucide-icons.json";
import { usedDependencies } from "@/lib/expo-project";
import { isLucideIcon, validateApp } from "@/lib/validate";
import { emptyListing } from "@/lib/storage";

const require = createRequire(import.meta.url);

describe("Lucide icons in apps", () => {
  it("keeps the icon name list in step with the installed Lucide (regenerate after upgrading)", () => {
    const lucide = require("lucide") as Record<string, unknown>;
    const names = Object.keys(lucide)
      .filter((k) => /^[A-Z]/.test(k) && Array.isArray(lucide[k]))
      .sort();
    expect(lucideIcons).toEqual(names);
  });

  it("accepts real icon names in every form the library exports, and flags made-up ones", () => {
    for (const name of ["House", "Home", "HomeIcon", "LucideHome", "Heart", "ShoppingBag"]) expect(isLucideIcon(name)).toBe(true);
    for (const name of ["Instagram", "HouseFancy", "Iconic"]) expect(isLucideIcon(name)).toBe(false);
    const app = (imports: string) => ({
      "App.js": `import React from 'react';\nimport { ${imports} } from 'lucide-react-native';\nexport default function App() { return null; }`,
    });
    expect(validateApp(app("House, Heart as Love, SearchIcon"))).toEqual([]);
    expect(validateApp(app("House, Instagram")).map((i) => i.message)).toEqual([expect.stringMatching(/icon 'Instagram'.*doesn't exist/)]);
  });

  it("adds the SVG library to builds of apps that use icons", () => {
    const project = (code: string) => ({
      id: "p",
      name: "A",
      prompt: "",
      files: { "App.js": code },
      messages: [],
      listing: emptyListing("A"),
      createdAt: 0,
      updatedAt: 0,
    });
    const withIcons = usedDependencies(project("import { House } from 'lucide-react-native';"));
    expect(withIcons["lucide-react-native"]).toBe("^1.49.0");
    expect(withIcons["react-native-svg"]).toBe("15.15.4");
    expect(usedDependencies(project("export default () => null;"))).not.toHaveProperty("react-native-svg");
  });
});
