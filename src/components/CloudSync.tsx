"use client";

import { useEffect } from "react";
import { startCloud } from "@/lib/cloud";

/** Starts account sync once per page load. Renders nothing. */
export function CloudSync() {
  useEffect(() => startCloud(), []);
  return null;
}
