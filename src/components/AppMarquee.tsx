import { BUSINESS_TEMPLATES, TEMPLATES, templateImage } from "@/lib/templates";
import { PhoneShot } from "./TemplateCard";

/**
 * A slowly moving strip of every template's app. The list is drawn twice so
 * the loop is seamless; the copy is hidden from screen readers. With reduced
 * motion it stays still and can be scrolled sideways.
 */
export function AppMarquee() {
  const all = [...BUSINESS_TEMPLATES, ...TEMPLATES];
  const row = (copy: boolean) =>
    all.map((t) => (
      <div key={`${copy}-${t.title}`} className="px-3" aria-hidden={copy || undefined}>
        <PhoneShot src={templateImage(t)} alt={copy ? "" : `${t.title} app`} width={150} className="w-[150px]" />
        <p className="mt-3 text-center text-xs text-muted">{t.title}</p>
      </div>
    ));
  return (
    <section aria-labelledby="marquee-title" className="relative py-16">
      <h2 id="marquee-title" className="px-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
        Apps you can make <span className="text-gradient">today</span>
      </h2>
      <p className="mt-3 px-4 text-center text-muted">Restaurants, salons, gyms, shops, trackers and more. Hover to pause.</p>
      <div className="marquee-mask mt-10 overflow-x-auto overflow-y-hidden pb-2 motion-safe:overflow-x-hidden">
        <div className="marquee-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}
