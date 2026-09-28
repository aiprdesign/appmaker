"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, Loader2, Play, XCircle } from "lucide-react";
import { useAiStatus } from "@/components/AiSettings";
import { getProvider, modelLabel } from "@/lib/ai/providers";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import type { EnvReport } from "@/lib/env-check";

type Tone = "ok" | "warn" | "bad" | "wait";

function Dot({ tone }: { tone: Tone }) {
  if (tone === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Working" />;
  if (tone === "warn") return <CircleAlert className="h-4 w-4 shrink-0 text-amber-400" aria-label="Needs attention" />;
  if (tone === "bad") return <XCircle className="h-4 w-4 shrink-0 text-rose-400" aria-label="Not working" />;
  return <CircleDashed className="h-4 w-4 shrink-0 animate-spin text-muted" aria-label="Checking" />;
}

function Row({ tone, label, children }: { tone: Tone; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Dot tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 break-words text-xs text-muted">{children}</div>
      </div>
    </li>
  );
}

interface ExpoInfo {
  available: boolean;
  hosted: boolean;
  account?: string;
  error?: string;
}

/** Shows what's connected on this site and lets the owner test it live. */
export function StatusPanel() {
  const ai = useAiStatus();
  const [expo, setExpo] = useState<ExpoInfo | null>(null);
  const [env, setEnv] = useState<
    (EnvReport & { database?: { configured: boolean; ok?: boolean; error?: string }; google?: { configured: boolean; redirectUri: string } }) | null
  >(null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; text?: string }>({ state: "idle" });

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setEnv)
      .catch(() => setEnv({ set: [], empty: [], nearMisses: [], demoForced: false, database: { configured: false } }));
    fetch("/api/eas/account?check=1")
      .then((r) => r.json())
      .then(setExpo)
      .catch(() => setExpo({ available: false, hosted: false, error: "Couldn't reach the server." }));
  }, []);

  const runTest = async () => {
    if (!ai) return;
    setTest({ state: "running" });
    try {
      const choice = aiChoiceFor(getAiSettings()) ?? { provider: ai.provider, model: ai.model };
      const res = await fetch("/api/ai/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(choice) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTest({ state: "ok", text: `Answered in ${(data.ms / 1000).toFixed(1)}s: “${String(data.reply).slice(0, 80)}”` });
    } catch (e) {
      setTest({ state: "error", text: e instanceof Error ? e.message : "The test failed." });
    }
  };

  const providerName = ai ? (getProvider(ai.provider)?.name ?? ai.provider) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="mt-1 text-sm text-muted">What this Appmaker site is connected to. Use the live test to check the AI really answers.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="ai-status-title">
        <h2 id="ai-status-title" className="font-semibold">
          AI for building apps
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {!ai ? (
            <Row tone="wait" label="Checking…">
              Reading the site&apos;s AI settings.
            </Row>
          ) : ai.source === "demo" ? (
            <Row tone="warn" label="Demo mode — no AI connected">
              Add a provider key (for example <code className="font-mono">REPLICATE_API_TOKEN</code> or{" "}
              <code className="font-mono">ANTHROPIC_API_KEY</code>) in your server&apos;s variables and redeploy.
            </Row>
          ) : (
            <>
              <Row tone="ok" label={ai.source === "site" ? "Native AI connected" : "Your own AI key connected"}>
                {ai.source === "site"
                  ? "Everyone on this site builds with the site's key — no key needed."
                  : "This browser uses a key you added in the AI settings. Other visitors use the site's AI."}
              </Row>
              <Row tone="ok" label="Provider and model">
                <span className="text-foreground/90">
                  {providerName} · {modelLabel(ai.provider, ai.model)}
                </span>{" "}
                <code className="font-mono">({ai.model})</code>
              </Row>
            </>
          )}
          {ai && ai.source !== "demo" && (
            <li className="py-3">
              <button
                onClick={runTest}
                disabled={test.state === "running"}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {test.state === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run a live AI test
              </button>
              {test.state === "ok" && (
                <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Working. {test.text}
                </p>
              )}
              {test.state === "error" && (
                <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {test.text}
                </p>
              )}
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="expo-status-title">
        <h2 id="expo-status-title" className="font-semibold">
          App Store &amp; Google Play builds (Expo)
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {!expo ? (
            <Row tone="wait" label="Checking…">
              Asking Expo.
            </Row>
          ) : (
            <>
              <Row tone={expo.available ? "ok" : "bad"} label={expo.available ? "Build tool installed" : "Build tool missing"}>
                {expo.available ? "The EAS CLI is installed on the server." : "Cloud builds are off: eas-cli isn't installed. Redeploy with npm install."}
              </Row>
              {expo.hosted && !expo.error && (
                <Row tone="ok" label="Expo connected — builds included">
                  Builds run on the site&apos;s Expo account{expo.account ? <> (<span className="text-foreground/90">{expo.account}</span>)</> : null}. Users
                  don&apos;t need an Expo account.
                </Row>
              )}
              {expo.hosted && expo.error && (
                <Row tone="bad" label="Expo token not working">
                  {expo.error} Check <code className="font-mono">EXPO_TOKEN</code> in the server&apos;s variables.
                </Row>
              )}
              {!expo.hosted && expo.available && (
                <Row tone="warn" label="No site Expo account">
                  Users connect their own Expo account in the Publish tab. To include builds for everyone, add{" "}
                  <code className="font-mono">EXPO_TOKEN</code> to the server&apos;s variables and redeploy.
                </Row>
              )}
            </>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="db-status-title">
        <h2 id="db-status-title" className="font-semibold">
          Accounts &amp; cloud saving
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {!env ? (
            <Row tone="wait" label="Checking…">
              Asking the database.
            </Row>
          ) : !env.database?.configured ? (
            <Row tone="warn" label="Off — apps are saved in each browser only">
              To let people sign in and keep their apps in an account, add a PostgreSQL database and set{" "}
              <code className="font-mono">DATABASE_URL</code> on this service.
            </Row>
          ) : env.database.ok ? (
            <Row tone="ok" label="Database connected">
              People can create accounts, and their apps are saved to the database.
            </Row>
          ) : (
            <Row tone="bad" label="Database not reachable">
              {env.database.error} Check <code className="font-mono">DATABASE_URL</code>.
            </Row>
          )}
          {env?.database?.configured && env.google && (
            <Row tone={env.google.configured ? "ok" : "warn"} label={env.google.configured ? "Sign in with Google: on" : "Sign in with Google: off"}>
              {env.google.configured ? "Authorized redirect URI in Google Cloud must be " : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to turn it on. Authorized redirect URI: "}
              <code className="break-all font-mono text-foreground/90">{env.google.redirectUri}</code>
            </Row>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="env-status-title">
        <h2 id="env-status-title" className="font-semibold">
          Server settings (variables)
        </h2>
        <p className="mt-1 text-xs text-muted">
          Names of the settings this server can see. Values are never shown. If one you added is missing, it isn&apos;t reaching the app: check its
          spelling, that it&apos;s on the right service, and that you deployed after adding it.
        </p>
        <ul className="mt-2 divide-y divide-line">
          {!env ? (
            <Row tone="wait" label="Checking…">
              Reading the server&apos;s settings.
            </Row>
          ) : (
            <>
              {env.host && (
                <Row tone="ok" label="Running on">
                  {env.host.platform} service <code className="font-mono text-foreground/90">{env.host.service ?? "?"}</code>, environment{" "}
                  <code className="font-mono text-foreground/90">{env.host.environment ?? "?"}</code>
                  {env.host.commit ? (
                    <>
                      , version <code className="font-mono text-foreground/90">{env.host.commit}</code>
                    </>
                  ) : null}
                  . Your variables must be on this service and environment.
                </Row>
              )}
              {env.set.length ? (
                <Row tone="ok" label="Settings found">
                  <span className="font-mono text-foreground/90">{env.set.join(", ")}</span>
                </Row>
              ) : (
                <Row tone="bad" label="No Appmaker settings found">
                  The server sees none of Appmaker&apos;s variables, such as <code className="font-mono">REPLICATE_API_TOKEN</code>,{" "}
                  <code className="font-mono">ANTHROPIC_API_KEY</code> or <code className="font-mono">EXPO_TOKEN</code>.
                </Row>
              )}
              {env.empty.length > 0 && (
                <Row tone="warn" label="Set but empty">
                  <span className="font-mono">{env.empty.join(", ")}</span> — paste the value again.
                </Row>
              )}
              {env.nearMisses.map((m) => (
                <Row key={m.found} tone="warn" label="Name looks misspelled">
                  Found <code className="font-mono text-foreground/90">{m.found}</code> — rename it to{" "}
                  <code className="font-mono text-foreground/90">{m.expected}</code>.
                </Row>
              ))}
              {env.demoForced && (
                <Row tone="warn" label="Demo mode is forced on">
                  <code className="font-mono">APPMAKER_DEMO=1</code> is set, so the AI keys are ignored. Delete that variable.
                </Row>
              )}
            </>
          )}
        </ul>
      </section>

      <p className="text-center text-xs text-muted">
        <Link href="/" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Back to building
        </Link>
      </p>
    </div>
  );
}
