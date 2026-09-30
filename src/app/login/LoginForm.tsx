"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { signIn, useCloud } from "@/lib/cloud";
import { PasskeyCancelled, passkeysSupported, signInWithPasskey } from "@/lib/passkeys";
import { celebrate } from "@/components/celebrate";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-violet-500/60";

export function LoginForm() {
  const cloud = useCloud();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const canPasskey = useSyncExternalStore(
    () => () => {},
    () => passkeysSupported(),
    () => false,
  );
  const params = useSearchParams();
  const returned = params.get("error");
  const [error, setError] = useState<string | null>(
    returned === "google-off" ? "Sign in with Google isn't set up on this site." : returned === "too-many" ? "Too many attempts. Wait a few minutes and try again." : returned,
  );

  if (cloud.enabled === false) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts aren&apos;t turned on</h1>
        <p className="mt-2 text-sm text-muted">This site saves apps in your browser. The site owner can turn on accounts by adding a database.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
          Back to building
        </Link>
      </div>
    );
  }
  if (cloud.user) {
    return (
      <div className="text-center" role="status">
        {welcome && (
          <div className="mb-3 text-5xl motion-safe:animate-bounce" aria-hidden="true">
            🎉
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{welcome ? "Welcome back!" : "You're signed in"}</h1>
        <p className="mt-2 text-sm text-muted">{welcome ? `Signed in with your passkey as ${cloud.user.email}` : cloud.user.email}</p>
        <Link href="/projects" className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
          Go to my apps
        </Link>
      </div>
    );
  }

  const passkey = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPasskeyBusy(true);
    setError(null);
    try {
      await signInWithPasskey();
      setWelcome("Welcome back!");
      celebrate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      setTimeout(() => router.push("/projects"), 900);
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(mode, email, password);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-2 text-sm text-muted">Save your apps to your account and open them on any device. Apps you already made in this browser are added.</p>
      {cloud.signups === false && <p className="mt-2 text-xs text-amber-200">New sign-ups are paused. Existing accounts can sign in.</p>}
      <div
        className={`mt-6 grid-cols-2 rounded-lg border border-line p-1 text-sm ${cloud.signups === false ? "hidden" : "grid"}`}
        role="tablist"
        aria-label="Sign in or create account"
      >
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-9 rounded-md ${mode === m ? "bg-surface-2 font-medium" : "text-muted hover:text-foreground"}`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      {canPasskey && cloud.passkeys && mode === "login" && (
        <div className="mt-6">
          <button
            type="button"
            onClick={passkey}
            disabled={passkeyBusy || !!welcome}
            className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
          >
            <span className="text-lg transition group-hover:-rotate-12 group-hover:scale-110 motion-reduce:transition-none" aria-hidden="true">
              {welcome ? "🎉" : "🔑"}
            </span>
            {welcome ? welcome : passkeyBusy ? "Check your device…" : "Sign in with a passkey"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">Face ID, your fingerprint or your device passcode. No password to remember ✨</p>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> {cloud.google ? "or" : "or with email"} <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      {cloud.google && (
        <>
          <a
            href="/api/auth/google/start"
            className={`${canPasskey && cloud.passkeys && mode === "login" ? "" : "mt-6 "}flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white text-sm font-medium text-neutral-800 hover:bg-neutral-100`}
          >
            <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </a>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Email</span>
          <input className={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Password</span>
          <input
            className={input}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && <span className="mt-1 block text-[11px] text-muted">At least 8 characters.</span>}
        </label>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || cloud.enabled === null}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        {mode !== "login" && (
          <p className="text-center text-xs text-muted">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
              Terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
              Privacy policy
            </Link>
            .
          </p>
        )}
      </form>
    </div>
  );
}
