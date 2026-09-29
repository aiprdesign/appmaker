"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code for a link, drawn as SVG (dark on white so every phone camera reads it). */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      data-qr-value={value}
      className="shrink-0 overflow-hidden rounded-lg bg-white p-1.5"
      style={{ width: size, height: size }}
      // The SVG is generated locally by the qrcode library from the link.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
