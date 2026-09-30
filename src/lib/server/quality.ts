import { isQualityEvent, type QualityEvent } from "../quality";
import { query } from "./db";

/** Adds one to each event's count for today (and this model). */
export async function recordQuality(events: QualityEvent[], model: string): Promise<void> {
  const unique = [...new Set(events.filter(isQualityEvent))].slice(0, 12);
  if (!unique.length) return;
  await query(
    `insert into app_quality (day, model, event, count)
     select current_date, $1, e, 1 from unnest($2::text[]) e
     on conflict (day, model, event) do update set count = app_quality.count + 1`,
    [model.slice(0, 80), unique],
  );
}

export interface QualityReport {
  days: number;
  /** Counts over the period, and for the last 7 days vs the 7 before (to see if a fix worked). */
  events: { event: string; total: number; last7: number; prev7: number }[];
  models: { model: string; builds: number; clean: number; problems: number }[];
}

export async function qualityReport(days = 30): Promise<QualityReport> {
  await query("delete from app_quality where day < current_date - 400");
  const rows = await query<{ event: string; total: string; last7: string; prev7: string }>(
    `select event,
            sum(count) total,
            sum(count) filter (where day > current_date - 7) last7,
            sum(count) filter (where day <= current_date - 7 and day > current_date - 14) prev7
       from app_quality where day > current_date - $1::int
      group by event order by sum(count) desc`,
    [days],
  );
  const models = await query<{ model: string; builds: string; clean: string; problems: string }>(
    `select model,
            sum(count) filter (where event in ('build:new', 'build:edit')) builds,
            sum(count) filter (where event = 'screen:clean') clean,
            sum(count) filter (where event in ('check:code', 'crash', 'layout', 'contrast', 'text-size', 'overflow', 'touch')) problems
       from app_quality where day > current_date - $1::int
      group by model order by 2 desc nulls last limit 10`,
    [days],
  );
  return {
    days,
    events: rows.map((r) => ({ event: r.event, total: Number(r.total ?? 0), last7: Number(r.last7 ?? 0), prev7: Number(r.prev7 ?? 0) })),
    models: models.map((m) => ({
      model: m.model || "site default",
      builds: Number(m.builds ?? 0),
      clean: Number(m.clean ?? 0),
      problems: Number(m.problems ?? 0),
    })),
  };
}
