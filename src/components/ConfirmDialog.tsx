"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * A proper confirm dialog instead of the browser's prompt(): says what will
 * happen, and for destructive actions can ask the person to type a word to
 * confirm. Escape or the backdrop cancels.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
  typeToConfirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** When set, the button stays disabled until this exact text is typed. */
  typeToConfirm?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement | HTMLButtonElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-t-2xl border border-line bg-background p-5 shadow-2xl sm:rounded-2xl"
      >
        <h2 id="confirm-title" className="flex items-center gap-2 text-lg font-semibold">
          {danger && <AlertTriangle className="h-5 w-5 text-rose-400" />} {title}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm text-muted">
          {body}
        </div>
        {typeToConfirm && (
          <label className="mt-4 block text-xs text-muted">
            Type <span className="font-mono text-foreground">{typeToConfirm}</span> to confirm
            <input
              ref={first as React.RefObject<HTMLInputElement>}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-violet-500/60"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={typeToConfirm ? undefined : (first as React.RefObject<HTMLButtonElement>)}
            onClick={onCancel}
            className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm hover:border-white/20"
          >
            Cancel
          </button>
          <button
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium disabled:opacity-40 ${danger ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-white text-black"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
