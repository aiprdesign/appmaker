"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Database, ExternalLink, Loader2, Power, Sparkles } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { useFeatures } from "@/lib/use-features";
import { DATA_FILE, RULES_FILE, appRules, dataModule } from "@/lib/app-data";
import { STAFF_FILE, staffModule } from "@/lib/staff";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { YourData, type DataCounts } from "./YourData";
import { PaidLock } from "@/components/PaidLock";
import { locked, usePlan } from "@/lib/use-plan";
import type { Project } from "@/lib/types";

type AppData = NonNullable<Project["appData"]>;

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

/**
 * The app's database in one tap: the data the app keeps (from src/data-rules.json),
 * a switch that moves it from the phone to Appmaker's database, and the owner
 * link where the business manages orders, requests and its menu.
 */
export function AppDataPanel({
  project,
  onChange,
  onAddData,
  onRulesChange,
  onAskData,
  rulesSync = "",
  busy: appBusy,
}: {
  project: Project;
  onChange: (appData: AppData | undefined, files: Project["files"]) => void;
  onAddData: () => void;
  onRulesChange: (rules: import("@/lib/app-data").DataRules) => void;
  onAskData: (request: string) => void;
  rulesSync?: "" | "saving" | "failed";
  busy: boolean;
}) {
  const cloud = useCloud();
  const features = useFeatures();
  const plan = usePlan();
  const [ownerUrl, setOwnerUrl] = useState("");
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const signedIn = !!cloud.user;
  const rules = appRules(project.files);
  const on = !!project.appData;

  useEffect(() => {
    if (!signedIn || !on) return;
    let live = true;
    call(`/api/appdata?projectId=${project.id}`, "GET")
      .then((d) => {
        if (!live) return;
        setOwnerUrl(d.store?.ownerUrl ?? "");
        setCounts(d.store?.counts ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [signedIn, on, project.id]);

  if (!features.appData) return null;

  const turnOn = async () => {
    if (!rules) return;
    setBusy("on");
    setError("");
    try {
      const { store } = await call("/api/appdata", "POST", { projectId: project.id, name: project.listing.name || project.name, rules });
      setOwnerUrl(store.ownerUrl);
      onChange({ id: store.id, apiUrl: store.apiUrl }, { ...project.files, [DATA_FILE]: dataModule(store.apiUrl, rules), [STAFF_FILE]: staffModule(store.apiUrl) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setConfirmOff(false);
    setBusy("off");
    setError("");
    try {
      await call(`/api/appdata?projectId=${project.id}`, "DELETE");
      setOwnerUrl("");
      onChange(undefined, rules ? { ...project.files, [DATA_FILE]: dataModule(null, rules), [STAFF_FILE]: staffModule(null) } : project.files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="appdata-title" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <Database className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="appdata-title" className="font-semibold">
            App database {on && <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">On</span>}
          </h3>
          <p className="text-sm text-muted">
            Orders, requests, sign-ups, reviews and a menu you can update, stored by Appmaker. Nothing to set up: no Supabase, Firebase or server.
          </p>
        </div>
      </div>

      {!rules && project.files[RULES_FILE] ? (
        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm">
          <p>The app&apos;s data rules (src/data-rules.json) have a mistake, so nothing new is saved to the database until they&apos;re fixed.</p>
          <button onClick={() => onAskData("Fix src/data-rules.json so it follows the app data rules exactly, keeping every collection, field and status it means to have. Keep everything else the same.")} disabled={appBusy} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50">
            <Sparkles className="h-4 w-4" aria-hidden /> Fix it with AI
          </button>
        </div>
      ) : !rules ? (
        <div className="rounded-xl border border-line bg-background/50 p-3 text-sm">
          <p className="text-muted">This app keeps its data on each phone. Want customers to send you orders or requests, or a menu you can change without a new version?</p>
          <button
            onClick={onAddData}
            disabled={appBusy}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Add shared data to the app
          </button>
        </div>
      ) : (
        <>
          <YourData rules={rules} files={project.files} counts={counts} on={on} busy={appBusy} onRulesChange={onRulesChange} onAskData={onAskData} />
          {on && rulesSync && (
            <p role={rulesSync === "failed" ? "alert" : "status"} className={`text-xs ${rulesSync === "failed" ? "text-amber-200" : "text-muted"}`}>
              {rulesSync === "saving" ? "Saving the change to your database…" : "Couldn't save the change to your database. Check your connection; it's tried again after your next change."}
            </p>
          )}
          {!on ? (
            signedIn && locked(plan) ? (
              <PaidLock feature="App databases" />
            ) : signedIn ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">Right now this data stays on each phone (so you can try the app). Turn the database on so it reaches you and every customer.</p>
                <button
                  onClick={() => void turnOn()}
                  disabled={!!busy || appBusy}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-400 px-4 text-sm font-medium text-black hover:bg-emerald-300 disabled:opacity-50"
                >
                  {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />} Turn on the app database
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                <Link href="/login" className="underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to turn on the app database. Until then the data stays on each phone.
              </p>
            )
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                <Check className="h-4 w-4" aria-hidden /> Shared with every customer. Manage it on the owner page (turn on alerts there), or set a staff PIN there to manage orders in the app.
              </p>
              {ownerUrl && (
                <div className="flex flex-wrap gap-2">
                  <a href={ownerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black">
                    <ExternalLink className="h-4 w-4" aria-hidden /> Open the owner page
                  </a>
                  <button
                    onClick={() => void navigator.clipboard?.writeText(ownerUrl).then(() => setCopied(true))}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
                  >
                    <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy the owner link"}
                  </button>
                  <button onClick={() => setConfirmOff(true)} disabled={!!busy} className="min-h-9 rounded-lg px-3 text-sm text-muted hover:text-red-300">
                    Turn off
                  </button>
                </div>
              )}
              <p className="text-xs text-muted">
                Send the owner link to the business: anyone with it can see and manage the app&apos;s data. Customer details are kept only as long as needed (finished orders are deleted after 90 days), customers can delete their own data in the app, and the app&apos;s privacy policy lists exactly what&apos;s collected.
              </p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      {confirmOff && (
        <ConfirmDialog
          title="Turn off the app database?"
          body="All the app's shared data (orders, requests, reviews, the menu you edited) is deleted. The app goes back to keeping data on each phone."
          confirmLabel="Turn off and delete"
          danger
          onCancel={() => setConfirmOff(false)}
          onConfirm={turnOff}
        />
      )}
    </section>
  );
}
