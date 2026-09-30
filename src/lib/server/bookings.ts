import { randomBytes, timingSafeEqual } from "node:crypto";
import { BookingInputError, parseSettings, toMinutes, type BookingSettings } from "../booking";
import { currentUser } from "./auth";
import { query } from "./db";

/**
 * Simple booking. Free times are worked out from the owner's opening hours,
 * the bookings already made and any blocked time; the database refuses a
 * second booking for the same time, so two customers can never get one slot.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BookingSetup {
  id: string;
  userId: string;
  projectId: string;
  ownerKey: string;
  name: string;
  settings: BookingSettings;
}

interface SetupRow {
  id: string;
  user_id: string;
  project_id: string;
  owner_key: string;
  name: string;
  settings: BookingSettings;
}

const toSetup = (r: SetupRow): BookingSetup => ({ id: r.id, userId: r.user_id, projectId: r.project_id, ownerKey: r.owner_key, name: r.name, settings: r.settings });

// ---------- time in the business's time zone ----------

const formatters = new Map<string, Intl.DateTimeFormat>();
function zoneParts(ms: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
}

/** The UTC time of a wall-clock time in a time zone, or null when that time doesn't exist (a DST gap). */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): number | null {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offset = (ms: number) => {
    const p = zoneParts(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
  };
  let t = guess - offset(guess);
  const second = offset(t);
  if (guess - second !== t) t = guess - second;
  const back = zoneParts(t, tz);
  return back.h === h && back.mi === mi && back.d === d ? t : null;
}

export const timeLabel = (h: number, mi: number, clock: "12h" | "24h") =>
  clock === "24h" ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

/** "Tue 1 Oct, 3:00 PM" in the business's time zone. */
export function bookingLabel(ms: number, s: BookingSettings): string {
  const p = zoneParts(ms, s.timezone);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${SHORT_DAYS[weekday]} ${p.d} ${MONTHS[p.m - 1]}, ${timeLabel(p.h, p.mi, s.clock)}`;
}

export interface DaySlots {
  date: string;
  weekday: string;
  dayLabel: string;
  slots: { start: string; label: string }[];
}

/** Free times for the coming days. */
export function availability(s: BookingSettings, now: number, booked: Set<number>, blocks: { start: number; end: number }[]): DaySlots[] {
  const today = zoneParts(now, s.timezone);
  const earliest = now + s.noticeMinutes * 60000;
  const days: DaySlots[] = [];
  for (let i = 0; i < s.daysAhead; i++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const [y, m, d, wd] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCDay()];
    const hours = s.hours[wd];
    if (!hours) continue;
    const slots: DaySlots["slots"] = [];
    for (let t = toMinutes(hours.open); t + s.slotMinutes <= toMinutes(hours.close); t += s.slotMinutes) {
      const h = Math.floor(t / 60);
      const mi = t % 60;
      const start = zonedToUtc(y, m, d, h, mi, s.timezone);
      if (start == null || start < earliest || booked.has(start)) continue;
      const end = start + s.slotMinutes * 60000;
      if (blocks.some((b) => b.start < end && b.end > start)) continue;
      slots.push({ start: new Date(start).toISOString(), label: timeLabel(h, mi, s.clock) });
    }
    if (slots.length)
      days.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        weekday: i === 0 ? "Today" : i === 1 ? "Tmrw" : SHORT_DAYS[wd],
        dayLabel: `${d} ${MONTHS[m - 1]}`,
        slots,
      });
  }
  return days;
}

// ---------- setups ----------

export async function getSetup(id: string): Promise<BookingSetup | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const rows = await query<SetupRow>("select * from app_booking_setups where id = $1", [id]);
  return rows[0] ? toSetup(rows[0]) : null;
}

export async function setupFor(userId: string, projectId: string): Promise<BookingSetup | null> {
  const rows = await query<SetupRow>("select * from app_booking_setups where user_id = $1 and project_id = $2", [userId, projectId]);
  return rows[0] ? toSetup(rows[0]) : null;
}

/** Turns on bookings for an app, or saves new opening hours. */
export async function saveSetup(userId: string, projectId: string, name: string, settings: BookingSettings): Promise<BookingSetup> {
  const rows = await query<SetupRow>(
    `insert into app_booking_setups (id, user_id, project_id, owner_key, name, settings) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, project_id) do update set name = excluded.name, settings = excluded.settings
     returning *`,
    [randomBytes(9).toString("base64url"), userId, projectId, randomBytes(24).toString("base64url"), name.slice(0, 80), JSON.stringify(settings)],
  );
  return toSetup(rows[0]);
}

export async function updateSettings(id: string, settings: BookingSettings): Promise<void> {
  await query("update app_booking_setups set settings = $2 where id = $1", [id, JSON.stringify(settings)]);
}

export async function resetOwnerKey(id: string): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await query("update app_booking_setups set owner_key = $2 where id = $1", [id, key]);
  return key;
}

export async function deleteSetup(userId: string, projectId: string): Promise<boolean> {
  const rows = await query<{ id: string }>("delete from app_booking_setups where user_id = $1 and project_id = $2 returning id", [userId, projectId]);
  return rows.length > 0;
}

/** The account that made the app, or anyone with the owner link. */
export async function canManage(req: Request, setup: BookingSetup): Promise<boolean> {
  const key = req.headers.get("x-owner-key") ?? new URL(req.url).searchParams.get("k") ?? "";
  if (key) {
    const a = Buffer.from(key);
    const b = Buffer.from(setup.ownerKey);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const user = await currentUser(req);
  return user?.id === setup.userId;
}

// ---------- bookings ----------

async function busy(setup: BookingSetup, now: number) {
  const until = new Date(now + (setup.settings.daysAhead + 2) * DAY_MS).toISOString();
  const [booked, blocks] = await Promise.all([
    query<{ starts_at: Date }>("select starts_at from app_bookings where setup_id = $1 and status = 'booked' and starts_at >= $2 and starts_at < $3", [
      setup.id,
      new Date(now - DAY_MS).toISOString(),
      until,
    ]),
    query<{ starts_at: Date; ends_at: Date }>("select starts_at, ends_at from app_booking_blocks where setup_id = $1 and ends_at > $2 and starts_at < $3", [
      setup.id,
      new Date(now).toISOString(),
      until,
    ]),
  ]);
  return {
    booked: new Set(booked.map((b) => new Date(b.starts_at).getTime())),
    blocks: blocks.map((b) => ({ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() })),
  };
}

export async function freeTimes(setup: BookingSetup, now = Date.now()) {
  const { booked, blocks } = await busy(setup, now);
  return { name: setup.name, services: setup.settings.services, days: availability(setup.settings, now, booked, blocks) };
}

export class BookingConflict extends Error {}

const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

export async function createBooking(setup: BookingSetup, input: Record<string, unknown>, now = Date.now()) {
  const name = clean(input.name, 80);
  const phone = clean(input.phone, 30);
  const service = clean(input.service, 60);
  const note = clean(input.note, 300);
  if (!name) throw new BookingInputError("Add your name.");
  if (phone.replace(/\D/g, "").length < 6 || !/^[+\d\s().-]+$/.test(phone)) throw new BookingInputError("Add a phone number the business can reach you on.");
  if (setup.settings.services.length && !setup.settings.services.includes(service)) throw new BookingInputError("Choose a service.");
  const start = Date.parse(String(input.start ?? ""));
  if (!Number.isFinite(start)) throw new BookingInputError("Choose a time.");
  const { booked, blocks } = await busy(setup, now);
  const free = availability(setup.settings, now, booked, blocks).some((d) => d.slots.some((s) => Date.parse(s.start) === start));
  if (!free) throw new BookingConflict("Sorry, that time was just taken. Please choose another.");
  const id = randomBytes(9).toString("base64url");
  try {
    await query(
      "insert into app_bookings (id, setup_id, starts_at, ends_at, name, phone, service, note) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, setup.id, new Date(start).toISOString(), new Date(start + setup.settings.slotMinutes * 60000).toISOString(), name, phone, service, note],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new BookingConflict("Sorry, that time was just taken. Please choose another.");
    throw e;
  }
  return { id, start: new Date(start).toISOString(), label: bookingLabel(start, setup.settings) };
}

export interface OwnerBooking {
  id: string;
  start: string;
  end: string;
  label: string;
  name: string;
  phone: string;
  service: string;
  note: string;
  createdAt: string;
  /** Booked in the last 24 hours. */
  isNew: boolean;
}

/** Upcoming bookings and blocked time for the owner page. Old bookings are deleted after a year. */
export async function ownerView(setup: BookingSetup, now = Date.now()) {
  await query("delete from app_bookings where setup_id = $1 and starts_at < now() - interval '365 days'", [setup.id]);
  await query("delete from app_booking_blocks where setup_id = $1 and ends_at < now() - interval '30 days'", [setup.id]);
  const from = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const [bookings, blocks] = await Promise.all([
    query<{ id: string; starts_at: Date; ends_at: Date; name: string; phone: string; service: string; note: string; created_at: Date }>(
      "select id, starts_at, ends_at, name, phone, service, note, created_at from app_bookings where setup_id = $1 and status = 'booked' and starts_at >= $2 order by starts_at limit 500",
      [setup.id, from],
    ),
    query<{ id: string; starts_at: Date; ends_at: Date; note: string }>(
      "select id, starts_at, ends_at, note from app_booking_blocks where setup_id = $1 and ends_at > now() order by starts_at limit 200",
      [setup.id],
    ),
  ]);
  return {
    name: setup.name,
    settings: setup.settings,
    bookings: bookings.map(
      (b): OwnerBooking => ({
        id: b.id,
        start: new Date(b.starts_at).toISOString(),
        end: new Date(b.ends_at).toISOString(),
        label: bookingLabel(new Date(b.starts_at).getTime(), setup.settings),
        name: b.name,
        phone: b.phone,
        service: b.service,
        note: b.note,
        createdAt: new Date(b.created_at).toISOString(),
        isNew: now - new Date(b.created_at).getTime() < DAY_MS,
      }),
    ),
    blocks: blocks.map((b) => ({
      id: b.id,
      start: new Date(b.starts_at).toISOString(),
      end: new Date(b.ends_at).toISOString(),
      label: blockLabel(new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime(), setup.settings),
      note: b.note,
    })),
  };
}

function blockLabel(start: number, end: number, s: BookingSettings): string {
  const a = zoneParts(start, s.timezone);
  const b = zoneParts(end, s.timezone);
  const day = (p: typeof a) => `${SHORT_DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]} ${p.d} ${MONTHS[p.m - 1]}`;
  if (a.h === 0 && a.mi === 0 && b.h === 0 && b.mi === 0) {
    const last = zoneParts(end - 1, s.timezone);
    return last.d === a.d && last.m === a.m ? `${day(a)}, all day` : `${day(a)} – ${day(last)}, all day`;
  }
  return `${day(a)}, ${timeLabel(a.h, a.mi, s.clock)} – ${timeLabel(b.h, b.mi, s.clock)}`;
}

export async function cancelBooking(setupId: string, bookingId: string): Promise<boolean> {
  const rows = await query<{ id: string }>("update app_bookings set status = 'cancelled' where id = $1 and setup_id = $2 and status = 'booked' returning id", [
    bookingId,
    setupId,
  ]);
  return rows.length > 0;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Blocks a whole day (or several), or part of a day, so it isn't offered to customers. */
export async function addBlock(setup: BookingSetup, input: Record<string, unknown>): Promise<void> {
  const from = DATE.exec(String(input.date ?? ""));
  if (!from) throw new BookingInputError("Choose a date.");
  const to = DATE.exec(String(input.until ?? input.date));
  if (!to) throw new BookingInputError("Choose an end date.");
  const tz = setup.settings.timezone;
  const [fy, fm, fd] = [Number(from[1]), Number(from[2]), Number(from[3])];
  const [ty, tm, td] = [Number(to[1]), Number(to[2]), Number(to[3])];
  let start: number | null;
  let end: number | null;
  const partDay = typeof input.from === "string" && TIME.test(input.from) && typeof input.to === "string" && TIME.test(input.to);
  if (partDay) {
    const [a, b] = [input.from as string, input.to as string];
    start = zonedToUtc(fy, fm, fd, Number(a.slice(0, 2)), Number(a.slice(3)), tz);
    end = zonedToUtc(fy, fm, fd, Number(b.slice(0, 2)), Number(b.slice(3)), tz);
  } else {
    start = zonedToUtc(fy, fm, fd, 0, 0, tz);
    const next = new Date(Date.UTC(ty, tm - 1, td + 1));
    end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
  }
  if (start == null || end == null || end <= start) throw new BookingInputError("The end must be after the start.");
  if (end - start > 92 * DAY_MS) throw new BookingInputError("Block at most three months at a time.");
  await query("insert into app_booking_blocks (id, setup_id, starts_at, ends_at, note) values ($1, $2, $3, $4, $5)", [
    randomBytes(9).toString("base64url"),
    setup.id,
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    clean(input.note, 80),
  ]);
}

export async function removeBlock(setupId: string, blockId: string): Promise<boolean> {
  const rows = await query<{ id: string }>("delete from app_booking_blocks where id = $1 and setup_id = $2 returning id", [blockId, setupId]);
  return rows.length > 0;
}

// ---------- calendar feed ----------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** An iCalendar feed of upcoming bookings, for the owner's phone calendar. */
export async function calendarFeed(setup: BookingSetup, now = Date.now()): Promise<string> {
  const rows = await query<{ id: string; starts_at: Date; ends_at: Date; name: string; phone: string; service: string; note: string }>(
    "select id, starts_at, ends_at, name, phone, service, note from app_bookings where setup_id = $1 and status = 'booked' and starts_at >= $2 order by starts_at limit 1000",
    [setup.id, new Date(now - 7 * DAY_MS).toISOString()],
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appmaker//Bookings//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(`${setup.name || "App"} bookings`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const b of rows) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@appmaker-bookings`,
      `DTSTAMP:${icsTime(now)}`,
      `DTSTART:${icsTime(new Date(b.starts_at).getTime())}`,
      `DTEND:${icsTime(new Date(b.ends_at).getTime())}`,
      `SUMMARY:${icsText(`${b.name}${b.service ? ` – ${b.service}` : ""}`)}`,
      `DESCRIPTION:${icsText([`Phone: ${b.phone}`, b.note && `Note: ${b.note}`].filter(Boolean).join("\n"))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export { parseSettings };
