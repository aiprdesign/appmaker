"use client";

import { useEffect, useRef, useState } from "react";
import { Apple, ExternalLink, QrCode, Smartphone, TabletSmartphone } from "lucide-react";
import { openInSnack, type SnackPlatform } from "@/lib/snack";
import type { ExpoState, Project } from "@/lib/types";
import { PhonePreview } from "./PhonePreview";

const SNACK_OPTIONS: { platform: SnackPlatform; label: string; detail: string; icon: typeof Apple }[] = [
  { platform: "ios", label: "iPhone emulator", detail: "A real iOS simulator, streamed into your browser", icon: Apple },
  { platform: "android", label: "Android emulator", detail: "A real Android emulator, streamed into your browser", icon: Smartphone },
];

/**
 * Testing on devices: the person's own phone with Expo Go (published by
 * Appmaker, same Expo SDK as the store builds), or Expo Snack's emulators.
 */
export function DeviceMenu({ project, disabled, onExpoChange }: { project: Project; disabled?: boolean; onExpoChange: (expo: ExpoState) => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:border-white/20 disabled:opacity-40"
      >
        <TabletSmartphone className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Test on a device</span>
        <span className="sr-only lg:hidden">Test on a device</span>
      </button>
      {open && (
        <div role="menu" aria-label="Test on a device" className="fixed inset-x-3 top-14 z-40 rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-80 border border-line bg-surface p-2 shadow-xl">
          <button
            role="menuitem"
            onClick={() => {
              setPhone(true);
              setOpen(false);
            }}
            className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/5"
          >
            <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-medium">Your phone (Expo Go)</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">Scan a QR code to run the real app, on the same Expo version as your store builds</span>
            </span>
          </button>
          <p className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[11px] text-muted">
            Quick look in Expo Snack (new tab). Snack may use an older Expo version, so some features can differ.
          </p>
          {SNACK_OPTIONS.map((o) => (
            <button
              key={o.platform}
              role="menuitem"
              onClick={() => {
                const opened = openInSnack(project, o.platform);
                setOpen(false);
                if (!opened) {
                  window.alert(
                    "This app is too big for Expo Snack's emulators (Snack only accepts small apps). Use Your phone (Expo Go) instead: it runs the full app, on the same Expo version as your store builds.",
                  );
                }
              }}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/5"
            >
              <o.icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {o.label} <ExternalLink className="h-3 w-3 text-muted" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{o.detail}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-line px-2 pb-1 pt-2 text-[11px] leading-snug text-muted">
            To install the finished app itself, use a build in the Publish tab: Android builds have a QR code to install.
          </p>
        </div>
      )}
      {phone && <PhonePreview project={project} onExpoChange={onExpoChange} onClose={() => setPhone(false)} />}
    </div>
  );
}
