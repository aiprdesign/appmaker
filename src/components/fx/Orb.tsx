/** A glowing orb that slowly turns and changes shape (still with reduced motion). Decorative. */
export function Orb({ size, soft = false, fast = false, className = "" }: { size: number | string; soft?: boolean; fast?: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`orb ${/\babsolute\b/.test(className) ? "" : "relative"} ${soft ? "orb-soft" : ""} ${fast ? "orb-fast" : ""} ${className}`}
      style={{ width: size }}
    />
  );
}
