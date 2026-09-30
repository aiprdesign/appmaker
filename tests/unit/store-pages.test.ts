import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as savePagesRoute } from "@/app/api/pages/route";
import { closeDatabase, query } from "@/lib/server/db";
import { getPages } from "@/lib/server/store-pages";
import { appFacts, PageInputError, parsePageContent, privacySections, supportSections, type StorePageContent } from "@/lib/store-pages";

const FILES = {
  "App.js": [
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    "import * as Notifications from 'expo-notifications';",
    "import * as ImagePicker from 'expo-image-picker';",
    "import { Linking } from 'react-native';",
    "const r = await ImagePicker.launchCameraAsync();",
    "fetch('https://api.open-meteo.com/v1/forecast?x=1'); const img = 'https://images.luigis.example/a.jpg';",
    "Linking.openURL('tel:+15550100');",
  ].join("\n"),
};

const content = (over: Partial<StorePageContent> = {}): StorePageContent => ({
  appName: "Luigi's",
  developer: "Luigi's Trattoria",
  email: "ciao@luigis.example",
  description: "Pasta and pizza in Brooklyn",
  updated: "2026-09-30",
  facts: appFacts(FILES),
  ...over,
});

describe("store pages", () => {
  it("reads what the app does from its code", () => {
    expect(appFacts(FILES)).toEqual({
      onDevice: true,
      notifications: true,
      camera: true,
      photos: false,
      opensLinks: true,
      services: ["api.open-meteo.com", "images.luigis.example"],
    });
    expect(appFacts({ "App.js": "export default () => null;" })).toEqual({
      onDevice: false,
      notifications: false,
      camera: false,
      photos: false,
      opensLinks: false,
      services: [],
    });
  });

  it("writes only the sections that apply", () => {
    const headings = (c: StorePageContent) => privacySections(c).map((s) => s.heading);
    expect(headings(content())).toEqual(expect.arrayContaining(["Camera", "Notifications", "Services the app connects to", "Contact"]));
    const plain = content({ facts: appFacts({ "App.js": "export default () => null;" }) });
    expect(headings(plain)).not.toContain("Notifications");
    expect(headings(plain)).not.toContain("Camera");
    expect(privacySections(plain).find((s) => s.heading === "Information stored on your device")!.paragraphs[0]).toMatch(/does not store/);
    expect(JSON.stringify(supportSections(content()))).toContain("ciao@luigis.example");
  });

  it("keeps only checked fields and plain text from the browser", () => {
    const parsed = parsePageContent({
      ...content(),
      appName: "Luigi's <script>alert(1)</script>",
      extra: "ignored",
      facts: { onDevice: "yes", notifications: true, services: ["ok.example.com", "bad host", "javascript:alert(1)"] },
    });
    expect(parsed.appName).toBe("Luigi's script alert(1) /script");
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.facts).toMatchObject({ onDevice: false, notifications: true, services: ["ok.example.com"] });
    expect(() => parsePageContent({ ...content(), email: "not-an-email" })).toThrow(PageInputError);
    expect(() => parsePageContent({ ...content(), website: "http://insecure.example" })).toThrow(/https/);
    expect(() => parsePageContent({ ...content(), developer: "" })).toThrow(/required/);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3000";
const req = (path: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "10.77.0.1", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

describe.skipIf(!DB)("hosted store pages (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });
  beforeEach(async () => {
    await query("delete from app_users where email like '%@pages.example.com'");
  });

  it("needs an account, then creates and updates one pair of pages per app", async () => {
    expect((await savePagesRoute(req("/api/pages", { projectId: "proj123abc", content: content() }))).status).toBe(401);

    const res = await signup(req("/api/auth/signup", { email: "owner@pages.example.com", password: "correct horse" }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const first = await savePagesRoute(req("/api/pages", { projectId: "proj123abc", content: content() }, cookie));
    expect(first.status).toBe(200);
    const made = await first.json();
    expect(made.supportUrl).toBe(`http://localhost:3000/legal/${made.id}/support`);
    expect(made.privacyUrl).toBe(`http://localhost:3000/legal/${made.id}/privacy`);
    expect((await getPages(made.id))!.email).toBe("ciao@luigis.example");

    // Updating keeps the same links.
    const again = await (
      await savePagesRoute(req("/api/pages", { projectId: "proj123abc", content: content({ email: "hello@luigis.example" }) }, cookie))
    ).json();
    expect(again.id).toBe(made.id);
    expect((await getPages(made.id))!.email).toBe("hello@luigis.example");

    expect((await savePagesRoute(req("/api/pages", { projectId: "proj123abc", content: content({ email: "nope" }) }, cookie))).status).toBe(400);
    expect(await getPages("../../etc")).toBeNull();
  });
});
