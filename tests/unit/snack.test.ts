import { describe, expect, it } from "vitest";
import { snackPayload } from "@/lib/snack";
import { emptyListing } from "@/lib/storage";
import type { Project } from "@/lib/types";

function project(files: Record<string, string>): Project {
  return {
    id: "p1",
    name: "Test",
    prompt: "",
    files,
    messages: [],
    listing: { ...emptyListing("Streaks"), subtitle: "Daily habits" },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("snackPayload", () => {
  const app = project({
    "App.js": "import AsyncStorage from '@react-native-async-storage/async-storage';\nexport default function App() { return null; }",
    "src/theme.js": "export const c = 1;",
    "../evil.js": "nope",
  });

  it("sends the app's code files for the chosen platform", () => {
    const p = snackPayload(app, "mydevice");
    expect(p.platform).toBe("mydevice");
    expect(p.name).toBe("Streaks");
    expect(p.description).toBe("Daily habits");
    const files = JSON.parse(p.files);
    expect(Object.keys(files).sort()).toEqual(["App.js", "src/theme.js"]);
    expect(files["App.js"]).toEqual({ type: "CODE", contents: app.files["App.js"] });
  });

  it("lists only the extra packages the app imports", () => {
    const deps = snackPayload(app, "ios").dependencies.split(",");
    expect(deps).toContain("@react-native-async-storage/async-storage");
    expect(deps).not.toContain("expo");
    expect(deps).not.toContain("react-native");
  });
});
