import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { appJson, exportProjectZip, shade, slugify, usedDependencies } from "@/lib/export";
import { emptyListing } from "@/lib/storage";
import type { Project } from "@/lib/types";

function project(files: Record<string, string>): Project {
  return {
    id: "p1",
    name: "Test",
    prompt: "",
    files,
    messages: [],
    listing: { ...emptyListing("My Cool App!"), bundleId: "com.acme.my-app" },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("export helpers", () => {
  it("slugifies names", () => {
    expect(slugify("My Cool App!")).toBe("my-cool-app");
    expect(slugify("!!!")).toBe("my-app");
  });

  it("shades hex colors and passes through invalid ones", () => {
    expect(shade("#000000", 0.5)).toBe("#808080");
    expect(shade("#ffffff", -0.5)).toBe("#808080");
    expect(shade("red", 0.2)).toBe("red");
  });

  it("includes only the optional packages the app imports", () => {
    const deps = usedDependencies(project({ "App.js": "import AsyncStorage from '@react-native-async-storage/async-storage';" }));
    expect(deps).toHaveProperty("expo");
    expect(deps).toHaveProperty("@react-native-async-storage/async-storage");
    expect(deps).not.toHaveProperty("expo-haptics");
  });

  it("builds a store-ready app.json", () => {
    const { expo } = appJson(project({}));
    expect(expo.slug).toBe("my-cool-app");
    expect(expo.ios.bundleIdentifier).toBe("com.acme.my-app");
    expect(expo.android.package).toBe("com.acme.my_app");
    expect(expo.icon).toBe("./assets/icon.png");
  });

  it("exports a complete Expo project and drops unsafe paths", async () => {
    // The icon is drawn on a canvas in the browser; stub it for Node.
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {} }),
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(["png"])),
      }),
    });
    const blob = await exportProjectZip(project({ "App.js": "export default () => null;", "../evil.js": "x", "package.json": "{}" }));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    for (const f of ["package.json", "index.js", "app.json", "eas.json", "babel.config.js", "README.md", "assets/icon.png", "App.js", ".github/workflows/eas.yml"]) {
      expect(names).toContain(`my-cool-app/${f}`);
    }
    expect(names.some((n) => n.includes("evil"))).toBe(false);
    const pkg = JSON.parse(await zip.file("my-cool-app/package.json")!.async("string"));
    expect(pkg.main).toBe("index.js");
    expect(pkg.dependencies.expo).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
