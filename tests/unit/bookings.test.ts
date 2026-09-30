import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { DELETE as turnOff, GET as getSetupRoute, POST as setupRoute } from "@/app/api/bookings/route";
import { GET as freeTimesRoute, POST as bookRoute } from "@/app/api/book/[id]/route";
import { GET as ownerGet, POST as ownerPost } from "@/app/api/owner/[id]/route";
import { GET as calendarRoute } from "@/app/api/owner/[id]/calendar/route";
import { BOOKING_FILE, bookingModule, defaultSettings, parseSettings, usesBooking, type BookingSettings } from "@/lib/booking";
import { checkCodeSafety } from "@/lib/code-safety";
import { THEME_FILE, themeModule, defaultDesign } from "@/lib/design";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { availability, bookingLabel, zonedToUtc } from "@/lib/server/bookings";
import { closeDatabase, query } from "@/lib/server/db";
import { clearFeatureCache, setFeature } from "@/lib/server/features";
import { appFacts, privacySections } from "@/lib/store-pages";
import { validateApp } from "@/lib/validate";

const UTC: BookingSettings = { ...defaultSettings("UTC"), noticeMinutes: 0, daysAhead: 7 };
// Monday 5 October 2026, 08:00 UTC.
const MONDAY = Date.UTC(2026, 9, 5, 8, 0);

describe("free times", () => {
  it("offers every slot in opening hours, skipping closed days", () => {
    const days = availability(UTC, MONDAY, new Set(), []);
    // Sunday is closed; Monday–Friday 9–5 in 30-minute slots, Saturday 10–2.
    expect(days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(days[0]).toMatchObject({ weekday: "Today", dayLabel: "5 Oct" });
    expect(days[0].slots).toHaveLength(16);
    expect(days[0].slots[0]).toEqual({ start: "2026-10-05T09:00:00.000Z", label: "9:00 AM" });
    expect(days[0].slots.at(-1)!.label).toBe("4:30 PM");
    expect(days[5].slots).toHaveLength(8);
  });

  it("leaves out booked, blocked and too-soon times", () => {
    const booked = new Set([Date.UTC(2026, 9, 5, 10, 0)]);
    const blocks = [{ start: Date.UTC(2026, 9, 5, 12, 0), end: Date.UTC(2026, 9, 5, 13, 0) }];
    const noon = Date.UTC(2026, 9, 5, 9, 40);
    const today = availability({ ...UTC, noticeMinutes: 30 }, noon, booked, blocks)[0].slots.map((s) => s.label);
    expect(today[0]).toBe("10:30 AM");
    expect(today).not.toContain("10:00 AM");
    expect(today).not.toContain("12:00 PM");
    expect(today).not.toContain("12:30 PM");
    expect(today).toContain("1:00 PM");
  });

  it("uses the business's time zone, including daylight saving changes", () => {
    const ny = { ...UTC, timezone: "America/New_York", clock: "12h" as const };
    // 9:00 AM in New York in October (EDT) is 13:00 UTC.
    expect(availability(ny, MONDAY, new Set(), [])[0].slots[0]).toEqual({ start: "2026-10-05T13:00:00.000Z", label: "9:00 AM" });
    expect(zonedToUtc(2026, 1, 15, 9, 0, "America/New_York")).toBe(Date.UTC(2026, 0, 15, 14, 0));
    // London springs forward at 01:00 on 29 March 2026: 01:30 doesn't exist that day.
    expect(zonedToUtc(2026, 3, 29, 1, 30, "Europe/London")).toBeNull();
    const london = { ...UTC, timezone: "Europe/London", slotMinutes: 30, hours: Array(7).fill({ open: "00:00", close: "03:00" }) };
    const sunday = availability(london, Date.UTC(2026, 2, 28, 12, 0), new Set(), []).find((d) => d.date === "2026-03-29")!;
    expect(sunday.slots.map((s) => s.label)).toEqual(["12:00 AM", "12:30 AM", "2:00 AM", "2:30 AM"]);
    expect(bookingLabel(Date.UTC(2026, 9, 5, 13, 0), { ...ny, clock: "24h" })).toBe("Mon 5 Oct, 09:00");
  });

  it("checks the owner's settings", () => {
    expect(() => parseSettings({ ...UTC, timezone: "Mars/Olympus" })).toThrow(/time zone/);
    expect(() => parseSettings({ ...UTC, slotMinutes: 7 })).toThrow(/appointment length/);
    expect(() => parseSettings({ ...UTC, hours: Array(7).fill(null) })).toThrow(/at least one day/);
    expect(() => parseSettings({ ...UTC, hours: [null, { open: "17:00", close: "09:00" }, null, null, null, null, null] })).toThrow(/Monday/);
    const s = parseSettings({ ...UTC, services: [" Haircut ", "Haircut", "", "<b>Colour</b>"], daysAhead: 900 });
    expect(s.services).toEqual(["Haircut", "b Colour /b"]);
    expect(s.daysAhead).toBe(90);
  });
});

describe("the app's booking screen", () => {
  it("passes the app checks, with bookings on or off", () => {
    for (const api of [null, "https://appmaker.example/api/book/abc123def"]) {
      const files = {
        "App.js": "import BookingScreen from './src/booking';\nexport default function App() { return <BookingScreen phone=\"+1 555 0100\" />; }\n",
        [BOOKING_FILE]: bookingModule(api),
        [THEME_FILE]: themeModule(defaultDesign()),
      };
      expect(checkCodeSafety(files)).toEqual([]);
      expect(validateApp(files)).toEqual([]);
      expect(usesBooking(files)).toBe(true);
    }
    expect(usesBooking({ [BOOKING_FILE]: bookingModule(null) })).toBe(false);
  });

  it("tells the AI to use it, and the privacy policy mentions bookings", () => {
    expect(SYSTEM_PROMPT).toContain("import BookingScreen from './src/booking'");
    expect(SYSTEM_PROMPT).toContain("Never write, change or delete `src/booking.js`");
    const facts = appFacts({ [BOOKING_FILE]: bookingModule("https://appmaker.example/api/book/abc123def") });
    expect(facts.bookings).toBe(true);
    expect(appFacts({ [BOOKING_FILE]: bookingModule(null) }).bookings).toBe(false);
    const content = { appName: "Cuts", developer: "Cuts Ltd", email: "a@b.co", description: "", updated: "2026-10-01", facts };
    expect(privacySections(content)[1].paragraphs[0]).toMatch(/your name, phone number, the time you chose.*Cuts Ltd.*deleted automatically one year/);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3000";
let ip = 1;
const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": `10.77.0.${ip}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!DB)("bookings (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await setFeature("bookings", false);
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });
  beforeEach(async () => {
    ip += 1;
    clearFeatureCache();
    await query("delete from app_users where email like '%@bookings.example.com'");
  });

  async function account(name: string) {
    const res = await signup(req("/api/auth/signup", "POST", { email: `${name}@bookings.example.com`, password: "correct horse" }));
    return res.headers.get("set-cookie")!.split(";")[0];
  }
  const every = (s: BookingSettings): BookingSettings => ({ ...s, hours: Array(7).fill({ open: "00:00", close: "23:30" }), noticeMinutes: 0, daysAhead: 3 });

  it("stays off until the site owner turns it on in admin", async () => {
    await setFeature("bookings", false);
    const cookie = await account("off");
    const res = await setupRoute(req("/api/bookings", "POST", { projectId: "proj123abc", settings: defaultSettings("UTC") }, { cookie }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Bookings are turned off/);
  });

  it("books a free time once, and the owner manages it with the owner link", async () => {
    await setFeature("bookings", true);
    const cookie = await account("salon");
    expect((await setupRoute(req("/api/bookings", "POST", { projectId: "proj123abc", settings: every(defaultSettings("UTC")) }))).status).toBe(401);
    const created = await setupRoute(
      req(
        "/api/bookings",
        "POST",
        { projectId: "proj123abc", name: "Cuts", settings: { ...every(defaultSettings("UTC")), services: ["Haircut"] } },
        { cookie },
      ),
    );
    expect(created.status).toBe(200);
    const { setup } = await created.json();
    expect(setup.apiUrl).toBe(`http://localhost:3000/api/book/${setup.id}`);
    expect(setup.ownerUrl).toMatch(new RegExp(`^http://localhost:3000/owner/${setup.id}#k=[A-Za-z0-9_-]{32}$`));
    const key = setup.ownerUrl.split("#k=")[1];
    expect((await (await getSetupRoute(req(`/api/bookings?projectId=proj123abc`, "GET", undefined, { cookie }))).json()).setup.id).toBe(setup.id);

    // Customers (the app, from anywhere) see free times.
    const times = await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id));
    expect(times.headers.get("access-control-allow-origin")).toBe("*");
    const { days, services, name } = await times.json();
    expect(name).toBe("Cuts");
    expect(services).toEqual(["Haircut"]);
    const slot = days[0].slots[days[0].slots.length - 1];

    const book = (body: Record<string, unknown>) => bookRoute(req(`/api/book/${setup.id}`, "POST", body), ctx(setup.id));
    expect((await book({ start: slot.start, name: "Ana", phone: "+1 555 0100" })).status).toBe(400); // no service
    expect((await book({ start: slot.start, name: "Ana", phone: "12", service: "Haircut" })).status).toBe(400);
    expect((await book({ start: "2020-01-01T09:00:00Z", name: "Ana", phone: "+1 555 0100", service: "Haircut" })).status).toBe(409);
    const ok = await book({ start: slot.start, name: "Ana", phone: "+1 555 0100", service: "Haircut", note: "Short please" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).label).toContain(slot.label);
    // The same time can't be booked twice, even at once.
    const again = await Promise.all([1, 2].map(() => book({ start: slot.start, name: "Ben", phone: "+1 555 0101", service: "Haircut" })));
    expect(again.map((r) => r.status)).toEqual([409, 409]);
    const after = await (await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).json();
    expect(after.days[0].slots.map((s: { start: string }) => s.start)).not.toContain(slot.start);

    // The owner page: the owner link or the account that made the app, nobody else.
    expect((await ownerGet(req(`/api/owner/${setup.id}`, "GET"), ctx(setup.id))).status).toBe(404);
    expect((await ownerGet(req(`/api/owner/${setup.id}`, "GET", undefined, { "x-owner-key": "wrong" }), ctx(setup.id))).status).toBe(404);
    const other = await account("other");
    expect((await ownerGet(req(`/api/owner/${setup.id}`, "GET", undefined, { cookie: other }), ctx(setup.id))).status).toBe(404);
    const view = await (await ownerGet(req(`/api/owner/${setup.id}`, "GET", undefined, { "x-owner-key": key }), ctx(setup.id))).json();
    expect(view.bookings).toEqual([expect.objectContaining({ name: "Ana", phone: "+1 555 0100", service: "Haircut", note: "Short please", isNew: true })]);
    expect(view.ownerUrl).toBeUndefined();
    expect((await (await ownerGet(req(`/api/owner/${setup.id}`, "GET", undefined, { cookie }), ctx(setup.id))).json()).ownerUrl).toBe(setup.ownerUrl);

    // The calendar feed needs the key.
    expect((await calendarRoute(req(`/api/owner/${setup.id}/calendar`, "GET"), ctx(setup.id))).status).toBe(404);
    const ics = await (await calendarRoute(req(`/api/owner/${setup.id}/calendar?k=${key}`, "GET"), ctx(setup.id))).text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Ana – Haircut");
    expect(ics).toContain("Phone: +1 555 0100\\nNote: Short please");

    // Cancel frees the time; blocking a day hides it.
    const owner = (body: Record<string, unknown>) => ownerPost(req(`/api/owner/${setup.id}`, "POST", body, { "x-owner-key": key }), ctx(setup.id));
    const cancelled = await owner({ action: "cancel", id: view.bookings[0].id });
    expect((await cancelled.json()).bookings).toEqual([]);
    const reopened = await (await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).json();
    expect(reopened.days[0].slots.map((s: { start: string }) => s.start)).toContain(slot.start);
    const blocked = await (await owner({ action: "block", date: days[1].date })).json();
    expect(blocked.blocks[0].label).toMatch(/all day/);
    const hidden = await (await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).json();
    expect(hidden.days.map((d: { date: string }) => d.date)).not.toContain(days[1].date);
    await owner({ action: "unblock", id: blocked.blocks[0].id });

    // New hours apply straight away; only the account can make a new owner link.
    expect((await owner({ action: "settings", settings: { ...every(defaultSettings("UTC")), slotMinutes: 60 } })).status).toBe(200);
    const hourly = await (await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).json();
    expect(hourly.days[1].slots.length).toBe(23);
    expect((await owner({ action: "reset-link" })).status).toBe(403);
    const reset = await ownerPost(req(`/api/owner/${setup.id}`, "POST", { action: "reset-link" }, { cookie }), ctx(setup.id));
    expect((await reset.json()).ownerUrl).not.toBe(setup.ownerUrl);
    expect((await ownerGet(req(`/api/owner/${setup.id}`, "GET", undefined, { "x-owner-key": key }), ctx(setup.id))).status).toBe(404);

    // Turning off deletes everything; the app's calls then find nothing.
    expect((await turnOff(req(`/api/bookings?projectId=proj123abc`, "DELETE", undefined, { cookie }))).status).toBe(200);
    expect((await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).status).toBe(404);
  });

  it("limits bookings from one device", async () => {
    await setFeature("bookings", true);
    const cookie = await account("limits");
    const { setup } = await (
      await setupRoute(req("/api/bookings", "POST", { projectId: "proj456abc", settings: every(defaultSettings("UTC")) }, { cookie }))
    ).json();
    const { days } = await (await freeTimesRoute(req(`/api/book/${setup.id}`, "GET"), ctx(setup.id))).json();
    const statuses = [];
    for (const s of days[1].slots.slice(0, 9)) {
      statuses.push((await bookRoute(req(`/api/book/${setup.id}`, "POST", { start: s.start, name: "Spam", phone: "+1 555 0199" }), ctx(setup.id))).status);
    }
    expect(statuses.slice(0, 8).every((s) => s === 200)).toBe(true);
    expect(statuses[8]).toBe(429);
  });
});
