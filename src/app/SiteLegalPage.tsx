import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LEGAL_FIELDS, type LegalDetails, type LegalSection } from "@/lib/site-legal";

/** Fills {{field}} with the owner's details, or a highlighted [placeholder] until they're set in admin. */
function Filled({ text, details }: { text: string; details: LegalDetails }) {
  const parts = text.split(/\{\{(\w+)\}\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const field = LEGAL_FIELDS.find((f) => f.key === part);
        const value = field ? details[field.key] : "";
        if (value && part === "email") {
          return (
            <a key={i} href={`mailto:${value}`} className="underline underline-offset-2">
              {value}
            </a>
          );
        }
        return (
          value || (
            <mark key={i} className="rounded bg-amber-300/25 px-1 text-amber-100">
              [{field?.placeholder ?? part}]
            </mark>
          )
        );
      })}
    </>
  );
}

const when = (d: string) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";

/** The site's own Terms of service and Privacy policy. */
export function SiteLegalPage({
  title,
  sections,
  details,
  other,
}: {
  title: string;
  sections: LegalSection[];
  details: LegalDetails;
  other: { href: string; label: string };
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <Link href={other.href} className="inline-block py-1 text-sm text-muted hover:text-foreground">
            {other.label}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          Effective {details.effective ? when(details.effective) : <mark className="rounded bg-amber-300/25 px-1 text-amber-100">[date]</mark>} ·{" "}
          <Filled text="{{company}}" details={details} />
        </p>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold">{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="mt-2 leading-relaxed text-foreground/85">
                  <Filled text={p} details={details} />
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/85">
                  {s.bullets.map((b) => (
                    <li key={b.slice(0, 40)}>
                      <Filled text={b} details={details} />
                    </li>
                  ))}
                </ul>
              )}
              {s.after?.map((p) => (
                <p key={p.slice(0, 40)} className="mt-2 leading-relaxed text-foreground/85">
                  <Filled text={p} details={details} />
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
