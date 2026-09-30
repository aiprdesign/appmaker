/**
 * Makes the template screenshots on the home page (public/templates/*.jpg).
 *
 * Templates with a built-in sample app (habits, budget, workouts, journal)
 * are screenshots of that app. The others are a one-screen React Native app
 * filled with the template's content. Every image is rendered by Appmaker's
 * own preview runtime at iPhone size.
 *
 * Needs a running Appmaker server for the preview runtime:
 *   npm run build && APPMAKER_DEMO=1 npx next start -p 3150
 *   npx tsx scripts/template-screens.ts            (SERVER=http://localhost:3150)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { demoResponse } from "../src/lib/demo";
import { parseGeneration } from "../src/lib/parse";
import { buildPreviewHtml } from "../src/lib/preview";
import { BUSINESS_TEMPLATES, TEMPLATES, templateSlug } from "../src/lib/templates";

const SERVER = process.env.SERVER || "http://localhost:3150";
const OUT = path.join(process.cwd(), "public", "templates");

interface Row {
  emoji: string;
  title: string;
  meta: string;
  right?: string;
}
interface Screen {
  eyebrow: string;
  title: string;
  color: string;
  bg: string;
  hero: { emoji?: string; big: string; sub: string; progress?: number; button?: string };
  /** Business apps: Open now badge and one-tap actions. */
  open?: string;
  actions?: string[];
  chips?: string[];
  section: string;
  rows: Row[];
  tabs: [string, string][];
}

/** Home screens for templates without a sample app. */
const SCREENS: Record<string, Screen> = {
  "recipe-box": {
    eyebrow: "What's cooking",
    title: "Recipes",
    color: "#D97706",
    bg: "#FFFBF5",
    hero: { emoji: "🍝", big: "Creamy tomato pasta", sub: "25 min · Easy · 4 servings", button: "Cook now" },
    chips: ["All", "Quick", "Veggie", "Dessert"],
    section: "This week",
    rows: [
      { emoji: "🥗", title: "Greek salad", meta: "10 min · Veggie", right: "♥" },
      { emoji: "🍛", title: "Chickpea curry", meta: "35 min · Vegan", right: "♥" },
      { emoji: "🥞", title: "Fluffy pancakes", meta: "20 min · Breakfast" },
    ],
    tabs: [
      ["📖", "Recipes"],
      ["🗓️", "Plan"],
      ["♥", "Saved"],
    ],
  },
  "language-flashcards": {
    eyebrow: "Spanish · Day 12",
    title: "Study",
    color: "#0284C7",
    bg: "#F5FAFE",
    hero: { emoji: "🗣️", big: "18 / 25 cards", sub: "Daily goal: almost there", progress: 0.72 },
    section: "Decks",
    rows: [
      { emoji: "🍎", title: "Food & drink", meta: "42 cards · 8 due", right: "Study" },
      { emoji: "✈️", title: "Travel phrases", meta: "30 cards · 3 due", right: "Study" },
      { emoji: "🏠", title: "At home", meta: "26 cards · all done", right: "✓" },
    ],
    tabs: [
      ["📚", "Decks"],
      ["🎯", "Review"],
      ["📈", "Progress"],
    ],
  },
  "plant-care": {
    eyebrow: "Today",
    title: "My plants",
    color: "#15803D",
    bg: "#F6FBF7",
    hero: { emoji: "💧", big: "2 need water", sub: "Monstera and Basil are thirsty", button: "Water all" },
    section: "Your plants",
    rows: [
      { emoji: "🪴", title: "Monstera", meta: "Water today · Living room", right: "💧" },
      { emoji: "🌿", title: "Basil", meta: "Water today · Kitchen", right: "💧" },
      { emoji: "🌵", title: "Cactus", meta: "In 9 days · Office", right: "✓" },
    ],
    tabs: [
      ["🪴", "Plants"],
      ["📝", "Log"],
      ["⚙️", "Settings"],
    ],
  },
  "event-countdown": {
    eyebrow: "Coming up",
    title: "Countdowns",
    color: "#DB2777",
    bg: "#FFF7FB",
    hero: { emoji: "✈️", big: "12 days", sub: "Trip to Lisbon · Oct 12" },
    section: "Upcoming",
    rows: [
      { emoji: "🎂", title: "Mia's birthday", meta: "Nov 3 · Family", right: "34d" },
      { emoji: "🎄", title: "Holidays", meta: "Dec 24 · Break", right: "85d" },
      { emoji: "🚀", title: "App launch", meta: "Jan 15 · Work", right: "107d" },
    ],
    tabs: [
      ["⏳", "Events"],
      ["➕", "Add"],
      ["🗂️", "Categories"],
    ],
  },
  "restaurant-or-cafe": {
    eyebrow: "Welcome to",
    title: "Luigi's",
    color: "#B91C1C",
    bg: "#FFF8F6",
    open: "Open now · until 11 pm",
    hero: { emoji: "🍕", big: "Today's special", sub: "Wood-fired truffle pizza · $18", button: "Book a table" },
    actions: ["📞 Call", "📍 Directions", "🛵 Order"],
    section: "Menu favourites",
    rows: [
      { emoji: "🍝", title: "Cacio e pepe", meta: "Handmade pasta · V", right: "$19" },
      { emoji: "🍕", title: "Margherita", meta: "San Marzano, fior di latte", right: "$16" },
      { emoji: "🍰", title: "Tiramisu", meta: "House recipe", right: "$9" },
    ],
    tabs: [
      ["🏠", "Home"],
      ["📋", "Menu"],
      ["⭐", "Rewards"],
    ],
  },
  "salon-or-barber": {
    eyebrow: "Studio Luxe",
    title: "Book a visit",
    color: "#9D174D",
    bg: "#FFF7FA",
    open: "Open now · until 7 pm",
    hero: { emoji: "✂️", big: "4 of 6 visits", sub: "2 more for 20% off", progress: 0.66 },
    actions: ["📅 Book", "💬 WhatsApp", "📍 Directions"],
    section: "Services",
    rows: [
      { emoji: "💇‍♀️", title: "Cut & blow-dry", meta: "45 min · with Ana", right: "$55" },
      { emoji: "🎨", title: "Colour & gloss", meta: "90 min · with Jo", right: "$120" },
      { emoji: "🧔", title: "Beard trim", meta: "20 min · with Sam", right: "$25" },
    ],
    tabs: [
      ["🏠", "Home"],
      ["💈", "Services"],
      ["🎁", "Loyalty"],
    ],
  },
  "gym-or-studio": {
    eyebrow: "Iron Yard Gym",
    title: "Today's classes",
    color: "#1D4ED8",
    bg: "#F5F8FF",
    open: "Open now · 5 am – 11 pm",
    hero: { emoji: "🔥", big: "6-day streak", sub: "You checked in yesterday", button: "Check in" },
    chips: ["All", "HIIT", "Yoga", "Spin"],
    section: "Up next",
    rows: [
      { emoji: "🚴", title: "Spin 45", meta: "6:00 pm · Studio B · 4 spots", right: "Book" },
      { emoji: "🧘", title: "Flow yoga", meta: "7:00 pm · Studio A", right: "Book" },
      { emoji: "🏋️", title: "Strength basics", meta: "7:30 pm · Floor", right: "Book" },
    ],
    tabs: [
      ["📅", "Classes"],
      ["💳", "Membership"],
      ["📍", "Visit"],
    ],
  },
  "clinic-or-dentist": {
    eyebrow: "Bright Smile Dental",
    title: "Hello, Sam",
    color: "#0F766E",
    bg: "#F4FBFA",
    open: "Open now · until 6 pm",
    hero: { emoji: "🗓️", big: "Check-up · Tue 10:30", sub: "Reminder set for the day before" },
    actions: ["📞 Call", "📅 Book", "📍 Directions"],
    section: "Our services",
    rows: [
      { emoji: "🦷", title: "Check-up & clean", meta: "About 45 minutes" },
      { emoji: "✨", title: "Whitening", meta: "Consultation first" },
      { emoji: "👨‍⚕️", title: "Meet the team", meta: "4 practitioners" },
    ],
    tabs: [
      ["🏠", "Home"],
      ["🩺", "Services"],
      ["ℹ️", "Visit"],
    ],
  },
  "local-shop": {
    eyebrow: "Maple & Co.",
    title: "New in",
    color: "#6D28D9",
    bg: "#FAF7FF",
    open: "Open now · until 8 pm",
    hero: { emoji: "🏷️", big: "Weekend offer", sub: "15% off candles & home scents", button: "Shop the offer" },
    chips: ["All", "Home", "Gifts", "Kitchen"],
    section: "Popular",
    rows: [
      { emoji: "🕯️", title: "Fig & cedar candle", meta: "Home · 40 h burn", right: "$28" },
      { emoji: "🧺", title: "Woven basket", meta: "Handmade", right: "$42" },
      { emoji: "☕", title: "Stoneware mug", meta: "Kitchen · 4 colours", right: "$18" },
    ],
    tabs: [
      ["🛍️", "Shop"],
      ["♥", "Wishlist"],
      ["🎁", "Rewards"],
    ],
  },
  "church-or-community": {
    eyebrow: "Grace Community",
    title: "This week",
    color: "#A16207",
    bg: "#FFFBF2",
    hero: { emoji: "⛪", big: "Sunday service", sub: "9:00 & 11:00 am · Main hall", button: "Remind me" },
    actions: ["🙏 Prayer", "💝 Give", "📍 Directions"],
    section: "Events",
    rows: [
      { emoji: "🎶", title: "Choir practice", meta: "Thu 7 pm · Chapel" },
      { emoji: "🍲", title: "Community dinner", meta: "Fri 6 pm · Hall", right: "RSVP" },
      { emoji: "👨‍👩‍👧", title: "Family morning", meta: "Sat 10 am · Garden" },
    ],
    tabs: [
      ["🏠", "Home"],
      ["📅", "Events"],
      ["📝", "Notes"],
    ],
  },
  "real-estate-agent": {
    eyebrow: "Harbor Homes",
    title: "Featured",
    color: "#0F766E",
    bg: "#F5FAF9",
    hero: { emoji: "🏡", big: "$649,000", sub: "3 bd · 2 ba · 1,850 sq ft · Oak St", button: "Book a viewing" },
    chips: ["Buy", "Rent", "Saved", "Open house"],
    section: "New listings",
    rows: [
      { emoji: "🏠", title: "Maple Ave townhouse", meta: "2 bd · 2 ba · 1,200 sq ft", right: "$489k" },
      { emoji: "🏢", title: "Harbor view condo", meta: "1 bd · 1 ba · 780 sq ft", right: "$395k" },
      { emoji: "🌳", title: "Family home, Elm Rd", meta: "4 bd · 3 ba · 2,400 sq ft", right: "$825k" },
    ],
    tabs: [
      ["🔎", "Search"],
      ["♥", "Saved"],
      ["🧮", "Mortgage"],
    ],
  },
  "home-services": {
    eyebrow: "FixRight Plumbing",
    title: "How can we help?",
    color: "#EA580C",
    bg: "#FFF8F3",
    open: "Open now · 24/7 emergencies",
    hero: { emoji: "🧰", big: "Get a free quote", sub: "Reply within 2 hours", button: "Request a quote" },
    actions: ["📞 Call", "💬 WhatsApp", "⭐ Reviews"],
    section: "Services",
    rows: [
      { emoji: "🚿", title: "Leaks & repairs", meta: "Same-day visits", right: "from $89" },
      { emoji: "🔥", title: "Boiler service", meta: "Annual check", right: "from $120" },
      { emoji: "🛁", title: "Bathroom fitting", meta: "Free survey", right: "Quote" },
    ],
    tabs: [
      ["🏠", "Home"],
      ["🧾", "Quotes"],
      ["📍", "Areas"],
    ],
  },
};

/** One-screen app that draws a Screen; same look as the sample apps. */
function screenApp(s: Screen): string {
  return `import React from 'react';
import { View, Text, ScrollView } from 'react-native';

const S = ${JSON.stringify(s)};
const tint = S.color + '1A';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: S.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 110 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: S.color }}>{S.eyebrow}</Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: '#111827', marginTop: 2 }}>{S.title}</Text>
        {S.open ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#DCFCE7' }}>
            <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>● {S.open}</Text>
          </View>
        ) : null}
        <View style={{ marginTop: 18, borderRadius: 24, padding: 20, backgroundColor: S.color }}>
          {S.hero.emoji ? <Text style={{ fontSize: 34 }}>{S.hero.emoji}</Text> : null}
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 6 }}>{S.hero.big}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 4 }}>{S.hero.sub}</Text>
          {S.hero.progress != null ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 16 }}>
              <View style={{ height: 8, borderRadius: 4, width: Math.round(S.hero.progress * 100) + '%', backgroundColor: '#fff' }} />
            </View>
          ) : null}
          {S.hero.button ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 16, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Text style={{ color: S.color, fontWeight: '800', fontSize: 15 }}>{S.hero.button}</Text>
            </View>
          ) : null}
        </View>
        {S.actions ? (
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {S.actions.map((a, i) => (
              <View key={a} style={{ flex: 1, marginLeft: i ? 10 : 0, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#EEF0F3' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{a}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {S.chips ? (
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            {S.chips.map((c, i) => (
              <View key={c} style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: i ? '#fff' : S.color, borderWidth: 1, borderColor: i ? '#EEF0F3' : S.color }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: i ? '#374151' : '#fff' }}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ fontSize: 19, fontWeight: '800', color: '#111827', marginTop: 22, marginBottom: 10 }}>{S.section}</Text>
        {S.rows.map((r) => (
          <View key={r.title} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{r.title}</Text>
              <Text style={{ fontSize: 13, color: '#5F6B7A', marginTop: 2 }}>{r.meta}</Text>
            </View>
            {r.right ? <Text style={{ fontSize: 15, fontWeight: '800', color: S.color }}>{r.right}</Text> : null}
          </View>
        ))}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10, paddingBottom: 26 }}>
        {S.tabs.map(([icon, label], i) => (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 22 }}>{icon}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 2, color: i ? '#6B7280' : S.color }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
`;
}

/** Sample apps shown as they run, with a little activity for the screenshot. */
const SAMPLES: Record<string, { prompt: string; prepare?: (page: Page) => Promise<void> }> = {
  "habit-tracker": {
    prompt: "habit tracker",
    // Tick two habits so the progress card isn't empty.
    // The check circles sit at the right of the first two rows (390×844 screen).
    prepare: async (page) => {
      for (const y of [321, 407]) {
        await page.mouse.click(334, y);
        await page.waitForTimeout(300);
      }
    },
  },
  "budget-planner": { prompt: "budget planner" },
  "home-workouts": { prompt: "home workouts" },
  "mood-journal": { prompt: "mood journal" },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.warn("  page error:", e.message));
  for (const t of [...TEMPLATES, ...BUSINESS_TEMPLATES]) {
    const slug = templateSlug(t);
    const sample = SAMPLES[slug];
    const screen = SCREENS[slug];
    const files = sample ? parseGeneration(demoResponse(sample.prompt, false)).files : screen ? { "App.js": screenApp(screen) } : null;
    if (!files) {
      console.warn(`skip ${slug}: no sample app or screen`);
      continue;
    }
    await page.goto(SERVER);
    await page.setContent(buildPreviewHtml(files, SERVER, "ios"), { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await sample?.prepare?.(page);
    const file = path.join(OUT, `${slug}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    console.log(`${sample ? "app   " : "screen"} ${slug}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
