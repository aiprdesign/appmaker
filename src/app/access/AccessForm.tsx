"use client";

import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";

export function AccessForm({ next, kind = "pin" }: { next: string; kind?: "password" | "pin" }) {
  const word = kind === "password" ? "password" : "PIN";
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin, next }),
        }).catch(() => null);
        const data = await res?.json().catch(() => ({}));
        if (res?.ok) return window.location.assign(new URL(data.next || "/", window.location.origin).href);
        setBusy(false);
        setPin("");
        setLocked(!!data?.locked);
        setError(data?.error || `Couldn't check the ${word}. Check your connection and try again.`);
      }}
    >
      <LockKeyhole className="h-8 w-8 text-violet-400" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Enter the {word}</h1>
      <p className="mt-2 text-sm text-muted">This site is private for now. Enter the {word} you were given to continue.</p>
      <label className="mt-6 block">
        <span className="mb-1.5 block text-xs font-medium">{kind === "password" ? "Password" : "PIN"}</span>
        <input
          className={`w-full rounded-lg border border-line bg-surface px-3 py-2.5 outline-none focus:border-violet-500/60 ${kind === "pin" ? "text-center font-mono text-lg tracking-[0.4em]" : "text-base"}`}
          type="password"
          inputMode={kind === "pin" ? "numeric" : "text"}
          autoComplete={kind === "pin" ? "one-time-code" : "current-password"}
          required
          autoFocus
          maxLength={128}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={locked}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || locked || !pin}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue
      </button>
    </form>
  );
}
