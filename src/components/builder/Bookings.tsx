"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, CheckCircle2, Copy, ExternalLink, Loader2, Power, Sparkles } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { useFeatures } from "@/lib/use-features";
import { BOOKING_FILE, bookingModule, defaultSettings, usesBooking, type BookingSettings } from "@/lib/booking";
import { defaultDesign, THEME_FILE, themeModule } from "@/lib/design";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaidLock } from "@/components/PaidLock";
import { locked, usePlan } from "@/lib/use-plan";
import { HoursEditor } from "@/components/HoursEditor";
import type { Project } from "@/lib/types";

type Booking = NonNullable<Project["booking"]>;
interface Setup {
  id: string;
  settings: BookingSettings;
  apiUrl: string;
  ownerUrl: string;
}

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function browserDefaults(): BookingSettings {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const h12 = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
  return defaultSettings(tz, h12 === false ? "24h" : "12h");
}

/**
 * Bookings in three steps for the person making the app: set the hours, turn
 * it on (Appmaker adds a Book tab), and send the owner link to the business.
 */
export function Bookings({
  project,
  onChange,
  onAddScreen,
  busy: appBusy,
}: {
  project: Project;
  onChange: (booking: Booking | undefined, files: Project["files"]) => void;
  onAddScreen: () => void;
  busy: boolean;
}) {
  const cloud = useCloud();
  const features = useFeatures();
  const plan = usePlan();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"on" | "save" | "off" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const signedIn = !!cloud.user;
  const on = !!project.booking;

  // The saved setup (for the owner link and hours) when bookings are on.
  useEffect(() => {
    if (!signedIn || !features.bookings) return;
    let live = true;
    call(`/api/bookings?projectId=${project.id}`, "GET")
      .then((d) => {
        if (!live) return;
        setSetup(d.setup);
        setSettings(d.setup?.settings ?? browserDefaults());
      })
      .catch(() => live && setSettings((s) => s ?? browserDefaults()));
    return () => {
      live = false;
    };
  }, [signedIn, features.bookings, project.id]);

  if (!features.bookings) return null;

  const withFiles = (apiUrl: string | null) => {
    const files: Project["files"] = { ...project.files, [BOOKING_FILE]: bookingModule(apiUrl) };
    // The booking screen takes its colors from the app's theme.
    if (!files[THEME_FILE]) files[THEME_FILE] = themeModule(project.design ?? defaultDesign(project.listing));
    return files;
  };

  const turnOn = async () => {
    if (!settings) return;
    setBusy("on");
    setError("");
    try {
      const { setup: s } = await call("/api/bookings", "POST", { projectId: project.id, name: project.listing.name || project.name, settings });
      setSetup(s);
      const files = withFiles(s.apiUrl);
      onChange({ id: s.id, apiUrl: s.apiUrl }, files);
      if (!usesBooking(files)) onAddScreen();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!settings) return;
    setBusy("save");
    setError("");
    try {
      const { setup: s } = await call("/api/bookings", "POST", { projectId: project.id, name: project.listing.name || project.name, settings });
      setSetup(s);
      setEditing(false);
      setNotice("Saved. The app shows the new times straight away, no new build needed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy("off");
    setError("");
    try {
      await call(`/api/bookings?projectId=${project.id}`, "DELETE");
      setSetup(null);
      onChange(undefined, withFiles(null));
      setNotice("Bookings are off. The Book screen now asks customers to call.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setConfirmOff(false);
    }
  };

  const button = "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="bookings-title">
      <h2 id="bookings-title" className="flex items-center gap-2 font-semibold">
        <CalendarCheck className="h-4 w-4 text-violet-300" /> Bookings
      </h2>
      <p className="mt-1 text-sm text-muted">
        Customers pick a free time in the app and are booked straight away. The business sees bookings on its own page, can block time off, and change hours
        without a new build.
      </p>

      {cloud.enabled === false ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">Bookings need accounts on this site.</p>
      ) : !signedIn ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          <Link href="/login" className="inline-block py-1 font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>{" "}
          to take bookings.
        </p>
      ) : locked(plan) && !project.booking ? (
        <PaidLock feature="Bookings" />
      ) : !settings ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted" aria-label="Loading" />
      ) : (
        <div className="mt-4 space-y-4">
          {on && (
            <p className="flex items-start gap-1.5 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> Bookings are on.
            </p>
          )}
          {(!on || editing) && <HoursEditor value={settings} onChange={setSettings} />}
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs text-emerald-300">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!on ? (
              <button onClick={turnOn} disabled={!!busy || appBusy} className={`${button} bg-white font-medium text-black`}>
                {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Turn on bookings
              </button>
            ) : editing ? (
              <button onClick={save} disabled={!!busy} className={`${button} bg-white font-medium text-black`}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save hours
              </button>
            ) : (
              <>
                {setup && (
                  <a href={setup.ownerUrl} target="_blank" rel="noreferrer" className={`${button} bg-white font-medium text-black`}>
                    <ExternalLink className="h-4 w-4" /> Open bookings page
                  </a>
                )}
                {setup && (
                  <button
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(setup.ownerUrl)
                        .then(() => setNotice("Owner link copied. Send it to the business: it opens their bookings page."))
                    }
                    className={`${button} border border-line hover:border-white/20`}
                  >
                    <Copy className="h-4 w-4" /> Copy owner link
                  </button>
                )}
                <button onClick={() => setEditing(true)} className={`${button} border border-line hover:border-white/20`}>
                  Change hours
                </button>
                {!usesBooking(project.files) && (
                  <button onClick={onAddScreen} disabled={appBusy} className={`${button} border border-line hover:border-white/20`}>
                    <Sparkles className="h-4 w-4" /> Add the Book tab
                  </button>
                )}
                <button onClick={() => setConfirmOff(true)} disabled={!!busy} className={`${button} text-muted hover:text-foreground`}>
                  <Power className="h-4 w-4" /> Turn off
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-muted">
            {on
              ? "The owner link opens the bookings page without an account: send it to whoever takes the bookings. Bookings made in the preview are real too, so cancel test bookings there."
              : "Turning it on adds a Book tab to your app (1 AI request). Make a new build afterwards for the store version."}
          </p>
        </div>
      )}
      {confirmOff && (
        <ConfirmDialog
          title="Turn off bookings?"
          body="All bookings for this app are deleted, and the Book screen asks customers to call instead."
          confirmLabel="Turn off bookings"
          danger
          onCancel={() => setConfirmOff(false)}
          onConfirm={turnOff}
        />
      )}
    </section>
  );
}
