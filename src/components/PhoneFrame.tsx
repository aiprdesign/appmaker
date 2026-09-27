"use client";

import { useEffect, useRef, useState } from "react";

const W = 390;
const H = 844;

/** A device bezel that scales its 390×844 screen to fit the available space. */
export function PhoneFrame({ platform, children }: { platform: "ios" | "android"; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, (height - 16) / (H + 28), (width - 16) / (W + 28)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ios = platform === "ios";
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: (W + 28) * scale, height: (H + 28) * scale }} className="relative shrink-0">
        <div
          style={{ width: W + 28, height: H + 28, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className={`absolute left-0 top-0 bg-[#1b1b22] p-[14px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),inset_0_0_0_2px_#2e2e3a] ${
            ios ? "rounded-[62px]" : "rounded-[40px]"
          }`}
        >
          <div className={`relative h-full w-full overflow-hidden bg-white ${ios ? "rounded-[48px]" : "rounded-[28px]"}`}>
            {children}
            {ios ? (
              <div className="pointer-events-none absolute left-1/2 top-[11px] h-[34px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
            ) : (
              <div className="pointer-events-none absolute left-1/2 top-[12px] h-[14px] w-[14px] -translate-x-1/2 rounded-full bg-black" />
            )}
            <div className="pointer-events-none absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
