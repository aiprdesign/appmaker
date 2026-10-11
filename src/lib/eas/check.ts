import { EasError } from "./errors";
import { easAvailable, expoDepsState, expoProject, ensureExpoDeps, hostedToken, whoami } from "./server";
import type { ExpoLink } from "../types";

/** One line of the build check: ok, a problem (false), or a warning that doesn't stop a build (null). */
export interface ExpoCheck {
  id: string;
  label: string;
  ok: boolean | null;
  /** What's wrong and how to fix it, in plain words. */
  detail?: string;
}

export interface ExpoCheckResult {
  /** Builds run on the site's own Expo account. */
  hosted: boolean;
  /** The Expo account builds go to. */
  account?: string;
  checks: ExpoCheck[];
}

/**
 * Everything that has to be right before Appmaker talks to Expo: the build tool
 * on the server, Expo's reachability, the token, the account, the packages and
 * the app's linked project. Each problem says how to fix it.
 */
export async function checkExpo({ token, link, cloudBuilds }: { token?: string; link?: ExpoLink; cloudBuilds: boolean }): Promise<ExpoCheckResult> {
  const checks: ExpoCheck[] = [];
  const site = hostedToken();
  const using = token || site;
  const hosted = !token && !!site;

  checks.push(
    cloudBuilds
      ? { id: "feature", label: "Cloud builds are switched on", ok: true }
      : { id: "feature", label: "Cloud builds are switched on", ok: false, detail: "The site owner turned cloud builds off in admin. Download the Expo project and build it yourself instead." },
  );
  const cli = easAvailable();
  checks.push(
    cli
      ? { id: "cli", label: "The build tool (EAS CLI) is installed on the server", ok: true }
      : { id: "cli", label: "The build tool (EAS CLI) is installed on the server", ok: false, detail: "The server is missing eas-cli. The site owner should redeploy with its dependencies installed (npm install)." },
  );

  if (!using) {
    checks.push({
      id: "token",
      label: "An Expo account is connected",
      ok: false,
      detail: "Connect your Expo account below (a free access token from expo.dev). Or the site owner can set EXPO_TOKEN so builds run on the site's account.",
    });
    return { hosted: false, checks };
  }

  let account: string | undefined;
  try {
    const who = await whoami(using);
    const wanted = hosted ? process.env.APPMAKER_EXPO_ACCOUNT?.trim() : undefined;
    account = wanted || who.account;
    checks.push({ id: "reach", label: "Expo can be reached", ok: true });
    checks.push({ id: "token", label: hosted ? "The site's Expo token is accepted" : "Your Expo token is accepted", ok: true, detail: `Signed in as ${who.name}.` });
    if (wanted && who.accounts && !who.accounts.includes(wanted)) {
      checks.push({
        id: "account",
        label: `New apps go to the "${wanted}" account`,
        ok: false,
        detail: `This token can't create projects in "${wanted}" (it can use: ${who.accounts.join(", ")}). The site owner should set APPMAKER_EXPO_ACCOUNT to one of those, or create the token in "${wanted}".`,
      });
      account = who.accounts[0];
    } else {
      checks.push({ id: "account", label: `New apps go to the "${account}" account`, ok: true });
    }
  } catch (e) {
    const auth = e instanceof EasError && e.code === "auth";
    checks.push(
      auth
        ? { id: "reach", label: "Expo can be reached", ok: true }
        : { id: "reach", label: "Expo can be reached", ok: false, detail: e instanceof Error ? e.message : "Expo didn't answer. Try again in a minute." },
    );
    checks.push({
      id: "token",
      label: hosted ? "The site's Expo token is accepted" : "Your Expo token is accepted",
      ok: auth ? false : null,
      detail: auth
        ? hosted
          ? "Expo rejected the site's token. The site owner should create a new one at expo.dev and update EXPO_TOKEN."
          : "Expo rejected your token. Create a new one at expo.dev (Account settings → Access tokens) and connect again."
        : "Couldn't check it because Expo didn't answer.",
    });
    return { hosted, checks };
  }

  if (cli) {
    const deps = expoDepsState();
    if (deps.state === "idle") ensureExpoDeps().catch(() => {});
    checks.push(
      deps.state === "ready" || deps.state === "skipped"
        ? { id: "deps", label: "The Expo packages builds need are ready", ok: true }
        : deps.state === "failed"
          ? { id: "deps", label: "The Expo packages builds need are ready", ok: false, detail: `${deps.error ?? "Installing them failed."} The site owner should check the server's disk space and network, then redeploy.` }
          : { id: "deps", label: "The Expo packages builds need are ready", ok: null, detail: "Still installing on the server (the first time takes a few minutes). Builds wait for it automatically." },
    );
  }

  if (link) {
    // An app linked on the site's account can't be reached with a user's own token, and the other way round.
    const sameSide = !!link.hosted === hosted;
    if (!sameSide) {
      checks.push({
        id: "project",
        label: "The app's Expo project",
        ok: null,
        detail: hosted
          ? "This app was set up on your own Expo account; builds now run on the site's account, so it will be set up there again automatically."
          : "This app was set up on the site's Expo account; with your own token connected it will be set up on your account automatically.",
      });
    } else {
      try {
        const found = await expoProject(using, link.projectId);
        checks.push(
          found
            ? { id: "project", label: `The app's Expo project (${found.owner}/${found.slug}) is there`, ok: true }
            : {
                id: "project",
                label: "The app's Expo project is there",
                ok: false,
                detail: `Expo can't find ${link.owner}/${link.slug} for this account (deleted, or a different account). Press "Set up again" to create it fresh.`,
              },
        );
      } catch (e) {
        checks.push({ id: "project", label: "The app's Expo project is there", ok: null, detail: e instanceof Error ? e.message : "Couldn't check it." });
      }
    }
  }
  return { hosted, account, checks };
}
