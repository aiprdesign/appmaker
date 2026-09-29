"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, X } from "lucide-react";
import { celebrate } from "./celebrate";
import { useCloud } from "@/lib/cloud";
import { addPasskey, deviceEmoji, listPasskeys, PasskeyCancelled, passkeysSupported, removePasskey, type PasskeyInfo } from "@/lib/passkeys";

const NUDGE_KEY = "appmaker.passkey-nudge.v1";

function ago(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

const useSupported = () =>
  useSyncExternalStore(
    () => () => {},
    () => passkeysSupported(),
    () => false,
  );

function usePasskeys(enabled: boolean) {
  const [list, setList] = useState<PasskeyInfo[] | null>(null);
  const reload = useCallback(async () => setList(await listPasskeys()), []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listPasskeys().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [enabled]);
  return { list, reload };
}

/** Runs "add a passkey" with a celebration when it works. */
function useAddPasskey(onAdded: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const add = async (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBusy(true);
    setMessage(null);
    try {
      const passkey = await addPasskey();
      celebrate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, ["🔑", "✨", "😎"]);
      setMessage({ tone: "ok", text: `Passkey added for your ${passkey.name}! Next time, just use Face ID, your fingerprint or passcode 😎` });
      onAdded();
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't add the passkey." });
    } finally {
      setBusy(false);
    }
  };
  return { add, busy, message };
}

/** The passkey section of the account menu. */
export function PasskeyManager() {
  const cloud = useCloud();
  const supported = useSupported() && cloud.passkeys !== false;
  const { list, reload } = usePasskeys(supported);
  const { add, busy, message } = useAddPasskey(reload);
  const [removing, setRemoving] = useState<string | null>(null);
  if (!supported) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">🔑 Passkeys</span>
        {list && list.length > 0 && <span className="text-[11px] text-muted">{list.length} saved</span>}
      </div>
      {list && list.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Your passkeys">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2 py-1.5 text-xs">
              <span aria-hidden="true">{deviceEmoji(p.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-[11px] text-muted">
                  Added {ago(p.createdAt)}
                  {p.lastUsedAt ? ` · used ${ago(p.lastUsedAt)}` : ""}
                </span>
              </span>
              <button
                onClick={async () => {
                  if (!confirm(`Remove the passkey for your ${p.name}? You can add it again anytime.`)) return;
                  setRemoving(p.id);
                  await removePasskey(p.id).catch(() => {});
                  await reload();
                  setRemoving(null);
                }}
                aria-label={`Remove passkey for ${p.name}`}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-rose-300"
              >
                {removing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list && list.length === 0 && <p className="mt-1 text-[11px] text-muted">Sign in with Face ID, your fingerprint or device passcode. No password needed.</p>}
      <button
        onClick={add}
        disabled={busy}
        className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true">✨</span>}
        {busy ? "Check your device…" : list?.length ? "Add another passkey" : "Add a passkey"}
      </button>
      {message && (
        <p role={message.tone === "bad" ? "alert" : "status"} className={`mt-2 text-[11px] ${message.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** A friendly one-time suggestion on My apps for signed-in people without a passkey. */
export function PasskeyNudge() {
  const cloud = useCloud();
  const supported = useSupported();
  const on = supported && !!cloud.user && cloud.passkeys !== false;
  const { list, reload } = usePasskeys(on);
  const { add, busy, message } = useAddPasskey(reload);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      // Read after mount: localStorage isn't available during server rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.localStorage.getItem(NUDGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (!on || !list) return null;
  if (message?.tone === "ok") {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
        🎉 {message.text}
      </div>
    );
  }
  if (dismissed || list.length > 0) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-fuchsia-500/30 bg-gradient-to-r from-violet-500/10 to-pink-500/10 p-4">
      <span className="text-3xl motion-safe:animate-pulse" aria-hidden="true">
        🔑
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Skip the password next time</div>
        <div className="text-xs text-muted">Add a passkey and sign in with Face ID, your fingerprint or your device passcode.</div>
        {message?.tone === "bad" && (
          <p role="alert" className="mt-1 text-xs text-rose-300">
            {message.text}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(NUDGE_KEY, "1");
            } catch {
              // Shown again next time; that's fine.
            }
          }}
          className="min-h-9 rounded-lg px-3 text-xs text-muted hover:text-foreground"
        >
          Maybe later
        </button>
        <button
          onClick={add}
          disabled={busy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true">✨</span>} Add passkey
        </button>
      </div>
    </div>
  );
}
