import { autoDesign, THEME_FILE, themeModule } from "./design";
import { DATA_FILE, RULES_FILE, dataModule, type DataRules } from "./app-data";
import type { AppDesign, FileMap, StoreListing } from "./types";

/**
 * Ready-made business apps: picking a business template opens a working app
 * straight away (no AI, no waiting), filled with example details. The owner
 * changes the details (name, phone, hours, menu or services) and the app
 * updates at once. Only src/business.js, the data rules and the theme change;
 * the screens are the same well-tested code for every business.
 */

export interface ReadyItem {
  name: string;
  description: string;
  price: string;
  category: string;
}

/** The details a business fills in. */
export interface ReadyInfo {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  /** One line per day or group of days, e.g. "Mon–Fri: 8 am – 6 pm". */
  hours: string;
  color: string;
  items: ReadyItem[];
}

/** How customers reach the business: an order to collect, a booking, or a quote request. */
export type ReadyKind = "order" | "booking" | "quote";

export interface ReadyPreset {
  kind: ReadyKind;
  /** Bottom tab names and Lucide icons. */
  itemsTab: string;
  itemsIcon: string;
  /** The big icon on the home screen's main card. */
  heroIcon: string;
  /** Asks for the customer's address (work done at their place). */
  onSite?: boolean;
  sample: ReadyInfo;
}

const hours = (weekday: string, sat: string, sun = "Closed") => `Mon–Fri: ${weekday}\nSat: ${sat}\nSun: ${sun}`;
const item = (name: string, description: string, price: string, category: string): ReadyItem => ({ name, description, price, category });
const contact = (name: string, tagline: string, color: string, h: string, items: ReadyItem[]): ReadyInfo => ({
  name,
  tagline,
  phone: "+1 555 0100",
  whatsapp: "",
  email: `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
  address: "12 High Street, Springfield",
  hours: h,
  color,
  items,
});

/** One preset per business template, keyed by its slug (see templateSlug). */
export const READY_PRESETS: Record<string, ReadyPreset> = {
  "restaurant-or-cafe": {
    kind: "order",
    itemsTab: "Menu",
    itemsIcon: "UtensilsCrossed",
    heroIcon: "UtensilsCrossed",
    sample: contact("Olive & Thyme", "Seasonal plates, made fresh every day", "#B91C1C", hours("11 am – 10 pm", "11 am – 11 pm", "12 pm – 9 pm"), [
      item("Burrata salad", "Heirloom tomatoes, basil oil", "12", "Starters"),
      item("Grilled sea bass", "Lemon butter, new potatoes", "24", "Mains"),
      item("Wild mushroom risotto", "Parmesan, thyme · Vegetarian", "18", "Mains"),
      item("Tiramisu", "Made in house every morning", "8", "Desserts"),
    ]),
  },
  "salon-or-barber": {
    kind: "booking",
    itemsTab: "Services",
    itemsIcon: "Scissors",
    heroIcon: "Scissors",
    sample: contact("Fade & Co.", "Cuts, colour and beard care", "#7C3AED", hours("9 am – 7 pm", "9 am – 5 pm"), [
      item("Haircut", "Wash, cut and style · 45 min", "35", "Hair"),
      item("Skin fade", "Clipper fade, scissor top · 40 min", "30", "Hair"),
      item("Beard trim", "Shape and hot towel · 20 min", "18", "Beard"),
      item("Full colour", "Includes toner · 2 hours", "from 90", "Colour"),
    ]),
  },
  "gym-or-studio": {
    kind: "booking",
    itemsTab: "Classes",
    itemsIcon: "Dumbbell",
    heroIcon: "Dumbbell",
    sample: contact("Pulse Studio", "Small classes, real coaching", "#EA580C", hours("6 am – 9 pm", "8 am – 2 pm", "8 am – 12 pm"), [
      item("Morning HIIT", "45 min · All levels", "15", "Classes"),
      item("Strength basics", "60 min · Beginners welcome", "18", "Classes"),
      item("Yoga flow", "60 min · Bring a mat or borrow ours", "15", "Classes"),
      item("Personal training", "One to one · 60 min", "60", "Coaching"),
    ]),
  },
  "clinic-or-dentist": {
    kind: "booking",
    itemsTab: "Services",
    itemsIcon: "Stethoscope",
    heroIcon: "CalendarCheck",
    sample: contact("Brightside Dental", "Gentle care for the whole family", "#0E7490", hours("8 am – 6 pm", "9 am – 1 pm"), [
      item("Check-up", "Exam and advice · 30 min", "60", "General"),
      item("Hygiene clean", "Scale and polish · 45 min", "80", "General"),
      item("Teeth whitening", "Consultation first", "from 250", "Cosmetic"),
      item("Emergency appointment", "Same-day when we can", "Call us", "Urgent"),
    ]),
  },
  "local-shop": {
    kind: "order",
    itemsTab: "Shop",
    itemsIcon: "ShoppingBag",
    heroIcon: "ShoppingBag",
    sample: contact("Corner Goods", "Local makers, everyday essentials", "#059669", hours("9 am – 6 pm", "10 am – 5 pm"), [
      item("Hand-poured candle", "Fig and cedar · 200 g", "18", "Home"),
      item("Local honey", "Raw, from 3 miles away · 340 g", "9", "Pantry"),
      item("Linen tote bag", "Natural, printed in town", "14", "Gifts"),
      item("Gift card", "Any amount, spend in store", "from 10", "Gifts"),
    ]),
  },
  "church-or-community": {
    kind: "booking",
    itemsTab: "Events",
    itemsIcon: "CalendarDays",
    heroIcon: "HandHeart",
    sample: contact("Grace Community Church", "Everyone is welcome", "#4F46E5", "Sun: Services 9 am and 11 am\nWed: Bible study 7 pm\nOffice: Mon–Thu 9 am – 3 pm", [
      item("Sunday service", "Kids' club during the 11 am service", "Free", "Weekly"),
      item("Wednesday Bible study", "Coffee from 6:30 pm", "Free", "Weekly"),
      item("Community lunch", "Last Saturday of the month", "Free", "Monthly"),
      item("Prayer request", "Shared only with the prayer team", "Free", "Care"),
    ]),
  },
  "real-estate-agent": {
    kind: "quote",
    itemsTab: "Listings",
    itemsIcon: "House",
    heroIcon: "KeyRound",
    sample: contact("Harbor Homes", "Buying, selling and letting, made simple", "#1D4ED8", hours("9 am – 6 pm", "10 am – 4 pm"), [
      item("3-bed family home, Oak Lane", "Garden, garage, near schools", "425,000", "For sale"),
      item("2-bed apartment, Riverside", "Balcony, parking", "1,450 / month", "To rent"),
      item("Free home valuation", "We visit, you get a written figure", "Free", "Selling"),
    ]),
  },
  "home-services": {
    kind: "quote",
    itemsTab: "Services",
    itemsIcon: "Wrench",
    heroIcon: "Wrench",
    onSite: true,
    sample: contact("Reliable Plumbing", "Fast, tidy, fairly priced", "#0369A1", hours("7 am – 7 pm", "8 am – 2 pm", "Emergencies only"), [
      item("Leak repair", "Taps, pipes and toilets", "from 80", "Repairs"),
      item("Boiler service", "Annual safety check", "95", "Heating"),
      item("Bathroom fitting", "Free quote at your home", "Quote", "Installs"),
      item("Emergency call-out", "Within 2 hours, day or night", "from 120", "Urgent"),
    ]),
  },
  "car-repair-auto-shop": {
    kind: "booking",
    itemsTab: "Services",
    itemsIcon: "Wrench",
    heroIcon: "CarFront",
    sample: contact("Northside Motors", "Honest repairs, done right first time", "#2563EB", hours("8 am – 6 pm", "8 am – 1 pm"), [
      item("Oil & filter change", "About 45 minutes", "from 59", "Servicing"),
      item("Full service", "Checks, fluids, filters · half a day", "from 189", "Servicing"),
      item("Brakes", "Pads and discs, checked free", "from 120", "Repairs"),
      item("Diagnostics", "Warning lights, same day", "45", "Repairs"),
    ]),
  },
  bakery: {
    kind: "order",
    itemsTab: "Menu",
    itemsIcon: "Croissant",
    heroIcon: "Croissant",
    sample: contact("Crumb & Co.", "Baked this morning, every morning", "#B45309", hours("7 am – 4 pm", "7 am – 2 pm"), [
      item("Sourdough loaf", "48-hour ferment · Vegan", "7", "Bread"),
      item("Almond croissant", "Out of the oven at 8 am", "3.80", "Pastries"),
      item("Brown butter cookies", "Contains nuts", "2.50", "Pastries"),
      item("Celebration cake", "Order 3 days ahead", "from 45", "Cakes"),
    ]),
  },
  "cleaning-service": {
    kind: "quote",
    itemsTab: "Services",
    itemsIcon: "Sparkles",
    heroIcon: "Sparkles",
    onSite: true,
    sample: contact("Sparkle Home Cleaning", "Trusted, insured local cleaners", "#0891B2", hours("8 am – 6 pm", "9 am – 3 pm"), [
      item("Regular clean", "Weekly or every 2 weeks · per hour", "25", "Homes"),
      item("Deep clean", "Kitchen, bathrooms, every corner", "from 180", "Homes"),
      item("End of tenancy", "Deposit-back standard", "from 220", "Moving"),
      item("Office clean", "Before or after hours", "Quote", "Business"),
    ]),
  },
  "pizza-takeaway": {
    kind: "order",
    itemsTab: "Menu",
    itemsIcon: "Pizza",
    heroIcon: "Pizza",
    sample: contact("Tony's Pizza", "Stone-baked, ready in 20 minutes", "#DC2626", hours("4 pm – 11 pm", "12 pm – 11 pm", "12 pm – 10 pm"), [
      item("Margherita", "Tomato, mozzarella, basil", "11", "Pizza"),
      item("Pepperoni", "Double pepperoni, oregano", "13", "Pizza"),
      item("Garlic bread", "With mozzarella", "5", "Sides"),
      item("Cola 330 ml", "Can", "2", "Drinks"),
    ]),
  },
  "coffee-shop": {
    kind: "order",
    itemsTab: "Menu",
    itemsIcon: "Coffee",
    heroIcon: "Coffee",
    sample: contact("Daily Grind", "Order ahead, skip the line", "#7C4A2D", hours("7 am – 5 pm", "8 am – 4 pm", "9 am – 2 pm"), [
      item("Flat white", "Double shot, whole or oat milk", "3.60", "Coffee"),
      item("Iced latte", "Oat milk at no extra cost", "4.20", "Coffee"),
      item("Chai latte", "Spiced, lightly sweet", "3.90", "Tea"),
      item("Banana bread", "Toasted, with butter", "3.50", "Food"),
    ]),
  },
  "hotel-or-b-b": {
    kind: "booking",
    itemsTab: "Rooms",
    itemsIcon: "BedDouble",
    heroIcon: "BedDouble",
    sample: contact("Seaview B&B", "Six rooms, two minutes from the beach", "#0F766E", "Check-in: 3 pm – 8 pm\nCheck-out: by 11 am\nBreakfast: 7:30 – 9:30 am", [
      item("Double room", "Sea view, breakfast included · per night", "120", "Rooms"),
      item("Twin room", "Garden view, breakfast included · per night", "105", "Rooms"),
      item("Family suite", "Sleeps 4 · per night", "165", "Rooms"),
    ]),
  },
  "pet-grooming-vet": {
    kind: "booking",
    itemsTab: "Services",
    itemsIcon: "PawPrint",
    heroIcon: "PawPrint",
    sample: contact("Happy Paws", "Grooming and care your pet will love", "#7C3AED", hours("8 am – 6 pm", "9 am – 3 pm"), [
      item("Full groom", "Bath, cut, nails · small dogs", "from 45", "Grooming"),
      item("Bath & brush", "Shampoo, dry, brush out", "from 30", "Grooming"),
      item("Nail clip", "No appointment needed", "10", "Grooming"),
      item("Health check", "With our vet · 20 min", "40", "Vet"),
    ]),
  },
  florist: {
    kind: "order",
    itemsTab: "Flowers",
    itemsIcon: "Flower2",
    heroIcon: "Flower2",
    sample: contact("Petal & Stem", "Fresh flowers, hand-tied today", "#DB2777", hours("8 am – 6 pm", "9 am – 5 pm"), [
      item("Seasonal bouquet", "Florist's choice, hand-tied", "from 35", "Bouquets"),
      item("Dozen red roses", "Wrapped, with a card", "55", "Bouquets"),
      item("Potted orchid", "White, in a ceramic pot", "32", "Plants"),
      item("Wedding flowers", "Free consultation", "Quote", "Events"),
    ]),
  },
  "driving-school": {
    kind: "booking",
    itemsTab: "Lessons",
    itemsIcon: "Car",
    heroIcon: "Car",
    sample: contact("Green Light Driving", "Patient instructors, high pass rate", "#1D4ED8", hours("7 am – 8 pm", "8 am – 4 pm"), [
      item("Single lesson", "60 minutes, pick-up from home", "40", "Lessons"),
      item("Block of 10", "Save 40 over single lessons", "360", "Lessons"),
      item("Intensive course", "Pass in 2 weeks", "from 900", "Courses"),
      item("Mock test", "Real test route, full feedback", "45", "Tests"),
    ]),
  },
  "tutoring-lessons": {
    kind: "booking",
    itemsTab: "Lessons",
    itemsIcon: "GraduationCap",
    heroIcon: "GraduationCap",
    sample: contact("Bright Minds Tutoring", "Confidence in every subject", "#4F46E5", hours("3 pm – 8 pm", "9 am – 1 pm"), [
      item("Maths", "All ages · 60 min", "35", "Subjects"),
      item("English", "Reading, writing, exams · 60 min", "35", "Subjects"),
      item("Exam prep", "Small groups of 4", "20", "Groups"),
      item("Free first session", "Meet your tutor · 30 min", "Free", "Start"),
    ]),
  },
  "laundry-dry-cleaning": {
    kind: "order",
    itemsTab: "Prices",
    itemsIcon: "Shirt",
    heroIcon: "Shirt",
    sample: contact("Fresh Press", "Clean clothes, back the next day", "#0284C7", hours("7 am – 7 pm", "8 am – 4 pm"), [
      item("Shirt, washed and pressed", "On a hanger", "3.50", "Laundry"),
      item("Suit, dry cleaned", "2 pieces", "16", "Dry cleaning"),
      item("Duvet", "Any size", "from 20", "Laundry"),
      item("Alterations", "Hems, zips, repairs", "from 8", "Repairs"),
    ]),
  },
  "accountant-or-law-office": {
    kind: "quote",
    itemsTab: "Services",
    itemsIcon: "Briefcase",
    heroIcon: "Briefcase",
    sample: contact("Morgan & Lee", "Clear advice, fixed fees", "#334155", hours("9 am – 5:30 pm", "Closed"), [
      item("Tax return", "Personal, fixed fee", "from 180", "Tax"),
      item("Bookkeeping", "Monthly, for small businesses", "from 120", "Business"),
      item("Free first call", "20 minutes, no obligation", "Free", "Start"),
    ]),
  },
};

export const hasReadyApp = (slug: string) => slug in READY_PRESETS;

/** What a customer sends, per kind. Only what the business needs to reply: no addresses unless the work is at the customer's place. */
function requestFields(preset: ReadyPreset): string[] {
  if (preset.kind === "order") return ["name", "phone", "items", "pickupTime", "note"];
  if (preset.kind === "booking") return ["name", "phone", "service", "preferredTime", "note"];
  return ["name", "phone", ...(preset.onSite ? ["address"] : []), "service", "details"];
}

const STATUSES: Record<ReadyKind, string[]> = {
  order: ["new", "preparing", "ready", "collected", "cancelled"],
  booking: ["new", "confirmed", "done", "cancelled"],
  quote: ["new", "quoted", "booked", "done", "cancelled"],
};

/** The data the app keeps: the business's items (it edits them on its owner page) and the requests customers send. */
export function readyRules(preset: ReadyPreset, info: ReadyInfo): DataRules {
  return {
    items: { access: "public", fields: ["name", "description", "price", "category"], seed: info.items.filter((i) => i.name.trim()) as unknown as Record<string, unknown>[] },
    requests: { access: "inbox", fields: requestFields(preset), statuses: STATUSES[preset.kind] },
  };
}

const WORDS: Record<ReadyKind, { cta: string; tab: string; tabIcon: string; send: string; mine: string; add: string; when: string; whenHint: string; details: string; detailsHint: string }> = {
  order: { cta: "Order for pickup", tab: "Order", tabIcon: "ShoppingBag", send: "Send order", mine: "My orders", add: "Add", when: "Pickup time", whenHint: "e.g. Today 6:30 pm", details: "Note", detailsHint: "Anything we should know (optional)" },
  booking: { cta: "Book now", tab: "Book", tabIcon: "CalendarCheck", send: "Send booking request", mine: "My bookings", add: "Book", when: "Preferred day and time", whenHint: "e.g. Friday morning", details: "Note", detailsHint: "Anything we should know (optional)" },
  quote: { cta: "Get a quote", tab: "Quote", tabIcon: "FileText", send: "Send request", mine: "My requests", add: "Ask", when: "", whenHint: "", details: "Details", detailsHint: "What do you need? Size, timing, anything useful" },
};

/** src/business.js: everything the owner fills in. The only file that changes when they edit their details. */
export function businessModule(preset: ReadyPreset, info: ReadyInfo): string {
  const words = WORDS[preset.kind];
  const business = {
    name: info.name.trim() || "My business",
    tagline: info.tagline.trim(),
    phone: info.phone.trim(),
    whatsapp: info.whatsapp.trim(),
    email: info.email.trim(),
    address: info.address.trim(),
    hours: info.hours
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
  return `// Your business details. Change them in Appmaker's "Your details" panel.
export const business = ${JSON.stringify(business, null, 2)};

// How customers reach you and what the app calls things.
export const kind = ${JSON.stringify(preset.kind)};
export const words = ${JSON.stringify({ ...words, items: preset.itemsTab }, null, 2)};
export const icons = ${JSON.stringify({ items: preset.itemsIcon, hero: preset.heroIcon, request: words.tabIcon })};
export const onSite = ${preset.onSite ? "true" : "false"};
`;
}

const APP = `import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Icons from 'lucide-react-native';
import { colors, mode } from './src/theme';
import { icons, words } from './src/business';
import HomeScreen from './src/screens/HomeScreen';
import ItemsScreen from './src/screens/ItemsScreen';
import RequestScreen from './src/screens/RequestScreen';
import InfoScreen from './src/screens/InfoScreen';

const TABS = [
  { key: 'home', label: 'Home', icon: 'House' },
  { key: 'items', label: words.items, icon: icons.items },
  { key: 'request', label: words.tab, icon: icons.request },
  { key: 'info', label: 'Info', icon: 'Info' },
];

function Shell() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('home');
  // What the customer picked on the menu or services list, carried into the request form.
  const [picked, setPicked] = useState([]);
  const pick = (name) => {
    setPicked((now) => (now.includes(name) ? now : [...now, name]));
    setTab('request');
  };
  const screens = {
    home: <HomeScreen go={setTab} pick={pick} />,
    items: <ItemsScreen pick={pick} />,
    request: <RequestScreen picked={picked} setPicked={setPicked} go={setTab} />,
    info: <InfoScreen />,
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={styles.body}>{screens[tab]}</View>
        <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
          {TABS.map((t) => {
            const Icon = Icons[t.icon] || Icons.Circle;
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.label}
                style={styles.tab}
              >
                <Icon size={24} color={on ? colors.primary : colors.muted} strokeWidth={on ? 2.4 : 2} />
                <Text style={[styles.tabText, { color: on ? colors.primary : colors.muted }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 48, paddingBottom: 4 },
  tabText: { fontSize: 12, fontWeight: '600' },
});
`;

const ACTIONS = `import { Alert, Linking } from 'react-native';
import { business } from './business';

const open = async (url, fallback) => {
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert("Couldn't open that", fallback);
  }
};

export const call = () => open('tel:' + business.phone.replace(/[^+\\d]/g, ''), 'Call us on ' + business.phone);
export const whatsapp = () => open('https://wa.me/' + business.whatsapp.replace(/\\D/g, ''), 'Message us on WhatsApp: ' + business.whatsapp);
export const email = () => open('mailto:' + business.email, 'Email us at ' + business.email);
export const directions = () => open('https://maps.google.com/?q=' + encodeURIComponent(business.address), business.address);
`;

const HOME = `import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { card, colors, gradient, heading, label, onGradient, radius } from '../theme';
import { business, icons, words } from '../business';
import { useCollection } from '../appdata';
import { call, directions, whatsapp } from '../actions';

export default function HomeScreen({ go, pick }) {
  const { items } = useCollection('items');
  const Hero = Icons[icons.hero] || Icons.Store;
  const actions = [
    business.phone ? { label: 'Call', icon: Icons.Phone, onPress: call } : null,
    business.whatsapp ? { label: 'WhatsApp', icon: Icons.MessageCircle, onPress: whatsapp } : null,
    business.address ? { label: 'Directions', icon: Icons.Navigation, onPress: directions } : null,
  ].filter(Boolean);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.title, heading, { color: colors.text }]}>{business.name}</Text>
      {!!business.tagline && <Text style={[styles.body, { color: colors.muted }]}>{business.tagline}</Text>}
      {!!business.hours[0] && (
        <View style={styles.row}>
          <Icons.Clock size={16} color={colors.success} />
          <Text style={[styles.small, { color: colors.success }]}>{business.hours[0]}</Text>
        </View>
      )}

      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderRadius: radius.lg }]}>
        <Hero size={40} color={onGradient} />
        <Text style={[styles.heroTitle, heading, { color: onGradient }]}>{words.cta}</Text>
        <Text style={[styles.body, { color: onGradient, opacity: 0.9 }]}>We reply quickly and keep you posted on every step.</Text>
        <Pressable
          onPress={() => go('request')}
          accessibilityRole="button"
          style={[styles.heroButton, { backgroundColor: onGradient, borderRadius: radius.md }]}
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>{words.cta}</Text>
        </Pressable>
      </LinearGradient>

      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" style={[styles.action, card]}>
              <a.icon size={24} color={colors.primary} />
              <Text style={[styles.small, { color: colors.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text style={[label, { color: colors.muted }]}>{words.items}</Text>
        <Pressable onPress={() => go('items')} accessibilityRole="button" hitSlop={12}>
          <Text style={[styles.small, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>
      <View style={[card, styles.list]}>
        {items.slice(0, 3).map((it, i) => (
          <Pressable
            key={it.id || it.name}
            onPress={() => pick(it.name)}
            accessibilityRole="button"
            accessibilityHint={words.add + ' ' + it.name}
            style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          >
            <View style={styles.flex}>
              <Text style={[styles.itemName, { color: colors.text }]}>{it.name}</Text>
              {!!it.description && <Text style={[styles.small, { color: colors.muted }]}>{it.description}</Text>}
            </View>
            {!!it.price && <Text style={[styles.itemName, { color: colors.text }]}>{/^[\\d.,]+$/.test(String(it.price)) ? '$' + it.price : it.price}</Text>}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 32, gap: 12 },
  title: { fontSize: 28, marginTop: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: { padding: 20, gap: 8, marginTop: 8 },
  heroTitle: { fontSize: 22 },
  heroButton: { marginTop: 8, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  list: { paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  itemName: { fontSize: 15, fontWeight: '600' },
  flex: { flex: 1, gap: 4 },
});
`;

const ITEMS = `import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, radius } from '../theme';
import { words } from '../business';
import { useCollection } from '../appdata';

const money = (p) => (/^[\\d.,]+$/.test(String(p)) ? '$' + p : p);

export default function ItemsScreen({ pick }) {
  const { items, loading, error, refresh } = useCollection('items');
  const [category, setCategory] = useState('All');
  const [added, setAdded] = useState(null);
  const categories = useMemo(() => ['All', ...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = category === 'All' ? items : items.filter((i) => i.category === category);
  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <Text style={[styles.title, heading, { color: colors.text }]}>{words.items}</Text>
      {categories.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((c) => {
            const on = c === category;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { borderRadius: radius.pill, backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
              >
                <Text style={[styles.small, { color: on ? colors.onPrimary : colors.text }]}>{c}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {loading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
      {error && !items.length ? (
        <Pressable onPress={refresh} accessibilityRole="button" style={[card, styles.item]}>
          <Text style={[styles.body, { color: colors.text }]}>Couldn't load this. Tap to try again.</Text>
        </Pressable>
      ) : null}
      {shown.map((it) => (
        <View key={it.id || it.name} style={[card, styles.item]}>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: colors.text }]}>{it.name}</Text>
            {!!it.description && <Text style={[styles.small, { color: colors.muted }]}>{it.description}</Text>}
            {!!it.price && <Text style={[styles.name, { color: colors.primary }]}>{money(it.price)}</Text>}
          </View>
          <Pressable
            onPress={() => {
              setAdded(it.name);
              pick(it.name);
            }}
            accessibilityRole="button"
            accessibilityLabel={words.add + ' ' + it.name}
            style={[styles.add, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}
          >
            {added === it.name ? <Icons.Check size={16} color={colors.primary} /> : <Icons.Plus size={16} color={colors.primary} />}
            <Text style={[styles.small, { color: colors.primary, fontWeight: '700' }]}>{words.add}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 32, gap: 12 },
  title: { fontSize: 28, marginTop: 8 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  flex: { flex: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 44 },
});
`;

const REQUEST = `import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, label, radius } from '../theme';
import { business, kind, onSite, words } from '../business';
import { useCollection } from '../appdata';

function Field({ title, value, onChange, hint, multiline, keyboardType, autoComplete }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.small, { color: colors.text, fontWeight: '600' }]}>{title}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        accessibilityLabel={title}
        style={[styles.input, multiline && styles.multi, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md }]}
      />
    </View>
  );
}

export default function RequestScreen({ picked, setPicked, go }) {
  const { items, add, cancel, statusInfo, refresh } = useCollection('requests');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [when, setWhen] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [problem, setProblem] = useState('');
  const what = picked.join(', ');
  const ready = name.trim() && phone.trim() && (kind === 'quote' ? what || details.trim() : what) && (!onSite || address.trim());
  const mine = items.filter((x) => x.mine);

  const send = async () => {
    setSending(true);
    setProblem('');
    try {
      const fields =
        kind === 'order'
          ? { name, phone, items: what, pickupTime: when, note: details }
          : kind === 'booking'
            ? { name, phone, service: what, preferredTime: when, note: details }
            : { name, phone, ...(onSite ? { address } : {}), service: what, details };
      const item = await add(fields);
      setSent(item);
      setPicked([]);
      setWhen('');
      setDetails('');
    } catch (e) {
      setProblem((e && e.message) || 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  const confirmCancel = (id) =>
    Alert.alert('Cancel this?', 'To change it instead, call ' + business.name + '.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: () => cancel(id).catch((e) => Alert.alert('Couldn\\'t cancel', e.message)) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, heading, { color: colors.text }]}>{words.cta}</Text>

        {sent && (
          <View style={[card, styles.box, { borderColor: colors.success, borderWidth: 1 }]}>
            <Icons.CircleCheck size={24} color={colors.success} />
            <View style={styles.flex}>
              <Text style={[styles.name, { color: colors.text }]}>Sent{sent.ref ? ' · #' + sent.ref : ''}</Text>
              <Text style={[styles.small, { color: colors.muted }]}>{business.name} will get back to you. You'll see updates below.</Text>
            </View>
          </View>
        )}

        <View style={[card, styles.form]}>
          <Text style={[styles.small, { color: colors.text, fontWeight: '600' }]}>{kind === 'order' ? 'Your order' : 'What you need'}</Text>
          {picked.length ? (
            <View style={styles.tags}>
              {picked.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPicked(picked.filter((x) => x !== p))}
                  accessibilityRole="button"
                  accessibilityLabel={'Remove ' + p}
                  style={[styles.tag, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}
                >
                  <Text style={[styles.small, { color: colors.primary }]}>{p}</Text>
                  <Icons.X size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => go('items')} accessibilityRole="button" style={styles.row}>
            <Icons.Plus size={16} color={colors.primary} />
            <Text style={[styles.small, { color: colors.primary, fontWeight: '600' }]}>{picked.length ? 'Add more' : 'Choose from ' + words.items.toLowerCase()}</Text>
          </Pressable>

          <Field title="Your first name" value={name} onChange={setName} autoComplete="given-name" />
          <Field title="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" autoComplete="tel" hint="So we can reach you about this" />
          {onSite && <Field title="Address" value={address} onChange={setAddress} autoComplete="street-address" hint="Where the work is" />}
          {!!words.when && <Field title={words.when} value={when} onChange={setWhen} hint={words.whenHint} />}
          <Field title={words.details} value={details} onChange={setDetails} hint={words.detailsHint} multiline />
          <Text style={[styles.small, { color: colors.muted }]}>We use your name and phone only for this {kind === 'order' ? 'order' : 'request'}. Payment is in person.</Text>
          {!!problem && <Text style={[styles.small, { color: colors.danger }]}>{problem}</Text>}
          <Pressable
            onPress={send}
            disabled={!ready || sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || sending }}
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: !ready || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{words.send}</Text>}
          </Pressable>
        </View>

        {mine.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={[label, { color: colors.muted }]}>{words.mine}</Text>
              <Pressable onPress={refresh} accessibilityRole="button" hitSlop={12}>
                <Text style={[styles.small, { color: colors.primary }]}>Refresh</Text>
              </Pressable>
            </View>
            {mine.map((x) => {
              const s = statusInfo(x.status);
              return (
                <View key={x.id} style={[card, styles.box, s.cancelled && { opacity: 0.6 }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: colors.text }]}>{x.items || x.service || x.details}</Text>
                    <Text style={[styles.small, { color: s.done ? colors.muted : colors.primary, fontWeight: '600' }]}>{s.label}</Text>
                    {!s.cancelled && s.steps > 1 && (
                      <View style={styles.steps}>
                        {Array.from({ length: s.steps }).map((_, i) => (
                          <View key={i} style={[styles.step, { borderRadius: radius.pill, backgroundColor: i <= s.step ? colors.primary : colors.border }]} />
                        ))}
                      </View>
                    )}
                  </View>
                  {s.canCancel && (
                    <Pressable onPress={() => confirmCancel(x.id)} accessibilityRole="button" hitSlop={8}>
                      <Text style={[styles.small, { color: colors.danger }]}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  page: { padding: 20, paddingBottom: 32, gap: 12 },
  title: { fontSize: 28, marginTop: 8 },
  form: { padding: 16, gap: 12 },
  field: { gap: 8 },
  input: { borderWidth: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
  multi: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  name: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  steps: { flexDirection: 'row', gap: 4, marginTop: 4 },
  step: { flex: 1, height: 4 },
});
`;

const INFO = `import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, label } from '../theme';
import { business } from '../business';
import { forgetMe } from '../appdata';
import { call, directions, email, whatsapp } from '../actions';

function Row({ icon: Icon, title, value, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} style={styles.row}>
      <Icon size={24} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={[styles.small, { color: colors.muted }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{value}</Text>
      </View>
      {onPress && <Icons.ChevronRight size={16} color={colors.muted} />}
    </Pressable>
  );
}

export default function InfoScreen() {
  const forget = () =>
    Alert.alert('Delete my data?', 'Your name, phone and requests are removed from this app.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await forgetMe();
            Alert.alert('Your data was deleted.', 'Orders still being prepared stay with ' + business.name + ' until they are finished.');
          } catch (e) {
            Alert.alert("Couldn't delete it", (e && e.message) || 'Try again.');
          }
        },
      },
    ]);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.title, heading, { color: colors.text }]}>Info</Text>
      <Text style={[label, { color: colors.muted }]}>Opening hours</Text>
      <View style={[card, styles.box]}>
        {business.hours.map((h) => (
          <Text key={h} style={[styles.body, { color: colors.text }]}>{h}</Text>
        ))}
      </View>
      <Text style={[label, { color: colors.muted }]}>Contact</Text>
      <View style={[card, styles.list]}>
        {!!business.phone && <Row icon={Icons.Phone} title="Phone" value={business.phone} onPress={call} />}
        {!!business.whatsapp && <Row icon={Icons.MessageCircle} title="WhatsApp" value={business.whatsapp} onPress={whatsapp} />}
        {!!business.email && <Row icon={Icons.Mail} title="Email" value={business.email} onPress={email} />}
        {!!business.address && <Row icon={Icons.MapPin} title="Address" value={business.address} onPress={directions} />}
      </View>
      <Text style={[label, { color: colors.muted }]}>Your privacy</Text>
      <View style={[card, styles.list]}>
        <Row icon={Icons.Trash2} title="Your data" value="Delete my data" onPress={forget} />
      </View>
      <Text style={[styles.small, { color: colors.muted }]}>Finished orders and requests are deleted automatically after 90 days.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 32, gap: 12 },
  title: { fontSize: 28, marginTop: 8 },
  box: { padding: 16, gap: 8 },
  list: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12 },
  flex: { flex: 1, gap: 4 },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
});
`;

/** The design for a ready-made app: the business's own color, Appmaker's design rules. */
export function readyDesign(info: ReadyInfo, prompt: string, current?: AppDesign): AppDesign {
  const base = current ?? autoDesign({ primaryColor: info.color }, prompt);
  if (!/^#[0-9a-f]{6}$/i.test(info.color)) return base;
  // The brand gradient goes from the business's color to a deeper shade of it (never a clashing second color).
  const deeper = "#" + [1, 3, 5].map((i) => Math.round(parseInt(info.color.slice(i, i + 2), 16) * 0.7).toString(16).padStart(2, "0")).join("");
  return { ...base, primary: info.color, accent: deeper };
}

/** The files that change when the owner edits their details (the screens stay as they are, even after AI changes). */
export function readyDetailFiles(preset: ReadyPreset, info: ReadyInfo, apiUrl: string | null): FileMap {
  const rules = readyRules(preset, info);
  return { "src/business.js": businessModule(preset, info), [RULES_FILE]: JSON.stringify(rules, null, 2), [DATA_FILE]: dataModule(apiUrl, rules) };
}

/** All the app's files, for a business's details. */
export function readyAppFiles(preset: ReadyPreset, info: ReadyInfo, design: AppDesign, apiUrl: string | null = null): FileMap {
  return {
    "App.js": APP,
    "src/actions.js": ACTIONS,
    "src/screens/HomeScreen.js": HOME,
    "src/screens/ItemsScreen.js": ITEMS,
    "src/screens/RequestScreen.js": REQUEST,
    "src/screens/InfoScreen.js": INFO,
    ...readyDetailFiles(preset, info, apiUrl),
    [THEME_FILE]: themeModule(design),
  };
}

/** The store listing for a ready-made app. */
export function readyListing(slug: string, preset: ReadyPreset, info: ReadyInfo, emoji: string): StoreListing {
  const name = info.name.trim() || "My business";
  const words = WORDS[preset.kind];
  return {
    name: name.slice(0, 30),
    subtitle: (info.tagline.trim() || words.cta).slice(0, 30),
    description: `${name}${info.tagline.trim() ? ` — ${info.tagline.trim()}` : ""}.\n\nSee our ${preset.itemsTab.toLowerCase()}, ${words.cta.toLowerCase()} in a few taps and follow its progress, with our opening hours and one-tap call and directions.\n\nYour details are used only for your ${preset.kind === "order" ? "order" : "request"}, and you can delete them at any time.`,
    keywords: [name, preset.itemsTab, words.tab, slug.replace(/-/g, " ")].join(",").toLowerCase().slice(0, 100),
    category: "Business",
    bundleId: `com.appmaker.${name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30) || "business"}`,
    primaryColor: /^#[0-9a-f]{6}$/i.test(info.color) ? info.color : "#6D5DFB",
    iconEmoji: emoji,
    privacyNotes: "Customers' first name and phone number are used only for their orders or requests. Finished ones are deleted after 90 days.",
  };
}

/** A new project for a ready-made business app: working straight away, with example details to replace. */
export function readyProject(slug: string, template: { title: string; emoji: string; prompt: string }) {
  const preset = READY_PRESETS[slug];
  const info = { ...preset.sample, items: preset.sample.items.map((i) => ({ ...i })) };
  const design = readyDesign(info, template.prompt);
  return {
    name: info.name,
    files: readyAppFiles(preset, info, design),
    design,
    listing: readyListing(slug, preset, info, template.emoji),
    ready: { slug, info },
  };
}
