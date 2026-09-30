"use client";

import { useEffect, useState } from "react";
import type { Plan } from "./credits";

export interface PlanInfo {
  /** Payments are on, so paid features are locked for free accounts. */
  enabled: boolean;
  plan: Plan;
  balance?: number;
}

const DEFAULT: PlanInfo = { enabled: false, plan: "guest" };
let loading: Promise<PlanInfo> | null = null;

/** Tells every open plan hook to fetch again, e.g. after signing in or buying credits. */
export const PLAN_CHANGED = "appmaker:plan";

function load(): Promise<PlanInfo> {
  loading ??= fetch("/api/credits", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : DEFAULT))
    .then((d) => ({ enabled: !!d.enabled, plan: d.plan ?? "guest", balance: d.balance }))
    .catch(() => DEFAULT);
  return loading;
}

/** The visitor's plan (guest, free or paid), and whether payments are on. Null until known. */
export function usePlan(): PlanInfo | null {
  const [info, setInfo] = useState<PlanInfo | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      loading = null;
      load().then((i) => live && setInfo(i));
    };
    load().then((i) => live && setInfo(i));
    window.addEventListener(PLAN_CHANGED, refresh);
    return () => {
      live = false;
      window.removeEventListener(PLAN_CHANGED, refresh);
    };
  }, []);
  return info;
}

/** Whether a feature on the paid plan is locked for this visitor. */
export const locked = (info: PlanInfo | null) => !!info?.enabled && info.plan !== "paid";
