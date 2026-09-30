"use client";

import { SLOT_LENGTHS, WEEKDAYS, type BookingSettings } from "@/lib/booking";

const field = "min-h-10 rounded-lg border border-line bg-background px-2 text-sm text-foreground outline-none focus:border-violet-500/60";

/** Opening hours, appointment length and services: all a business needs to set to take bookings. */
export function HoursEditor({ value, onChange }: { value: BookingSettings; onChange: (next: BookingSettings) => void }) {
  const setDay = (i: number, day: BookingSettings["hours"][number]) => onChange({ ...value, hours: value.hours.map((h, j) => (j === i ? day : h)) });
  // Monday first, as most people read a week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Opening hours</legend>
        <div className="space-y-1.5">
          {order.map((i) => {
            const day = value.hours[i];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-10 w-32 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!day}
                    onChange={(e) => setDay(i, e.target.checked ? (value.hours.find(Boolean) ?? { open: "09:00", close: "17:00" }) : null)}
                    className="h-4 w-4 accent-violet-500"
                  />
                  {WEEKDAYS[i]}
                </label>
                {day ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <input
                      type="time"
                      step={900}
                      aria-label={`${WEEKDAYS[i]} opens`}
                      value={day.open}
                      onChange={(e) => e.target.value && setDay(i, { ...day, open: e.target.value })}
                      className={field}
                    />
                    to
                    <input
                      type="time"
                      step={900}
                      aria-label={`${WEEKDAYS[i]} closes`}
                      value={day.close}
                      onChange={(e) => e.target.value && setDay(i, { ...day, close: e.target.value })}
                      className={field}
                    />
                  </span>
                ) : (
                  <span className="text-sm text-muted">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Each appointment</span>
          <select value={value.slotMinutes} onChange={(e) => onChange({ ...value, slotMinutes: Number(e.target.value) })} className={field}>
            {SLOT_LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Customers can book</span>
          <select value={value.daysAhead} onChange={(e) => onChange({ ...value, daysAhead: Number(e.target.value) })} className={field}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                up to {d === 7 ? "1 week" : d === 14 ? "2 weeks" : `${d} days`} ahead
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Services (optional)</span>
        <input
          value={value.services.join(", ")}
          onChange={(e) => onChange({ ...value, services: e.target.value.split(",").map((s) => s.trimStart()) })}
          onBlur={() => onChange({ ...value, services: value.services.map((s) => s.trim()).filter(Boolean) })}
          placeholder="e.g. Haircut, Colour, Beard trim"
          className={field}
        />
        <span className="text-xs text-muted">Separate with commas. Customers pick one when they book.</span>
      </label>
      <p className="text-xs text-muted">Time zone: {value.timezone.replace(/_/g, " ")}</p>
    </div>
  );
}
