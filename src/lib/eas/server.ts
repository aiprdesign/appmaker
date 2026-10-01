import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EXPO_DEPS, EXPO_GO_RUNTIME, expoProjectFiles, ICON_PATH, usesPackage, type IosSubmitConfig } from "../expo-project";
import type { BuildTarget, CloudBuild, ExpoLink, PhonePreview, Project } from "../types";
import { ensureSigning, type AppleSigning } from "./apple";
import { EasError } from "./errors";
import type { AscApiKey } from "./input";

/**
 * Cloud builds with Expo Application Services (EAS). The server writes the
 * app's Expo project to a temporary folder and runs the EAS CLI with the
 * user's Expo access token; the build itself runs on Expo's servers. Build
 * status is read straight from Expo's API.
 *
 * Tokens and App Store Connect keys come with each request, are only passed
 * to the EAS CLI / Expo API, and are never stored or logged.
 */

export { EasError, type EasErrorCode } from "./errors";

/**
 * Hosted builds: with EXPO_TOKEN set on the server, builds run on the site
 * owner's Expo account and users never need one. A user may still connect
 * their own token, which then takes precedence.
 */
export function hostedToken(): string | undefined {
  return process.env.EXPO_TOKEN?.trim() || undefined;
}

const expoApi = () => (process.env.APPMAKER_EXPO_API_URL || "https://api.expo.dev").replace(/\/$/, "");
const workRoot = () => process.env.APPMAKER_EAS_WORKDIR || path.join(os.tmpdir(), "appmaker-eas");

function easCliPath(): string {
  const cli = process.env.APPMAKER_EAS_CLI || path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "eas-cli", "bin", "run");
  if (!existsSync(cli)) {
    throw new EasError("Cloud builds aren't set up on this server: the EAS CLI (eas-cli) isn't installed.", 501, "setup");
  }
  return cli;
}

/** True when this server can run cloud builds. */
export function easAvailable(): boolean {
  try {
    easCliPath();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Expo API (status and account checks, no CLI needed)

async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${expoApi()}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new EasError("Couldn't reach Expo. Check your connection and try again.", 502);
  }
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { errorCode?: string } }[] } | null;
  const err = body?.errors?.[0];
  if (res.status === 401 || res.status === 403 || /UNAUTHORIZED|UNAUTHENTICATED/i.test(err?.extensions?.errorCode ?? "")) {
    throw new EasError("Expo didn't accept this access token. Create a new one at expo.dev and connect again.", 401, "auth");
  }
  if (err) throw new EasError(`Expo: ${err.message}`, 502);
  if (!res.ok || !body?.data) throw new EasError(`Expo answered with an error (HTTP ${res.status}).`, 502);
  return body.data;
}

export interface ExpoAccount {
  /** The user's name, or the robot's for robot tokens. */
  name: string;
  /** The account new projects are created under. */
  account: string;
}

export async function whoami(token: string): Promise<ExpoAccount> {
  const data = await graphql<{
    meActor: { __typename: string; username?: string; firstName?: string; accounts: { name: string }[] } | null;
  }>(token, `query AppmakerWhoami { meActor { __typename ... on UserActor { username } ... on Robot { firstName } accounts { name } } }`);
  const actor = data.meActor;
  if (!actor) throw new EasError("Expo didn't accept this access token.", 401, "auth");
  const account = actor.username ?? actor.accounts[0]?.name;
  if (!account) throw new EasError("This Expo token has no account to build under.", 400, "auth");
  return { name: actor.username ?? `${actor.firstName || "Robot"} (robot)`, account };
}

interface RawBuild {
  id: string;
  status: string;
  platform: string;
  buildProfile?: string | null;
  appVersion?: string | null;
  appBuildVersion?: string | null;
  createdAt?: string;
  queuePosition?: number | null;
  estimatedWaitTimeLeftSeconds?: number | null;
  error?: { message?: string | null } | null;
  artifacts?: { buildUrl?: string | null; applicationArchiveUrl?: string | null } | null;
  submissions?: { status: string; error?: { message?: string | null } | null }[] | null;
}

export function toCloudBuild(b: RawBuild): CloudBuild {
  const target: BuildTarget = b.platform === "IOS" ? "ios" : b.buildProfile === "preview" ? "android-apk" : "android";
  const submission = b.submissions?.at(-1);
  return {
    id: b.id,
    target,
    status: b.status,
    createdAt: b.createdAt ? Date.parse(b.createdAt) : Date.now(),
    ...(b.appVersion ? { appVersion: b.appVersion } : {}),
    ...(b.appBuildVersion ? { buildNumber: b.appBuildVersion } : {}),
    ...(b.artifacts?.applicationArchiveUrl || b.artifacts?.buildUrl
      ? { artifactUrl: (b.artifacts.applicationArchiveUrl || b.artifacts.buildUrl)! }
      : {}),
    ...(b.error?.message ? { error: b.error.message } : {}),
    ...(b.queuePosition != null ? { queuePosition: b.queuePosition } : {}),
    ...(b.estimatedWaitTimeLeftSeconds != null ? { waitSeconds: b.estimatedWaitTimeLeftSeconds } : {}),
    ...(submission ? { submission: { status: submission.status, ...(submission.error?.message ? { error: submission.error.message } : {}) } } : {}),
  };
}

const BUILD_FIELDS = `id status platform buildProfile appVersion appBuildVersion createdAt queuePosition estimatedWaitTimeLeftSeconds
  error { message } artifacts { buildUrl applicationArchiveUrl } submissions { id status error { message } }`;

export async function getBuilds(token: string, ids: string[]): Promise<CloudBuild[]> {
  return Promise.all(
    ids.map(async (id) => {
      const data = await graphql<{ builds: { byId: RawBuild } }>(
        token,
        `query AppmakerBuild($buildId: ID!) { builds { byId(buildId: $buildId) { ${BUILD_FIELDS} } } }`,
        { buildId: id },
      );
      return toCloudBuild(data.builds.byId);
    }),
  );
}

// ---------------------------------------------------------------------------
// EAS CLI

/** Network settings child processes need to reach Expo and npm (proxies, CA certificates). */
const NETWORK_VARS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "npm_config_registry",
  "NPM_CONFIG_REGISTRY",
];

function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: process.env.PATH ?? "", HOME: home, TMPDIR: os.tmpdir() };
  for (const k of NETWORK_VARS) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

function clean(output: string, secrets: string[]): string {
  let text = output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  for (const s of secrets) if (s) text = text.split(s).join("•••");
  return text;
}

/** Turns EAS CLI output into a message a person can act on. */
export function easFailure(output: string, action = "start the build"): EasError {
  if (/Credentials are not set up|MissingCredentialsNonInteractive/i.test(output)) {
    return new EasError(
      "Apple signing isn't set up for this app yet. Do the one-time Apple setup below, then build again.",
      409,
      "ios-credentials",
    );
  }
  if (/InsufficientAuthenticationNonInteractive|authentication with an ASC API key is required/i.test(output)) {
    return new EasError(
      "Expo needs your App Store Connect API key to update this app's provisioning profile. Add the key under “Upload to App Store”, then build again.",
      409,
      "ios-credentials",
    );
  }
  // The token can't create projects in the chosen account; Expo lists the ones it can.
  const denied = /not able to create projects in the "([^"]+)" account\.?\s*Accounts you have permissions to create projects in:\s*([^\n]+)/i.exec(output);
  if (denied) {
    const allowed = denied[2]
      .split(/[,\s]+/)
      .map((a) => a.trim().replace(/\.$/, ""))
      .filter(Boolean);
    return new EasError(
      `This Expo token can't create projects in the "${denied[1]}" account. It can use: ${allowed.join(", ") || "none"}. Set APPMAKER_EXPO_ACCOUNT to one of these (or remove it), or use a token from the "${denied[1]}" account.`,
      403,
      "failed",
      { allowedAccounts: allowed },
    );
  }
  if (/not authorized|unauthorized|log in with|EXPO_TOKEN/i.test(output)) {
    return new EasError("Expo didn't accept this access token. Create a new one at expo.dev and connect again.", 401, "auth");
  }
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^at\s|^\s*[│┌└]|node_modules|DeprecationWarning|--trace-deprecation/.test(l) && !/^\{|^\[/.test(l));
  const tail = lines.slice(-6).join("\n").slice(-700);
  return new EasError(tail ? `Expo couldn't ${action}:\n${tail}` : `Expo couldn't ${action}.`, 502);
}

interface RunOptions {
  cwd: string;
  token: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  secrets?: string[];
  /** What failed, for the error message ("start the build"). */
  action?: string;
}

/** Runs the EAS CLI. Only the variables it needs are passed — never the server's own secrets. */
function runEas(args: string[], { cwd, token, env = {}, timeoutMs = 10 * 60_000, secrets = [], action }: RunOptions): Promise<string> {
  const cli = easCliPath();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: {
        // A private home next to (not inside) the project, so nothing the CLI
        // writes there is uploaded with the app or shared between users.
        ...baseEnv(`${cwd}-home`),
        EXPO_TOKEN: token,
        EAS_NO_VCS: "1",
        EAS_PROJECT_ROOT: cwd,
        CI: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        EXPO_NO_TELEMETRY: "1",
        NODE_NO_WARNINGS: "1",
        EAS_BUILD_NO_EXPO_GO_WARNING: "true",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new EasError(`Couldn't run the EAS CLI: ${e.message}`, 500, "setup"));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const all = [token, ...secrets];
      if (code === 0) return resolve(clean(stdout, all));
      if (signal === "SIGKILL") return reject(new EasError("Expo took too long to respond. Try again in a few minutes.", 504));
      reject(easFailure(clean(`${stderr}\n${stdout}`, all), action));
    });
  });
}

/** Reads the JSON the EAS CLI prints with --json (logs go to stderr). */
export function parseJsonOutput<T>(stdout: string): T {
  const text = stdout.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.search(/^[[{]/m);
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new EasError("Expo returned an unexpected answer. Try again.", 502);
  }
}

// ---------------------------------------------------------------------------
// Expo packages for reading the app config
//
// The EAS CLI evaluates app.json and its config plugins (notifications,
// image picker) locally, which needs the Expo packages installed. They are the
// same for every app, so they're installed once and linked into each build.

let depsInstall: Promise<string | null> | null = null;

export function ensureExpoDeps(): Promise<string | null> {
  if (process.env.APPMAKER_EAS_SKIP_DEPS === "1") return Promise.resolve(null);
  depsInstall ??= installDeps().catch((e) => {
    depsInstall = null;
    throw e;
  });
  return depsInstall;
}

async function installDeps(): Promise<string> {
  const hash = createHash("sha256").update(JSON.stringify(EXPO_DEPS)).digest("hex").slice(0, 12);
  const dir = path.join(workRoot(), `expo-deps-${hash}`);
  const modules = path.join(dir, "node_modules");
  const marker = path.join(modules, ".appmaker-ready");
  if (existsSync(marker)) return modules;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ private: true, dependencies: EXPO_DEPS }, null, 2));
  await new Promise<void>((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--legacy-peer-deps", "--loglevel=error"], {
      cwd: dir,
      env: { ...baseEnv(dir), npm_config_cache: path.join(workRoot(), "npm-cache") },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60_000);
    child.on("error", (e) => reject(new EasError(`Couldn't install the Expo packages on the server: ${e.message}`, 500, "setup")));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new EasError(`Couldn't install the Expo packages on the server: ${err.trim().split("\n").slice(-3).join(" ")}`, 500, "setup"));
    });
  });
  await writeFile(marker, new Date().toISOString());
  await rm(path.join(workRoot(), "npm-cache"), { recursive: true, force: true }).catch(() => {});
  return modules;
}

// ---------------------------------------------------------------------------
// Project folders

const ASC_KEY_FILE = "asc-api-key.p8";

/** Signing files for an iOS build with local credentials. */
interface IosSigningFiles {
  p12: Buffer;
  password: string;
  profile: Buffer;
}

async function withProjectDir<T>(
  project: Project,
  icon: Buffer,
  options: { link?: ExpoLink; ios?: IosSubmitConfig; ascKey?: AscApiKey; signing?: IosSigningFiles; expoGo?: boolean },
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const modules = await ensureExpoDeps();
  await mkdir(workRoot(), { recursive: true });
  const base = await mkdtemp(path.join(workRoot(), "build-"));
  const dir = path.join(base, "app");
  await mkdir(dir, { recursive: true });
  await mkdir(`${dir}-home`, { recursive: true });
  try {
    const ios: IosSubmitConfig = { ...options.ios };
    if (options.ascKey) {
      // *.p8 is in .gitignore, so the key is used for the upload but never
      // included in the source archive sent to the build server.
      const keyPath = path.join(dir, ASC_KEY_FILE);
      await writeFile(keyPath, options.ascKey.p8, { mode: 0o600 });
      await chmod(keyPath, 0o600);
      Object.assign(ios, {
        ascApiKeyPath: `./${ASC_KEY_FILE}`,
        ascApiKeyId: options.ascKey.keyId,
        ...(options.ascKey.issuerId ? { ascApiKeyIssuerId: options.ascKey.issuerId } : {}),
      });
    }
    if (options.signing) {
      // credentials.json and ios-certs/ are .gitignored: the CLI sends them to
      // the build as secrets, not as part of the source archive.
      await mkdir(path.join(dir, "ios-certs"), { recursive: true });
      await writeFile(path.join(dir, "ios-certs", "dist.p12"), options.signing.p12, { mode: 0o600 });
      await writeFile(path.join(dir, "ios-certs", "profile.mobileprovision"), options.signing.profile, { mode: 0o600 });
      await writeFile(
        path.join(dir, "credentials.json"),
        JSON.stringify({
          ios: {
            provisioningProfilePath: "ios-certs/profile.mobileprovision",
            distributionCertificate: { path: "ios-certs/dist.p12", password: options.signing.password },
          },
        }),
        { mode: 0o600 },
      );
    }
    const files = expoProjectFiles(project, { link: options.link, ios, localIosCredentials: !!options.signing, expoGo: options.expoGo });
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, rel);
      if (!file.startsWith(dir + path.sep)) continue;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    await mkdir(path.join(dir, path.dirname(ICON_PATH)), { recursive: true });
    await writeFile(path.join(dir, ICON_PATH), icon);
    if (modules) await symlink(modules, path.join(dir, "node_modules"), "dir");
    return await run(dir);
  } finally {
    await rm(base, { recursive: true, force: true }).catch(() => {});
  }
}

/** Creates the app's project on the Expo account the token belongs to. */
export async function linkProject(token: string, project: Project, icon: Buffer): Promise<ExpoLink> {
  const account = (token === hostedToken() && process.env.APPMAKER_EXPO_ACCOUNT?.trim()) || (await whoami(token)).account;
  return withProjectDir(project, icon, {}, async (dir) => {
    const init = (name: string) =>
      runEas(["init", "--non-interactive", "--force", "--json", "--account", name], { cwd: dir, token, timeoutMs: 3 * 60_000, action: "create the project" });
    let out: string;
    try {
      out = await init(account);
    } catch (e) {
      // The account name is wrong for this token (e.g. APPMAKER_EXPO_ACCOUNT): use the one Expo allows.
      const allowed = e instanceof EasError ? (e.data?.allowedAccounts as string[] | undefined) : undefined;
      if (!allowed?.[0] || allowed.includes(account)) throw e;
      console.warn(`Expo: can't create projects in "${account}", using "${allowed[0]}" instead. Check APPMAKER_EXPO_ACCOUNT.`);
      out = await init(allowed[0]);
    }
    const res = parseJsonOutput<{ projectId?: string; owner?: string; slug?: string }>(out);
    if (!res.projectId || !res.owner || !res.slug) throw new EasError("Expo didn't return the new project. Try again.", 502);
    return { projectId: res.projectId, owner: res.owner, slug: res.slug };
  });
}

export interface BuildRequest {
  token: string;
  project: Project;
  icon: Buffer;
  link: ExpoLink;
  target: BuildTarget;
  /** iOS: upload to App Store Connect (TestFlight) as soon as the build finishes. */
  submit?: { ascAppId: string; ascKey: AscApiKey };
  /**
   * iOS: with a Team API key Appmaker creates the certificate and profile
   * itself, so no one has to sign in to Apple or Expo.
   */
  ascKey?: AscApiKey;
  /** The distribution certificate from an earlier build, kept by the browser. */
  signing?: AppleSigning;
}

export interface BuildResult {
  builds: CloudBuild[];
  /** A newly created certificate for the browser to keep for later builds. */
  signing?: AppleSigning;
}

export function buildArgs(target: BuildTarget, submit: boolean): string[] {
  const platform = target === "ios" ? "ios" : "android";
  const profile = target === "android-apk" ? "preview" : "production";
  return [
    "build",
    "--platform",
    platform,
    "--profile",
    profile,
    "--non-interactive",
    "--no-wait",
    "--json",
    ...(submit && target === "ios" ? ["--auto-submit"] : []),
  ];
}

export async function startBuild(req: BuildRequest): Promise<BuildResult> {
  const ascKey = req.submit?.ascKey ?? req.ascKey;
  const ios: IosSubmitConfig = req.submit ? { ascAppId: req.submit.ascAppId } : {};
  let signing: IosSigningFiles | undefined;
  let newSigning: AppleSigning | undefined;
  if (req.target === "ios" && ascKey?.issuerId) {
    const result = await ensureSigning({
      key: ascKey,
      bundleId: req.project.listing.bundleId,
      appName: req.project.listing.name,
      push: usesPackage(req.project, "expo-notifications"),
      signing: req.signing,
    });
    signing = { p12: Buffer.from(result.signing.p12, "base64"), password: result.signing.password, profile: result.profile };
    if (result.created) newSigning = result.signing;
  }
  const secrets = [ascKey?.p8 ?? "", signing?.password ?? ""];
  const building = withProjectDir(req.project, req.icon, { link: req.link, ios, ascKey, signing }, async (dir) => {
    const env: Record<string, string> = {};
    if (ascKey && req.target === "ios") {
      env.EXPO_ASC_API_KEY_PATH = path.join(dir, ASC_KEY_FILE);
      env.EXPO_ASC_KEY_ID = ascKey.keyId;
      if (ascKey.issuerId) env.EXPO_ASC_ISSUER_ID = ascKey.issuerId;
    }
    const out = await runEas(buildArgs(req.target, !!req.submit), { cwd: dir, token: req.token, env, secrets });
    const parsed = parseJsonOutput<RawBuild[] | RawBuild>(out);
    const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((b) => b?.id);
    if (!list.length) throw new EasError("Expo didn't return the build. Check expo.dev for its status.", 502);
    return list.map((b) => ({ ...toCloudBuild(b), target: req.target }));
  });
  let builds: CloudBuild[];
  try {
    builds = await building;
  } catch (e) {
    // A certificate made for this build must still reach the browser, or the
    // retry would make another one and run into Apple's per-team limit.
    if (!newSigning) throw e;
    const err = e instanceof EasError ? e : new EasError("Expo couldn't start the build. Try again.", 502);
    err.data = { ...err.data, signing: newSigning };
    throw err;
  }
  return { builds, ...(newSigning ? { signing: newSigning } : {}) };
}

// ---------------------------------------------------------------------------
// Previews on a phone with Expo Go (EAS Update)

/** The link Expo Go opens for an update group; shown as a QR code. */
export function expoGoUrl(groupId: string): string {
  return `exp://u.expo.dev/update/${encodeURIComponent(groupId)}`;
}

export function updateArgs(): string[] {
  return ["update", "--branch", "expo-go", "--message", "Appmaker preview", "--platform", "all", "--non-interactive", "--json"];
}

interface RawUpdate {
  id?: string;
  group?: string;
  platform?: string;
  runtimeVersion?: string;
  createdAt?: string;
}

/**
 * Publishes the app's JavaScript as an EAS Update made for Expo Go's SDK.
 * Scanning the QR code opens it in Expo Go on the same Expo SDK as the store
 * builds, with no build needed. Takes about a minute (Expo bundles the app).
 */
export async function publishUpdate(req: { token: string; project: Project; icon: Buffer; link: ExpoLink }): Promise<PhonePreview> {
  return withProjectDir(req.project, req.icon, { link: req.link, expoGo: true }, async (dir) => {
    const out = await runEas(updateArgs(), { cwd: dir, token: req.token, timeoutMs: 4.5 * 60_000, action: "publish the preview" });
    const updates = parseJsonOutput<RawUpdate[] | RawUpdate>(out);
    const list = (Array.isArray(updates) ? updates : [updates]).filter((u) => u?.group);
    const group = list.find((u) => u.runtimeVersion === EXPO_GO_RUNTIME)?.group ?? list[0]?.group;
    if (!group) throw new EasError("Expo didn't return the published preview. Try again.", 502);
    return {
      groupId: group,
      url: expoGoUrl(group),
      platforms: list.filter((u) => u.group === group && u.platform).map((u) => u.platform!),
      publishedAt: Date.now(),
    };
  });
}
