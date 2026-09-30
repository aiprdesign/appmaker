"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/** After deleting an account: say it's done, once. */
export function AccountDeletedNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("account") !== "deleted") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  if (!show) return null;
  return (
    <p role="status" className="mx-auto mt-4 flex max-w-2xl items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
      <CheckCircle2 className="h-4 w-4 shrink-0" /> Your account and everything in it has been deleted.
    </p>
  );
}
