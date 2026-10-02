/**
 * Light beams travelling along the hero's 48px grid lines. Decorative only:
 * hidden from screen readers and still with reduced motion.
 */
const BEAMS = [
  { dir: "x", top: 96, left: 0, delay: 0, duration: 7 },
  { dir: "x", top: 288, left: 0, delay: 2.4, duration: 9 },
  { dir: "x", top: 480, left: 0, delay: 4.8, duration: 8 },
  { dir: "y", top: 0, left: 4 * 48, delay: 1.2, duration: 8 },
  { dir: "y", top: 0, left: 13 * 48, delay: 6, duration: 10 },
  { dir: "y", top: 0, left: 22 * 48, delay: 3.6, duration: 7 },
  { dir: "y", top: 0, left: 31 * 48, delay: 5, duration: 9 },
] as const;

export function Beams({ className = "" }: { className?: string }) {
  return (
    <div className={`beam-field pointer-events-none overflow-hidden ${className}`} aria-hidden="true">
      {BEAMS.map((b, i) => (
        <span
          key={i}
          className={`beam ${b.dir === "x" ? "beam-x" : "beam-y"}`}
          style={
            {
              top: b.top,
              left: b.left,
              "--beam-delay": `${b.delay}s`,
              "--beam-duration": `${b.duration}s`,
              "--beam-travel": b.dir === "x" ? "110vw" : "760px",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
