"use client";

import { useEffect, useRef, useState } from "react";

/** The screen sizes the preview shows, in points: iPhone and Android phones, and a 13" iPad. */
export const DEVICES = {
  ios: { w: 390, h: 844 },
  android: { w: 390, h: 844 },
  ipad: { w: 1032, h: 1376 },
} as const;

export type Device = keyof typeof DEVICES;

/** A device bezel that scales its screen to fit the available space. */
export function PhoneFrame({ platform, children }: { platform: Device; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const { w: W, h: H } = DEVICES[platform];
  const pad = platform === "ipad" ? 22 : 14;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, (height - 16) / (H + pad * 2), (width - 16) / (W + pad * 2)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, pad]);

  const outer = platform === "ios" ? "rounded-[62px]" : platform === "ipad" ? "rounded-[44px]" : "rounded-[40px]";
  const inner = platform === "ios" ? "rounded-[48px]" : platform === "ipad" ? "rounded-[24px]" : "rounded-[28px]";
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: (W + pad * 2) * scale, height: (H + pad * 2) * scale }} className="relative shrink-0">
        <div
          style={{ width: W + pad * 2, height: H + pad * 2, padding: pad, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className={`absolute left-0 top-0 bg-[#1b1b22] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),inset_0_0_0_2px_#2e2e3a] ${outer}`}
        >
          <div className={`relative h-full w-full overflow-hidden bg-white ${inner}`}>
            {children}
            {platform === "ios" ? (
              <div className="pointer-events-none absolute left-1/2 top-[11px] h-[34px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
            ) : platform === "android" ? (
              <div className="pointer-events-none absolute left-1/2 top-[12px] h-[14px] w-[14px] -translate-x-1/2 rounded-full bg-black" />
            ) : null}
            <div className="pointer-events-none absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
