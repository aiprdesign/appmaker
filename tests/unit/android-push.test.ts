import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGoogleServices, parseServiceAccount, usesNotifications } from "@/lib/android-push";
import { appJson, expoProjectFiles } from "@/lib/expo-project";
import { parseProject } from "@/lib/eas/input";
import { setAndroidPushKey } from "@/lib/eas/push";
import type { Project } from "@/lib/types";

const services = (pkg = "com.luigis.app") =>
  JSON.stringify({ project_info: { project_id: "luigis-123", project_number: "42" }, client: [{ client_info: { android_client_info: { package_name: pkg } } }] });
const key = (project = "luigis-123") =>
  JSON.stringify({ type: "service_account", project_id: project, private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n", client_email: "x@luigis-123.iam.gserviceaccount.com" });

describe("Android notifications setup", () => {
  it("checks the Firebase files belong to this app and to each other", () => {
    expect(parseGoogleServices(services(), "com.luigis.app").firebaseProject).toBe("luigis-123");
    expect(() => parseGoogleServices(services("com.other.app"), "com.luigis.app")).toThrow(/is for com.other.app, but the app's package is com.luigis.app/);
    expect(() => parseGoogleServices("{}", "com.luigis.app")).toThrow(/isn't google-services.json/);
    expect(() => parseGoogleServices("not json", "com.luigis.app")).toThrow(/isn't google-services.json/);
    expect(parseServiceAccount(key(), "luigis-123").client_email).toContain("luigis-123");
    expect(() => parseServiceAccount(key("other-9"), "luigis-123")).toThrow(/same Firebase project/);
    expect(() => parseServiceAccount(services())).toThrow(/isn't a service account key/);
    expect(usesNotifications({ "src/appdata.js": "import * as Notifications from 'expo-notifications';" })).toBe(true);
  });

  it("puts google-services.json into the Android build, checked on the server", () => {
    const body = {
      files: { "App.js": "export default function App() { return null; }" },
      listing: { name: "Luigi's", bundleId: "com.luigis.app", primaryColor: "#B91C1C" },
      androidPush: { googleServices: services() },
    };
    const project = parseProject(body) as Project;
    expect(project.androidPush?.firebaseProject).toBe("luigis-123");
    expect(appJson(project).expo.android).toMatchObject({ package: "com.luigis.app", googleServicesFile: "./google-services.json" });
    expect(JSON.parse(expoProjectFiles(project)["google-services.json"]).project_info.project_id).toBe("luigis-123");
    expect(() => parseProject({ ...body, androidPush: { googleServices: services("com.other.app") } })).toThrow(/package is com.luigis.app/);
    const without = parseProject({ ...body, androidPush: undefined }) as Project;
    expect(appJson(without).expo.android).not.toHaveProperty("googleServicesFile");
    expect(expoProjectFiles(without)).not.toHaveProperty("google-services.json");
  });
});

describe("giving Expo the key", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates the key, the Android credentials if needed, and links them for push (like eas credentials)", async () => {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      const q = body.query as string;
      const data = q.includes("AppmakerAndroidCredentials")
        ? { app: { byId: { id: "app-1", ownerAccount: { id: "acct-1" }, androidAppCredentials: [] } } }
        : q.includes("CreateGoogleServiceAccountKey")
          ? { googleServiceAccountKey: { createGoogleServiceAccountKey: { id: "key-1" } } }
          : q.includes("CreateAndroidAppCredentials")
            ? { androidAppCredentials: { createAndroidAppCredentials: { id: "cred-1" } } }
            : { androidAppCredentials: { setGoogleServiceAccountKeyForFcmV1: { id: "cred-1" } } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    await setAndroidPushKey("token", "8c3b9a0e-0000-4000-8000-000000000001", "com.luigis.app", JSON.parse(key()));
    expect(calls.map((c) => c.query.match(/(query|mutation) (\w+)/)![2])).toEqual([
      "AppmakerAndroidCredentials",
      "AppmakerCreateGoogleServiceAccountKey",
      "AppmakerCreateAndroidAppCredentials",
      "AppmakerSetFcmV1Key",
    ]);
    expect(calls[1].variables).toMatchObject({ accountId: "acct-1", input: { jsonKey: { project_id: "luigis-123" } } });
    expect(calls[2].variables).toEqual({ input: {}, appId: "app-1", applicationIdentifier: "com.luigis.app" });
    expect(calls[3].variables).toEqual({ credentialsId: "cred-1", keyId: "key-1" });
  });
});
