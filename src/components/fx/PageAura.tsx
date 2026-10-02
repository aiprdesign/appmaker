import { Orb } from "./Orb";

/** The home page's atmosphere for inner pages: a soft glow, a fading grid and an orb. Decorative. */
export function PageAura() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
      <div className="glow absolute inset-0 opacity-70" />
      <div className="grid-bg absolute inset-0" />
      <Orb size={420} soft className="absolute -top-40 left-1/2 -translate-x-1/2" />
    </div>
  );
}
