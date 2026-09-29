"use client";

import { useEffect, useState } from "react";
import { defaultFeatures, type Features } from "./features";

let loading: Promise<Features> | null = null;

/** The site's feature switches (from /admin). Defaults until the server answers. */
export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(defaultFeatures);
  useEffect(() => {
    loading ??= fetch("/api/features")
      .then((r) => (r.ok ? r.json() : defaultFeatures()))
      .catch(() => defaultFeatures());
    let live = true;
    loading.then((f) => live && setFeatures(f));
    return () => {
      live = false;
    };
  }, []);
  return features;
}
