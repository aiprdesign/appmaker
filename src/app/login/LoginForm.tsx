"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn, useCloud } from "@/lib/cloud";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-violet-500/60";

export function LoginForm() {
  const cloud = useCloud();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re signed in</h1>
        <p className="mt-2 text-sm text-muted">{cloud.user.email}</p>
        <Link href="/projects" className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
          Go to my apps
        </Link>
      </div>
    );
  }

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
      <div className="mt-6 grid grid-cols-2 rounded-lg border border-line p-1 text-sm" role="tablist" aria-label="Sign in or create account">
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
      </form>
    </div>
  );
}
