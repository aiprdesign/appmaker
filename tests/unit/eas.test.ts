import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appJson, easJson, expoProjectFiles } from "@/lib/expo-project";
import { InputError, parseAscKey, parseIcon, parseLink, parseProject, parseToken } from "@/lib/eas/input";
import { buildArgs, easFailure, getBuilds, linkProject, parseJsonOutput, startBuild, toCloudBuild, whoami } from "@/lib/eas/server";
import { POST as buildRoute } from "@/app/api/eas/build/route";
import { POST as accountRoute } from "@/app/api/eas/account/route";
import { emptyListing } from "@/lib/storage";
import type { Project } from "@/lib/types";

const TOKEN = "expo_test_token_1234567890";
const PROJECT_ID = "0b6e6a8e-3f5e-4c47-9d68-6e0d3c1f2a11";
const BUILD_ID = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const P8 = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----";

function project(extra: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Habit Hero",
    prompt: "",
    files: { "App.js": "import * as Notifications from 'expo-notifications';\nexport default () => null;" },
    messages: [],
    listing: { ...emptyListing("Habit Hero"), bundleId: "com.acme.habithero" },
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

describe("Expo project files", () => {
  it("keeps the linked project's ID, owner and slug even after a rename", () => {
    const link = { projectId: PROJECT_ID, owner: "alice", slug: "habit-hero" };
    const p = project({ listing: { ...project().listing, name: "Habit Hero Pro" }, expo: { link } });
    const { expo } = appJson(p);
    expect(expo.slug).toBe("habit-hero");
    expect(expo.owner).toBe("alice");
    expect(expo.extra).toEqual({ eas: { projectId: PROJECT_ID } });
    expect(appJson(project()).expo).not.toHaveProperty("owner");
  });

  it("puts App Store upload settings in the submit profile", () => {
    expect(easJson({ ascAppId: "6741234567" }).submit.production).toEqual({ ios: { ascAppId: "6741234567" } });
    expect(easJson().submit.production).toEqual({});
    const files = expoProjectFiles(project({ expo: { ascAppId: "6741234567" } }));
    expect(JSON.parse(files["eas.json"]).submit.production.ios.ascAppId).toBe("6741234567");
    expect(files[".gitignore"]).toContain("*.p8");
  });
});

describe("cloud build input", () => {
  it("rejects bad tokens, links, icons and keys", () => {
    expect(() => parseToken("")).toThrow(InputError);
    expect(() => parseToken("has spaces in it!")).toThrow(InputError);
    expect(parseToken(` ${TOKEN} `)).toBe(TOKEN);
    expect(() => parseLink({ projectId: "x", owner: "a", slug: "b" })).toThrow(InputError);
    expect(() => parseIcon(Buffer.from("GIF89a").toString("base64"))).toThrow(InputError);
    expect(parseIcon(PNG.toString("base64")).equals(PNG)).toBe(true);
    expect(() => parseAscKey({ keyId: "ABC", issuerId: "", p8: P8 })).toThrow(InputError);
    expect(() => parseAscKey({ keyId: "2X9R4HXF34", issuerId: "", p8: "not a key" })).toThrow(InputError);
    expect(parseAscKey({ keyId: "2X9R4HXF34", issuerId: "", p8: P8 })?.keyId).toBe("2X9R4HXF34");
  });

  it("only accepts app source files and a real bundle ID", () => {
    const base = { files: { "App.js": "export default () => null;" }, listing: { ...project().listing } };
    expect(() => parseProject({ ...base, files: { "App.js": "x", "../../etc/passwd": "x" } })).toThrow(InputError);
    expect(() => parseProject({ ...base, files: { "package.json": "{}" } })).toThrow(InputError);
    expect(() => parseProject({ ...base, listing: { ...base.listing, bundleId: "nope" } })).toThrow(/bundle ID/);
    expect(parseProject(base).listing.bundleId).toBe("com.acme.habithero");
  });
});

describe("EAS CLI helpers", () => {
  it("builds the right command for each target", () => {
    expect(buildArgs("ios", true)).toEqual(expect.arrayContaining(["--platform", "ios", "--profile", "production", "--auto-submit", "--no-wait", "--non-interactive", "--json"]));
    expect(buildArgs("android-apk", true)).toEqual(expect.arrayContaining(["--platform", "android", "--profile", "preview"]));
    expect(buildArgs("android-apk", true)).not.toContain("--auto-submit");
  });

  it("explains missing Apple signing and bad tokens", () => {
    expect(easFailure("✖ Credentials are not set up. Run this command again in interactive mode.").code).toBe("ios-credentials");
    expect(easFailure("Either log in with eas login or set the EXPO_TOKEN environment variable").code).toBe("auth");
    const generic = easFailure("    at foo (node_modules/x.js:1:1)\nBuild request failed: the free plan limit was reached");
    expect(generic.message).toContain("free plan limit");
    expect(generic.message).not.toContain("node_modules");
  });

  it("reads JSON after stray log lines and maps builds", () => {
    expect(parseJsonOutput<{ a: number }>('warning: something\n{"a":1}')).toEqual({ a: 1 });
    const b = toCloudBuild({
      id: BUILD_ID,
      status: "FINISHED",
      platform: "ANDROID",
      buildProfile: "preview",
      appVersion: "1.0.0",
      appBuildVersion: "3",
      createdAt: "2026-09-28T10:00:00.000Z",
      artifacts: { buildUrl: "https://expo.dev/artifacts/eas/x.apk" },
      submissions: [],
    });
    expect(b).toMatchObject({ target: "android-apk", status: "FINISHED", buildNumber: "3", artifactUrl: "https://expo.dev/artifacts/eas/x.apk" });
  });
});

// ---------------------------------------------------------------------------
// End to end against a fake EAS CLI and a fake Expo API.

let api: Server;
let work: string;
let log: string;
let graphqlCalls: { auth?: string; query: string }[] = [];

const FAKE_CLI = (logFile: string) => `
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const root = process.env.EAS_PROJECT_ROOT;
const read = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return null; } };
const rec = {
  args,
  envKeys: Object.keys(process.env).sort(),
  token: process.env.EXPO_TOKEN,
  cwd: process.cwd(),
  root,
  appJson: JSON.parse(read("app.json")),
  easJson: JSON.parse(read("eas.json")),
  files: fs.readdirSync(root, { recursive: true }).filter((f) => !String(f).startsWith("node_modules")).map(String).sort(),
  keyFile: read("asc-api-key.p8"),
  ascEnv: process.env.EXPO_ASC_API_KEY_PATH || null,
  home: process.env.HOME,
};
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(rec) + "\\n");
if (args.includes("--simulate-failure")) process.exit(1);
if (args[0] === "init") {
  console.log(JSON.stringify({ status: "created", projectId: "${PROJECT_ID}", owner: "alice", slug: rec.appJson.expo.slug }));
} else if (args[0] === "build") {
  if (rec.appJson.expo.ios.bundleIdentifier === "com.acme.nocreds") {
    console.error("Distribution Certificate is not validated for non-interactive builds.");
    console.error("Credentials are not set up. Run this command again in interactive mode.");
    process.exit(1);
  }
  const ios = args.includes("ios");
  console.log(JSON.stringify([{ id: "${BUILD_ID}", status: "NEW", platform: ios ? "IOS" : "ANDROID", buildProfile: args[args.indexOf("--profile") + 1], createdAt: new Date().toISOString(), submissions: args.includes("--auto-submit") ? [{ id: "s1", status: "AWAITING_BUILD" }] : [] }]));
}
`;

function records() {
  return readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

beforeAll(async () => {
  work = mkdtempSync(path.join(os.tmpdir(), "appmaker-eas-test-"));
  log = path.join(work, "calls.log");
  writeFileSync(log, "");
  const cli = path.join(work, "fake-eas.js");
  writeFileSync(cli, FAKE_CLI(log));
  api = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const { query } = JSON.parse(body);
      graphqlCalls.push({ auth: req.headers.authorization, query });
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ errors: [{ message: "Unauthorized", extensions: { errorCode: "UNAUTHORIZED_ERROR" } }] }));
      }
      if (query.includes("meActor")) {
        return res.end(JSON.stringify({ data: { meActor: { __typename: "User", username: "alice", accounts: [{ name: "alice" }, { name: "acme-team" }] } } }));
      }
      res.end(
        JSON.stringify({
          data: {
            builds: {
              byId: {
                id: BUILD_ID,
                status: "FINISHED",
                platform: "IOS",
                buildProfile: "production",
                appVersion: "1.0.0",
                appBuildVersion: "2",
                createdAt: "2026-09-28T10:00:00.000Z",
                artifacts: { applicationArchiveUrl: "https://expo.dev/artifacts/eas/app.ipa" },
                submissions: [{ id: "s1", status: "FINISHED", error: null }],
              },
            },
          },
        }),
      );
    });
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  const port = (api.address() as { port: number }).port;
  process.env.APPMAKER_EXPO_API_URL = `http://127.0.0.1:${port}`;
  process.env.APPMAKER_EAS_CLI = cli;
  process.env.APPMAKER_EAS_WORKDIR = path.join(work, "builds");
  process.env.APPMAKER_EAS_SKIP_DEPS = "1";
  process.env.ANTHROPIC_API_KEY = "sk-ant-server-secret";
});

afterAll(() => {
  api?.close();
  for (const k of ["APPMAKER_EXPO_API_URL", "APPMAKER_EAS_CLI", "APPMAKER_EAS_WORKDIR", "APPMAKER_EAS_SKIP_DEPS", "ANTHROPIC_API_KEY"]) delete process.env[k];
});

beforeEach(() => {
  writeFileSync(log, "");
  graphqlCalls = [];
});

describe("cloud builds (fake Expo)", () => {
  it("checks the token with Expo", async () => {
    expect(await whoami(TOKEN)).toEqual({ name: "alice", account: "alice" });
    await expect(whoami("expo_wrong_token_123456")).rejects.toMatchObject({ code: "auth", status: 401 });
    expect(graphqlCalls[0].auth).toBe(`Bearer ${TOKEN}`);
  });

  it("links the app to the user's Expo account", async () => {
    const link = await linkProject(TOKEN, project(), PNG);
    expect(link).toEqual({ projectId: PROJECT_ID, owner: "alice", slug: "habit-hero" });
    const [rec] = records();
    expect(rec.args).toEqual(["init", "--non-interactive", "--force", "--json", "--account", "alice"]);
    expect(rec.files).toEqual(expect.arrayContaining(["App.js", "app.json", "eas.json", "package.json", "assets/icon.png"]));
  });

  it("starts an App Store build with automatic upload, keeping secrets out of the project and args", async () => {
    const link = { projectId: PROJECT_ID, owner: "alice", slug: "habit-hero" };
    const builds = await startBuild({
      token: TOKEN,
      project: project(),
      icon: PNG,
      link,
      target: "ios",
      submit: { ascAppId: "6741234567", ascKey: { keyId: "2X9R4HXF34", issuerId: "", p8: `${P8}\n` } },
    });
    expect(builds).toEqual([expect.objectContaining({ id: BUILD_ID, target: "ios", status: "NEW", submission: { status: "AWAITING_BUILD" } })]);

    const [rec] = records();
    expect(rec.args).toContain("--auto-submit");
    expect(rec.args.join(" ")).not.toContain(TOKEN);
    expect(rec.token).toBe(TOKEN);
    // Only what the CLI needs: none of the server's own secrets.
    expect(rec.envKeys).not.toContain("ANTHROPIC_API_KEY");
    expect(rec.envKeys).toEqual(expect.arrayContaining(["EXPO_TOKEN", "EAS_NO_VCS", "EAS_PROJECT_ROOT"]));
    expect(rec.appJson.expo.extra.eas.projectId).toBe(PROJECT_ID);
    expect(rec.appJson.expo.plugins).toContain("expo-notifications");
    expect(rec.easJson.submit.production.ios).toEqual({ ascAppId: "6741234567", ascApiKeyPath: "./asc-api-key.p8", ascApiKeyId: "2X9R4HXF34" });
    expect(rec.keyFile).toContain("BEGIN PRIVATE KEY");
    expect(rec.ascEnv).toMatch(/asc-api-key\.p8$/);
    // The CLI's home is outside the uploaded project folder.
    expect(rec.home.startsWith(rec.root + path.sep)).toBe(false);
    // Everything is deleted afterwards, including the key.
    expect(existsSync(rec.root)).toBe(false);
    expect(readdirSync(process.env.APPMAKER_EAS_WORKDIR!)).toEqual([]);
  });

  it("reports missing Apple signing as a setup step, not a crash", async () => {
    const p = project({ listing: { ...project().listing, bundleId: "com.acme.nocreds" } });
    await expect(
      startBuild({ token: TOKEN, project: p, icon: PNG, link: { projectId: PROJECT_ID, owner: "alice", slug: "habit-hero" }, target: "ios" }),
    ).rejects.toMatchObject({ code: "ios-credentials", status: 409 });
  });

  it("reads build and upload status from Expo", async () => {
    const [b] = await getBuilds(TOKEN, [BUILD_ID]);
    expect(b).toMatchObject({ status: "FINISHED", target: "ios", artifactUrl: "https://expo.dev/artifacts/eas/app.ipa", submission: { status: "FINISHED" } });
  });
});

describe("cloud build routes", () => {
  const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
    handler(new Request("http://localhost/api/eas", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "10.9.9.9" } }));

  it("validates requests before running anything", async () => {
    expect((await post(buildRoute, { token: TOKEN })).status).toBe(400);
    const noLink = await post(buildRoute, { token: TOKEN, target: "ios", project: { files: { "App.js": "x" }, listing: project().listing }, icon: PNG.toString("base64") });
    expect((await noLink.json()).error).toMatch(/Link the app/);
    const androidSubmit = await post(buildRoute, {
      token: TOKEN,
      target: "android",
      submit: true,
      link: { projectId: PROJECT_ID, owner: "alice", slug: "habit-hero" },
      project: { files: { "App.js": "x" }, listing: project().listing },
      icon: PNG.toString("base64"),
    });
    expect(androidSubmit.status).toBe(400);
    expect(records()).toEqual([]);
  });

  it("connects an account", async () => {
    const res = await post(accountRoute, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "alice", available: true });
    expect((await post(accountRoute, { token: "expo_wrong_token_123456" })).status).toBe(401);
  });
});
