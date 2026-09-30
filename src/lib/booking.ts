/**
 * Simple booking: customers pick a free time in the app and are booked
 * straight away; the business sees bookings on its owner page (and, if it
 * likes, in its phone calendar). Opening hours live on the server, so the
 * owner can change them without a new build.
 */

export const BOOKING_FILE = "src/booking.js";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const SLOT_LENGTHS = [15, 20, 30, 45, 60, 90, 120] as const;

export interface DayHours {
  open: string;
  close: string;
}

export interface BookingSettings {
  /** IANA time zone of the business, e.g. "Europe/London". */
  timezone: string;
  /** Length of every appointment, in minutes. */
  slotMinutes: number;
  /** Opening hours per weekday, Sunday = 0; null when closed. */
  hours: (DayHours | null)[];
  /** Optional services the customer picks from (names only). */
  services: string[];
  /** How far ahead customers can book, in days. */
  daysAhead: number;
  /** Earliest booking, in minutes from now. */
  noticeMinutes: number;
  clock: "12h" | "24h";
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function validTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function defaultSettings(timezone = "UTC", clock: "12h" | "24h" = "12h"): BookingSettings {
  const weekday = { open: "09:00", close: "17:00" };
  return {
    timezone: validTimezone(timezone) ? timezone : "UTC",
    slotMinutes: 30,
    hours: [null, weekday, weekday, weekday, weekday, weekday, { open: "10:00", close: "14:00" }],
    services: [],
    daysAhead: 30,
    noticeMinutes: 60,
    clock,
  };
}

export class BookingInputError extends Error {}

/** Checks settings from the browser; only these fields and shapes are kept. */
export function parseSettings(v: unknown): BookingSettings {
  if (!v || typeof v !== "object") throw new BookingInputError("Booking settings are missing.");
  const o = v as Record<string, unknown>;
  if (!validTimezone(o.timezone)) throw new BookingInputError("Choose a valid time zone.");
  const slot = Number(o.slotMinutes);
  if (!(SLOT_LENGTHS as readonly number[]).includes(slot)) throw new BookingInputError("Choose an appointment length.");
  if (!Array.isArray(o.hours) || o.hours.length !== 7) throw new BookingInputError("Opening hours are missing.");
  const hours = o.hours.map((h, i) => {
    if (h == null) return null;
    const d = h as Record<string, unknown>;
    if (typeof d.open !== "string" || typeof d.close !== "string" || !TIME.test(d.open) || !TIME.test(d.close))
      throw new BookingInputError(`Check the opening hours on ${WEEKDAYS[i]}.`);
    if (toMinutes(d.close) - toMinutes(d.open) < slot) throw new BookingInputError(`On ${WEEKDAYS[i]}, closing time must be at least one appointment after opening.`);
    return { open: d.open, close: d.close };
  });
  if (!hours.some(Boolean)) throw new BookingInputError("Open at least one day a week.");
  const services = (Array.isArray(o.services) ? o.services : [])
    .map((s) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : ""))
    .filter(Boolean)
    .filter((s, i, all) => all.indexOf(s) === i)
    .slice(0, 20);
  const daysAhead = Math.round(Number(o.daysAhead ?? 30));
  const notice = Math.round(Number(o.noticeMinutes ?? 60));
  return {
    timezone: o.timezone,
    slotMinutes: slot,
    hours,
    services,
    daysAhead: Number.isFinite(daysAhead) ? Math.min(90, Math.max(1, daysAhead)) : 30,
    noticeMinutes: Number.isFinite(notice) ? Math.min(7 * 24 * 60, Math.max(0, notice)) : 60,
    clock: o.clock === "24h" ? "24h" : "12h",
  };
}

/** True when the app shows Appmaker's booking screen. */
export function usesBooking(files: Record<string, string>): boolean {
  return Object.entries(files).some(([path, code]) => path !== BOOKING_FILE && /from\s*["'](?:\.{1,2}\/)+(?:src\/)?booking["']/.test(code));
}

/** The booking screen every app with bookings gets. Plain React Native, styled from src/theme.js. */
export function bookingModule(apiUrl: string | null): string {
  return `// Bookings for this business, run by Appmaker.
// This file is written by Appmaker: changes here are replaced.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarCheck, Clock, Phone, RotateCw } from 'lucide-react-native';
import { colors, radius, font, card } from './theme';

const API = ${apiUrl ? JSON.stringify(apiUrl) : "null"};
const KEY = 'appmaker.bookings.v1';

/** A full screen: free times, a short form, and the customer's upcoming bookings. */
export default function BookingScreen({ phone }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState(null);
  const [service, setService] = useState('');
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState([]);

  const load = useCallback(() => {
    if (!API) return setError('Bookings open soon.');
    setError('');
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        setData(d);
        setDay((i) => Math.min(i, Math.max(0, d.days.length - 1)));
      })
      .catch(() => setError("Couldn't load the free times. Check your connection and try again."));
  }, []);

  useEffect(() => {
    load();
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setMine(JSON.parse(raw).filter((b) => Date.parse(b.start) > Date.now())))
      .catch(() => {});
  }, [load]);

  const book = async () => {
    if (!slot || sending) return;
    if (!name.trim() || tel.replace(/\\D/g, '').length < 6) return setError('Add your name and phone number.');
    if (data.services.length && !service) return setError('Choose a service.');
    setSending(true);
    setError('');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: slot.start, name: name.trim(), phone: tel.trim(), service, note: note.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'That didn\\'t work. Try again.');
        if (res.status === 409) {
          setSlot(null);
          load();
        }
        return;
      }
      const next = [...mine, { id: body.id, start: body.start, label: body.label, service }].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      setMine(next);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      setSlot(null);
      setNote('');
      load();
    } catch {
      setError("Couldn't reach the booking service. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const days = data ? data.days : [];
  const current = days[day];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Book a time</Text>
      {mine.map((b) => (
        <View key={b.id} style={[card, styles.booked]}>
          <CalendarCheck color={colors.primary} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bookedTitle}>Booked for {b.label}</Text>
            {b.service ? <Text style={styles.muted}>{b.service}</Text> : null}
            <Text style={styles.muted}>To change or cancel, please call us.</Text>
          </View>
          {phone ? (
            <TouchableOpacity accessibilityLabel="Call to change or cancel" style={styles.iconButton} onPress={() => Linking.openURL('tel:' + String(phone).replace(/[^\\d+]/g, '')).catch(() => {})}>
              <Phone color={colors.primary} size={20} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {!data && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} /> : null}
      {!data && error ? (
        <View style={[card, styles.box]}>
          <Text style={styles.text}>{error}</Text>
          {API ? (
            <TouchableOpacity style={styles.secondary} onPress={load}>
              <RotateCw color={colors.primary} size={18} />
              <Text style={styles.secondaryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {data ? (
        <>
          {data.services.length ? (
            <>
              <Text style={styles.label}>Service</Text>
              <View style={styles.wrap}>
                {data.services.map((s) => (
                  <TouchableOpacity key={s} onPress={() => setService(s)} style={[styles.chip, service === s && styles.chipOn]}>
                    <Text style={[styles.chipText, service === s && styles.chipTextOn]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.label}>Day</Text>
          {days.length === 0 ? <Text style={styles.muted}>No free times right now. Please call us.</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {days.map((d, i) => (
              <TouchableOpacity
                key={d.date}
                onPress={() => {
                  setDay(i);
                  setSlot(null);
                }}
                style={[styles.day, i === day && styles.chipOn]}
              >
                <Text style={[styles.dayTop, i === day && styles.chipTextOn]}>{d.weekday}</Text>
                <Text style={[styles.dayNum, i === day && styles.chipTextOn]}>{d.dayLabel}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {current ? (
            <>
              <Text style={styles.label}>Time</Text>
              <View style={styles.wrap}>
                {current.slots.map((s) => (
                  <TouchableOpacity key={s.start} onPress={() => setSlot(s)} style={[styles.chip, styles.time, slot && slot.start === s.start && styles.chipOn]}>
                    <Text style={[styles.chipText, slot && slot.start === s.start && styles.chipTextOn]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
          {slot ? (
            <View style={[card, styles.box]}>
              <View style={styles.row}>
                <Clock color={colors.primary} size={18} />
                <Text style={styles.bookedTitle}>{current.weekday} {current.dayLabel}, {slot.label}</Text>
              </View>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} autoComplete="name" />
              <TextInput style={styles.input} value={tel} onChangeText={setTel} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" autoComplete="tel" />
              <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={colors.muted} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={[styles.button, sending && { opacity: 0.6 }]} onPress={book} disabled={sending}>
                <Text style={styles.buttonText}>{sending ? 'Booking…' : 'Book ' + slot.label}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: font.heading, color: colors.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 18, marginBottom: 8 },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  error: { fontSize: 13, color: colors.danger, marginTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  chipTextOn: { color: colors.onPrimary },
  time: { minWidth: 88, alignItems: 'center' },
  day: { width: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dayTop: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  dayNum: { fontSize: 16, color: colors.text, fontWeight: '700', marginTop: 2 },
  box: { padding: 16, marginTop: 18 },
  booked: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  bookedTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface, marginTop: 10 },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primary, marginTop: 14 },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});
`;
}
