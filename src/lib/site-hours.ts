/**
 * Opening hours as websites write them ("Mo-Fr 09:00-17:00", "Monday – Friday: 9am – 5:30pm",
 * "Sat 10–14", "Sunday: closed") turned into a week, so the website can say "Open now".
 * Days are 0 = Sunday … 6 = Saturday; times are minutes after midnight.
 * Lines it can't read are skipped; with none read, there's no badge (never a wrong one).
 */
export type Week = Record<number, [number, number][]>;

const DAYS: [RegExp, number][] = [
  [/^su(n(day)?)?$|^so(nntag)?$|^dom(ingo)?$|^dim(anche)?$/i, 0],
  [/^mo(n(day)?)?$|^montag$|^lun(es|di)?$/i, 1],
  [/^tu(e(s(day)?)?)?$|^di(enstag)?$|^mar(tes|di)?$/i, 2],
  [/^we(d(nesday)?)?$|^mi(ttwoch)?$|^mi[eé](rcoles)?$|^mer(credi)?$/i, 3],
  [/^th(u(r(s(day)?)?)?)?$|^do(nnerstag)?$|^jue(ves)?$|^jeu(di)?$/i, 4],
  [/^fr(i(day)?)?$|^freitag$|^vie(rnes)?$|^ven(dredi)?$/i, 5],
  [/^sa(t(urday)?)?$|^samstag$|^s[aá]b(ado)?$|^sam(edi)?$/i, 6],
];

function day(word: string): number | null {
  const w = word.replace(/\.$/, "");
  for (const [re, n] of DAYS) if (re.test(w)) return n;
  return null;
}

function time(t: string, hint?: "am" | "pm"): number | null {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = (m[3] ?? hint ?? "").replace(/\./g, "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** All the days a text like "Mo-Fr", "Mon, Wed & Fri" or "Daily" covers. */
function days(text: string): number[] {
  const t = text.trim();
  if (/^(daily|every ?day|mo(n(day)?)?\s*[-–—]\s*su(n(day)?)?|7 days)$/i.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const out: number[] = [];
  for (const part of t.split(/\s*(?:,|&|\band\b|\/)\s*/i)) {
    const range = part.split(/\s*(?:[-–—]|\bto\b|\bthrough\b)\s*/i);
    const a = day(range[0]);
    const b = range[1] != null ? day(range[1]) : a;
    if (a == null || b == null || range.length > 2) return [];
    for (let d = a; ; d = (d + 1) % 7) {
      out.push(d);
      if (d === b) break;
    }
  }
  return out;
}

export function parseHours(lines: string[]): Week | null {
  const week: Week = {};
  let read = 0;
  for (const raw of lines.slice(0, 20)) {
    const line = raw.replace(/\s+/g, " ").trim();
    // "Mo-Fr 09:00-17:00" or "Monday – Friday: 9am – 5pm" or "Sunday: Closed"
    const m = /^([A-Za-zÀ-ÿ.,&/ \-–—]+?)\s*:?\s+((?:closed|geschlossen|cerrado|fermé|chiuso)|(?:\d[\d:.h]*\s*(?:[ap]\.?m\.?)?\s*(?:[-–—]|to)\s*\d[\d:.h]*\s*(?:[ap]\.?m\.?)?)(?:\s*(?:,|&|and)\s*\d[\d:.h]*\s*(?:[ap]\.?m\.?)?\s*(?:[-–—]|to)\s*\d[\d:.h]*\s*(?:[ap]\.?m\.?)?)*)$/i.exec(line);
    if (!m) continue;
    const ds = days(m[1]);
    if (!ds.length) continue;
    const spans: [number, number][] = [];
    if (!/^(closed|geschlossen|cerrado|fermé|chiuso)$/i.test(m[2])) {
      for (const span of m[2].split(/\s*(?:,|&|\band\b)\s*/i)) {
        const [from, to] = span.split(/\s*(?:[-–—]|\bto\b)\s*/i);
        const toHint = /pm/i.test(to ?? "") ? "pm" : /am/i.test(to ?? "") ? "am" : undefined;
        const end = time(to ?? "");
        // "9–5pm": the opening time takes am when it reads earlier than the closing time.
        let start = time(from, /[ap]\.?m/i.test(from) ? undefined : toHint === "pm" && Number(from.split(/\D/)[0]) <= 12 && Number(from.split(/\D/)[0]) >= 6 && !/[ap]/i.test(from) ? "am" : toHint);
        if (start == null || end == null) {
          spans.length = 0;
          break;
        }
        // "Sat 10–2" (no am/pm, closing hour smaller): the closing hour is in the afternoon.
        let close = end;
        if (close <= start && !/[ap]\.?m/i.test(to ?? "") && close < 12 * 60) close += 12 * 60;
        if (close === 0) close = 24 * 60;
        if (start === close) continue;
        if (start > close) start = Math.min(start, 24 * 60);
        spans.push([start, close]);
      }
      if (!spans.length) continue;
    }
    for (const d of ds) week[d] = spans;
    read++;
  }
  return read ? week : null;
}

/** Whether the business is open at a moment (local time), and when that changes today. */
export function openAt(week: Week, at: Date): { open: boolean; until?: number; opens?: number } {
  const d = at.getDay();
  const now = at.getHours() * 60 + at.getMinutes();
  // Late hours past midnight belong to the day before.
  const before = week[(d + 6) % 7] ?? [];
  for (const [s, e] of before) if (e < s && now < e) return { open: true, until: e };
  for (const [s, e] of week[d] ?? []) {
    if (e < s ? now >= s : now >= s && now < e) return { open: true, until: e };
  }
  const next = (week[d] ?? []).map(([s]) => s).filter((s) => s > now).sort((a, b) => a - b)[0];
  return { open: false, ...(next != null ? { opens: next } : {}) };
}
