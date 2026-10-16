import { autoDesign, THEME_FILE, themeModule } from "./design";
import { DATA_FILE, RULES_FILE, dataModule, type DataRules } from "./app-data";
import { STAFF_FILE, staffModule } from "./staff";
import { APP, HOME, ITEMS, REQUEST, UI } from "./ready-app-screens";
import type { AppDesign, ChatMessage, FileMap, SiteSummary, StoreListing } from "./types";

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
  /** A photo link (https): the owner's own upload, or one from their website. */
  image?: string;
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
  /** Where customers can pay online (PayPal.me, a Stripe or Square payment link…); empty: pay in person. */
  payLink?: string;
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
  /** The steps the live tracker shows, when this business has its own (pizza: "In the oven"). */
  stages?: Stage[];
  /** The main button's words, when this business has its own ("Book a test drive"). */
  cta?: string;
  sample: ReadyInfo;
}

/** One step of an order or job: its status word (what staff set), what customers read, a Lucide icon and a short line. */
export type Stage = [status: string, label: string, icon: string, note: string];

const DEFAULT_STAGES: Record<ReadyKind, Stage[]> = {
  order: [
    ["new", "Order received", "ReceiptText", "We've got it and we're on it"],
    ["preparing", "Being prepared", "ChefHat", "Made fresh, just for you"],
    ["ready", "Ready to collect", "ShoppingBag", "Waiting for you at the counter"],
    ["collected", "Collected", "Smile", "Enjoy, and see you soon"],
  ],
  booking: [
    ["new", "Request sent", "Send", "We'll confirm your time shortly"],
    ["confirmed", "Confirmed", "CalendarCheck", "It's in our diary. See you then"],
    ["done", "All done", "Sparkles", "Thanks for coming in"],
  ],
  quote: [
    ["new", "Request sent", "Send", "We'll look at it and reply soon"],
    ["quoted", "Quote sent", "ReceiptText", "We've sent you a price"],
    ["booked", "Booked in", "CalendarCheck", "It's in our diary"],
    ["done", "Job done", "BadgeCheck", "Thanks for choosing us"],
  ],
};

/**
 * The steps the customer's tracker shows: the business's statuses, in their order (they may have
 * added or removed some in "Your data"), with this business's own words and icons where it has them.
 */
export function trackerStages(preset: ReadyPreset, rules?: DataRules | null) {
  const own = new Map(stagesOf(preset).map(([status, label, icon, note]) => [status, { status, label, icon, note }]));
  const statuses = (rules?.requests?.statuses ?? stagesOf(preset).map((st) => st[0])).filter((st) => !/^(cancel|declin|reject)/i.test(st));
  return statuses.map((status) => own.get(status) ?? { status, label: status.charAt(0).toUpperCase() + status.slice(1), icon: "CircleDot", note: "" });
}

/** The tracker's steps for a business: its own, or the usual ones for orders, bookings or quotes. */
export const stagesOf = (preset: ReadyPreset): Stage[] => preset.stages ?? DEFAULT_STAGES[preset.kind];

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
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["preparing", "In the kitchen", "ChefHat", "Our chefs are cooking it now"], ["ready", "Ready to collect", "ShoppingBag", "Packed and waiting for you"], ["collected", "Collected", "Smile", "Enjoy your meal"]],
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
    stages: [["new", "Request sent", "Send", "We'll confirm your time shortly"], ["confirmed", "Confirmed", "CalendarCheck", "Your chair is booked"], ["done", "Looking great", "Sparkles", "Thanks for coming in"]],
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
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["packing", "Being packed", "Package", "Picked and packed with care"], ["ready", "Ready to collect", "ShoppingBag", "Waiting for you at the till"], ["collected", "Collected", "Smile", "Thanks for shopping local"]],
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
    stages: [["new", "Request sent", "Send", "We'll confirm a time shortly"], ["confirmed", "Booked in", "CalendarCheck", "See you at the workshop"], ["in the workshop", "In the workshop", "Wrench", "Our mechanics are on it"], ["ready", "Ready to collect", "CarFront", "Your car is ready to go"], ["collected", "Collected", "Smile", "Drive safe"]],
    sample: contact("Northside Motors", "Honest repairs, done right first time", "#2563EB", hours("8 am – 6 pm", "8 am – 1 pm"), [
      item("Oil & filter change", "About 45 minutes", "from 59", "Servicing"),
      item("Full service", "Checks, fluids, filters · half a day", "from 189", "Servicing"),
      item("Brakes", "Pads and discs, checked free", "from 120", "Repairs"),
      item("Diagnostics", "Warning lights, same day", "45", "Repairs"),
    ]),
  },
  "car-dealership": {
    kind: "booking",
    itemsTab: "Cars",
    itemsIcon: "CarFront",
    cta: "Book a test drive",
    heroIcon: "KeyRound",
    stages: [
      ["new", "Request sent", "Send", "We'll call you to arrange it"],
      ["confirmed", "Test drive booked", "CalendarCheck", "The car will be ready for you"],
      ["done", "All done", "KeyRound", "Thanks for coming in"],
    ],
    sample: contact("Summit Motors", "Quality used cars, every one checked", "#0F172A", hours("9 am – 7 pm", "9 am – 6 pm", "11 am – 4 pm"), [
      item("2021 VW Golf 1.5 TSI", "28,000 miles · Petrol · Manual", "18,995", "Hatchback"),
      item("2020 Toyota RAV4 Hybrid", "34,500 miles · Hybrid · Automatic", "26,450", "SUV"),
      item("2022 Tesla Model 3", "19,000 miles · Electric · Automatic", "29,990", "Electric"),
      item("Part-exchange valuation", "Bring your car in, a price in 20 minutes", "Free", "Services"),
    ]),
  },
  "car-wash-detailing": {
    kind: "booking",
    itemsTab: "Packages",
    itemsIcon: "Droplets",
    cta: "Book a wash",
    heroIcon: "Sparkles",
    stages: [
      ["new", "Request sent", "Send", "We'll confirm your time shortly"],
      ["confirmed", "Booked in", "CalendarCheck", "See you then"],
      ["washing", "Being washed", "Droplets", "Foam, rinse and shine"],
      ["ready", "Ready to collect", "Sparkles", "Gleaming and waiting for you"],
      ["collected", "Collected", "Smile", "Drive safe"],
    ],
    sample: contact("Shine Station", "Hand wash and detailing that lasts", "#0EA5E9", hours("8 am – 6 pm", "8 am – 5 pm", "9 am – 3 pm"), [
      item("Express wash", "Outside hand wash and dry · 20 min", "15", "Washes"),
      item("Full valet", "Inside and out · 90 min", "65", "Valets"),
      item("Ceramic protection", "Lasts up to 12 months · half a day", "from 249", "Detailing"),
      item("Interior deep clean", "Seats, carpets and mats · 2 hours", "85", "Valets"),
    ]),
  },
  bakery: {
    kind: "order",
    itemsTab: "Menu",
    itemsIcon: "Croissant",
    heroIcon: "Croissant",
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["packing", "Being boxed up", "Package", "Fresh from the oven, packed with care"], ["ready", "Ready to collect", "Croissant", "Waiting for you at the counter"], ["collected", "Collected", "Smile", "Enjoy it while it's fresh"]],
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
    stages: [["new", "Request sent", "Send", "We'll reply with a price soon"], ["quoted", "Quote sent", "ReceiptText", "We've sent you a price"], ["booked", "Booked in", "CalendarCheck", "Your clean is in our diary"], ["done", "Sparkling clean", "Sparkles", "Enjoy your fresh space"]],
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
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["in the oven", "In the oven", "Flame", "Stone-baked, nice and hot"], ["ready", "Ready for pickup", "Pizza", "Hot and waiting at the counter"], ["collected", "Collected", "Smile", "Enjoy every slice"]],
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
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["brewing", "Brewing", "Coffee", "Your barista is on it"], ["ready", "Ready at the counter", "CupSoda", "Grab it while it's hot"], ["collected", "Collected", "Smile", "Enjoy, see you tomorrow"]],
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
    stages: [["new", "Request sent", "Send", "We'll confirm your stay shortly"], ["confirmed", "Confirmed", "CalendarCheck", "Your room is waiting"], ["checked in", "Checked in", "KeyRound", "Enjoy your stay"], ["checked out", "Checked out", "Heart", "Thanks for staying with us"]],
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
    stages: [["new", "Request sent", "Send", "We'll confirm a time shortly"], ["confirmed", "Booked in", "CalendarCheck", "We can't wait to meet them"], ["pampering", "Being pampered", "Bath", "Bath, brush and lots of fuss"], ["ready", "Ready for pickup", "PawPrint", "Someone can't wait to see you"], ["collected", "Collected", "Heart", "See you next time"]],
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
    stages: [["new", "Order received", "ReceiptText", "We've got it and we're on it"], ["arranging", "Being arranged", "Flower2", "Hand-tied by our florist"], ["ready", "Ready to collect", "Gift", "Wrapped and ready"], ["collected", "Collected", "Heart", "Hope they love them"]],
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
    stages: [["new", "Booked in", "ReceiptText", "We'll take good care of it"], ["cleaning", "Being cleaned", "WashingMachine", "Washed, pressed and folded"], ["ready", "Ready to collect", "Shirt", "Fresh and waiting for you"], ["collected", "Collected", "Smile", "Looking sharp"]],
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


/**
 * The owner's details change only the menu or services (their starting items). Everything else
 * in the app's data stays as it is: collections, fields and statuses the AI added or changed
 * later are kept, so editing the details never drops data.
 */
export function mergeReadyRules(preset: ReadyPreset, info: ReadyInfo, current?: DataRules | null): DataRules {
  const fresh = readyRules(preset, info);
  if (!current) return fresh;
  const items = current.items ? { ...current.items, seed: fresh.items.seed } : fresh.items;
  return { ...fresh, ...current, items, ...(current.requests ? {} : { requests: fresh.requests }) };
}

/** The data the app keeps: the business's items (it edits them on its owner page) and the requests customers send. */
export function readyRules(preset: ReadyPreset, info: ReadyInfo): DataRules {
  return {
    items: {
      access: "public",
      fields: ["name", "description", "price", "category", "image"],
      seed: info.items
        .filter((i) => i.name.trim())
        .map(({ image, ...i }) => ({ ...i, ...(image && /^https:\/\/[^\s"'<>]{4,500}$/.test(image) ? { image } : {}) })),
    },
    requests: { access: "inbox", fields: requestFields(preset), statuses: [...stagesOf(preset).map((st) => st[0]), "cancelled"] },
  };
}

const WORDS: Record<ReadyKind, { cta: string; tab: string; tabIcon: string; send: string; mine: string; add: string; when: string; whenHint: string; details: string; detailsHint: string }> = {
  order: { cta: "Order for pickup", tab: "Order", tabIcon: "ShoppingBag", send: "Send order", mine: "My orders", add: "Add", when: "Pickup time", whenHint: "e.g. Today 6:30 pm", details: "Note", detailsHint: "Anything we should know (optional)" },
  booking: { cta: "Book now", tab: "Book", tabIcon: "CalendarCheck", send: "Send booking request", mine: "My bookings", add: "Book", when: "Preferred day and time", whenHint: "e.g. Friday morning", details: "Note", detailsHint: "Anything we should know (optional)" },
  quote: { cta: "Get a quote", tab: "Quote", tabIcon: "FileText", send: "Send request", mine: "My requests", add: "Ask", when: "", whenHint: "", details: "Details", detailsHint: "What do you need? Size, timing, anything useful" },
};

/** src/business.js: everything the owner fills in. The only file that changes when they edit their details. */
/** A payment link customers can open: https only, on a known payment service. */
export const PAY_HOSTS = /^(www\.|account\.)?(paypal\.me|paypal\.com|buy\.stripe\.com|checkout\.square\.site|square\.link|venmo\.com|revolut\.me|monzo\.me|cash\.app|ko-fi\.com)$/i;
export function safePayLink(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const path = u.pathname.replace(/\/+$/, "");
    // A payment service's home page isn't a payment link: it needs the shop's own page (paypal.me/yourshop).
    if (!path || path === "/") return "";
    return u.protocol === "https:" || u.protocol === "http:" ? (PAY_HOSTS.test(u.hostname) ? `https://${u.hostname}${path}` : "") : "";
  } catch {
    return "";
  }
}

export function businessModule(preset: ReadyPreset, info: ReadyInfo, rules?: DataRules | null): string {
  const words = WORDS[preset.kind];
  const business = {
    name: info.name.trim() || "My business",
    tagline: info.tagline.trim(),
    phone: info.phone.trim(),
    whatsapp: info.whatsapp.trim(),
    email: info.email.trim(),
    address: info.address.trim(),
    payLink: safePayLink(info.payLink),
    hours: info.hours
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
  return `// Your business details. Change them in Appmaker's "Your details" panel.
export const business = ${JSON.stringify(business, null, 2)};

// How customers reach you and what the app calls things.
export const kind = ${JSON.stringify(preset.kind)};
export const words = ${JSON.stringify({ ...words, ...(preset.cta ? { cta: preset.cta } : {}), items: preset.itemsTab }, null, 2)};
export const icons = ${JSON.stringify({ items: preset.itemsIcon, hero: preset.heroIcon, request: words.tabIcon })};
export const onSite = ${preset.onSite ? "true" : "false"};

// The steps customers follow live, in order: status (what staff set), label, icon and a short line.
export const stages = ${JSON.stringify(trackerStages(preset, rules), null, 2)};
`;
}

/**
 * The payment page for an order, with the amount filled in where the service allows it:
 * PayPal.me and Cash App take it in the link; Venmo also takes the order number as the note.
 * Plain JavaScript (it goes into the app as is, and tests run the same text).
 */
export const PAY_URL_JS = String.raw`function payUrl(link, total, ref) {
  // "$26.50", "26,50 €" and "1,234.50" all become 26.50 / 1234.50.
  let amount = String(total || '').replace(/[^0-9.,]/g, '');
  amount = /,\d{2}$/.test(amount) ? amount.replace(/\./g, '').replace(',', '.') : amount.replace(/,/g, '');
  if (!amount || !(Number(amount) > 0)) return link;
  const note = ref ? 'Order #' + ref : '';
  if (/^https:\/\/(www\.)?paypal\.me\/[^/]+/i.test(link)) return link + '/' + amount;
  if (/^https:\/\/(www\.)?cash\.app\/\$[^/]+$/i.test(link)) return link + '/' + amount;
  const venmo = /^https:\/\/(www\.|account\.)?venmo\.com\/(?:u\/)?([A-Za-z0-9_-]+)$/i.exec(link);
  if (venmo) return 'https://venmo.com/?txn=pay&recipients=' + encodeURIComponent(venmo[2]) + '&amount=' + amount + (note ? '&note=' + encodeURIComponent(note) : '');
  return link;
}`;

const ACTIONS = `import { Alert, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
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

${PAY_URL_JS}

/** Pay online through the business's own link (PayPal.me gets the amount filled in). The app never sees card details. */
export const canPay = !!business.payLink;
export const pay = async (total, onBack, ref) => {
  const url = payUrl(business.payLink, total, ref);
  try {
    // A sheet over the app (Safari / Chrome): the customer pays, taps Done and is back on their order.
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, dismissButtonStyle: 'done' });
  } catch (e) {
    await open(url, 'Pay at ' + business.payLink);
  }
  if (onBack) onBack();
};
`;

const INFO = `import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, label } from '../theme';
import { business } from '../business';
import { forgetMe } from '../appdata';
import StaffScreen from '../staff';
import { SAVED_DETAILS } from './RequestScreen';
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
  // Staff mode: where the business manages orders and requests (behind a staff PIN once the app database is on).
  const [staff, setStaff] = useState(false);
  // The details this phone remembers for orders (name, phone, address): shown here, cleared in one tap.
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(SAVED_DETAILS).then((v) => setSaved(v ? JSON.parse(v) : null)).catch(() => {});
  }, []);
  const clearSaved = () => {
    AsyncStorage.removeItem(SAVED_DETAILS).catch(() => {});
    setSaved(null);
  };
  const forget = () =>
    Alert.alert('Delete my data?', 'Your first name, phone and requests are removed from this app.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await forgetMe();
            await AsyncStorage.removeItem(SAVED_DETAILS).catch(() => {});
            setSaved(null);
            Alert.alert('Your data was deleted.', 'Orders still being prepared stay with ' + business.name + ' until they are finished.');
          } catch (e) {
            Alert.alert("Couldn't delete it", (e && e.message) || 'Try again.');
          }
        },
      },
    ]);
  if (staff) return <StaffScreen onClose={() => setStaff(false)} />;
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
        {saved && (
          <Row
            icon={Icons.UserCheck}
            title="Your saved details (on this phone only)"
            value={[saved.name, saved.phone, saved.address].filter(Boolean).join(' · ') + '  ·  Clear'}
            onPress={clearSaved}
          />
        )}
        <Row icon={Icons.Trash2} title="Your data" value="Delete my data" onPress={forget} />
      </View>
      <Text style={[styles.small, { color: colors.muted }]}>Finished orders and requests are deleted automatically after 90 days.</Text>
      <Text style={[label, { color: colors.muted }]}>For the business</Text>
      <View style={[card, styles.list]}>
        <Row icon={Icons.KeyRound} title="Staff only" value="Staff mode" onPress={() => setStaff(true)} />
      </View>
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
export function readyDetailFiles(preset: ReadyPreset, info: ReadyInfo, apiUrl: string | null, current?: DataRules | null): FileMap {
  const rules = mergeReadyRules(preset, info, current);
  return {
    "src/business.js": businessModule(preset, info, rules),
    [RULES_FILE]: JSON.stringify(rules, null, 2),
    [DATA_FILE]: dataModule(apiUrl, rules),
    [STAFF_FILE]: staffModule(apiUrl),
  };
}

/** All the app's files, for a business's details. */
export function readyAppFiles(preset: ReadyPreset, info: ReadyInfo, design: AppDesign, apiUrl: string | null = null): FileMap {
  return {
    "App.js": APP,
    "src/actions.js": ACTIONS,
    "src/ui.js": UI,
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

const PRICE_AT_END = /\s*(?:[-–—|·:,]\s*)?((?:[$£€]\s?\d[\d.,]*|\d[\d.,]*\s?(?:[$£€]|EUR|USD|GBP)?|free|quote|call us)(?:\s*\/\s*\w+)?)$/i;

/**
 * A menu or price list typed or pasted in, one per line:
 *   Pizza:                              ← a line ending with ":" starts a category
 *   Margherita - Tomato, basil - $11    ← name, description, price
 *   Garlic bread $5                     ← name and price
 */
export function parseItemList(text: string): ReadyItem[] {
  const out: ReadyItem[] = [];
  let category = "";
  for (const raw of text.split(/\r?\n/).slice(0, 200)) {
    const line = raw.replace(/^[\s•*\-–—]+/, "").trim();
    if (!line) continue;
    if (/:$/.test(line) && line.length <= 40) {
      category = line.slice(0, -1).trim();
      continue;
    }
    const m = PRICE_AT_END.exec(line);
    const price = m && /\d|free|quote|call/i.test(m[1]) ? m[1].trim() : "";
    const rest = (price ? line.slice(0, m!.index) : line).trim();
    const [name, ...desc] = rest.split(/\s+[-–—|]\s+|\s*\|\s*/);
    if (!name || name.length > 60) continue;
    out.push({ name: name.trim(), description: desc.join(" — ").trim().slice(0, 140), price: price.replace(/^[$£€]\s+/, (s) => s.trim()), category });
  }
  return out;
}

/** The owner's details filled in from their website (what it doesn't say stays as it was). */
export function infoFromSite(site: SiteSummary, current: ReadyInfo): { info: ReadyInfo; photos: string[] } {
  const c = site.contact;
  const sentence = (site.description || "").split(/(?<=[.!?])\s/)[0].replace(/[.!]$/, "");
  const items = (site.items ?? []).map((i) => ({ name: i.name, description: i.description, price: i.price, category: i.category, ...(i.image ? { image: i.image } : {}) }));
  const info: ReadyInfo = {
    ...current,
    name: site.siteName || current.name,
    tagline: sentence && sentence.length <= 80 ? sentence : current.tagline,
    phone: c?.phones[0] ?? current.phone,
    // The site links to WhatsApp (wa.me/447…, or …?phone=447…): the number.
    whatsapp: (() => {
      const n = /wa\.me\/(\d{6,15})|[?&]phone=(\d{6,15})/.exec(c?.whatsapp ?? "");
      return n ? `+${n[1] ?? n[2]}` : current.whatsapp;
    })(),
    email: c?.emails[0] ?? current.email,
    address: c?.address ?? current.address,
    hours: c?.hours.length ? c.hours.join("\n") : current.hours,
    color: site.colors.find((x) => /^#[0-9a-f]{6}$/i.test(x)) ?? current.color,
    items: items.length ? items : current.items,
  };
  return { info, photos: [...new Set([...items.flatMap((i) => (i.image ? [i.image] : [])), ...(site.images ?? [])])].filter((u) => u.startsWith("https://")).slice(0, 24) };
}

/** Words that say what kind of business a website is, per ready-made app (strong words count double). */
const KINDS: Record<string, { strong: RegExp; weak?: RegExp }> = {
  "pizza-takeaway": { strong: /\b(pizzas?|pizzeria|takeaway|take-away|kebab|burgers?|fried chicken|chippy|fish (and|&) chips)\b/i, weak: /\b(delivery|collection|order online)\b/i },
  "coffee-shop": { strong: /\b(coffee shop|espresso|barista|roastery|caf[eé] bar|latte)\b/i, weak: /\b(coffee|brunch)\b/i },
  bakery: { strong: /\b(bakery|bakers?|patisserie|p[aâ]tisserie|sourdough|cakes? to order|croissants?)\b/i },
  "restaurant-or-cafe": { strong: /\b(restaurant|bistro|trattoria|brasserie|tapas|sushi|dining|eatery|caf[eé])\b/i, weak: /\b(menu|reservations?|chef|dishes)\b/i },
  "salon-or-barber": { strong: /\b(barbers?|barbershop|hair salon|hairdresser|beauty salon|nail salon|nails|lashes|brows|spa)\b/i, weak: /\b(haircuts?|colour|color|styling)\b/i },
  "gym-or-studio": { strong: /\b(gym|fitness|yoga|pilates|crossfit|boxing|martial arts|personal train(er|ing))\b/i, weak: /\b(classes|membership|workout)\b/i },
  "clinic-or-dentist": { strong: /\b(dentist|dental|clinic|physio(therapy)?|chiropract\w*|optician|orthodont\w*|medical cent(er|re)|surgery)\b/i, weak: /\b(patients?|appointments?)\b/i },
  "car-dealership": { strong: /\b(car dealer(ship)?|used cars|cars for sale|approved used|car sales|showroom|part[- ]exchange|test drives?)\b/i, weak: /\b(finance|mileage|stock)\b/i },
  "car-wash-detailing": { strong: /\b(car wash|hand wash|valet(ing)?|detailing|ceramic coating)\b/i },
  "car-repair-auto-shop": { strong: /\b(garage|auto repair|mechanics?|mot\b|car service|tyres?|tires|body shop|auto shop)\b/i, weak: /\b(brakes?|vehicles?|cars?)\b/i },
  "cleaning-service": { strong: /\b(cleaning (services?|company)|cleaners|end of tenancy|deep clean|carpet cleaning|maid)\b/i },
  "home-services": { strong: /\b(plumb(er|ing)|electrician|electrical|roofing|roofer|heating|boiler|handyman|builders?|landscap\w*|joiner|carpenter|locksmith|painter and decorator)\b/i },
  "hotel-or-b-b": { strong: /\b(hotel|b&b|bed and breakfast|guest ?house|inn|holiday (let|cottage)|rooms available)\b/i, weak: /\b(check-in|stay|rooms?)\b/i },
  "pet-grooming-vet": { strong: /\b(dog groom\w*|pet groom\w*|grooming|vets?|veterinary|kennels?|cattery|doggy daycare)\b/i, weak: /\b(dogs?|cats?|pets?)\b/i },
  florist: { strong: /\b(florists?|flower shop|bouquets?|floral)\b/i },
  "driving-school": { strong: /\b(driving (school|lessons?|instructor)|learner drivers?|driving test)\b/i },
  "tutoring-lessons": { strong: /\b(tutor(ing|s)?|tuition|music lessons?|piano lessons?|language school|maths lessons?)\b/i },
  "laundry-dry-cleaning": { strong: /\b(laundr(y|ette)|dry clean(ing|ers)|launderette|alterations|ironing service)\b/i },
  "accountant-or-law-office": { strong: /\b(accountants?|accountancy|bookkeep\w*|tax returns?|solicitors?|law firm|lawyers?|attorneys?|legal services)\b/i },
  "real-estate-agent": { strong: /\b(estate agents?|real estate|realtors?|lettings|properties for (sale|rent)|property management)\b/i },
  "local-shop": { strong: /\b(shop|boutique|store|gift shop|deli|grocer|butcher|off licen[cs]e|bookshop)\b/i, weak: /\b(buy|products?)\b/i },
  "church-or-community": { strong: /\b(church|parish|mosque|temple|synagogue|community cent(er|re)|congregation|worship)\b/i },
};

/**
 * Which ready-made app fits a business's website, or null when none clearly does (a portfolio, a blog,
 * an information site): those get a custom app from the AI instead. The name and description count most.
 */
export function matchReadyPreset(site: Pick<SiteSummary, "siteName" | "title" | "description" | "pages"> & { items?: SiteSummary["items"] }): string | null {
  const head = `${site.siteName} ${site.title} ${site.description}`;
  const body = site.pages
    .slice(0, 4)
    .map((p) => `${p.headings.join(" ")} ${p.text.slice(0, 3000)}`)
    .join(" ");
  const count = (re: RegExp, text: string) => (text.match(new RegExp(re.source, "gi")) ?? []).length;
  let best: { slug: string; score: number } | null = null;
  for (const [slug, k] of Object.entries(KINDS)) {
    if (!READY_PRESETS[slug]) continue;
    const score = 6 * Math.min(count(k.strong, head), 2) + 2 * Math.min(count(k.strong, body), 5) + (k.weak ? Math.min(count(k.weak, head + " " + body), 4) : 0);
    if (!best || score > best.score) best = { slug, score };
  }
  return best && best.score >= 6 ? best.slug : null;
}

/** A ready-made app filled in from the business's website. What the site doesn't say is left empty (never the example business's details). */
export function readyProjectFromSite(slug: string, template: { title: string; emoji: string; prompt: string }, site: SiteSummary) {
  const preset = READY_PRESETS[slug];
  const blank: ReadyInfo = { ...preset.sample, phone: "", whatsapp: "", email: "", address: "", hours: "", items: preset.sample.items.map((i) => ({ ...i })) };
  const { info, photos } = infoFromSite(site, blank);
  const design = readyDesign(info, template.prompt);
  const examples = !(site.items ?? []).length;
  return {
    name: info.name,
    files: readyAppFiles(preset, info, design),
    design,
    listing: readyListing(slug, preset, info, template.emoji),
    ready: { slug, info },
    photos,
    examples,
  };
}

/** The first chat message of an app made from a business's website. */
export function readyWelcome(name: string, title: string, found: string[], examples: boolean): ChatMessage {
  return {
    id: Math.random().toString(36).slice(2, 12),
    role: "assistant",
    content: `Your app for **${name}** is ready and works already, built on the ${title.toLowerCase()} app: customers can browse, order or book, and follow it live.\n\nFrom your website: ${found.length ? found.join(", ") : "your name and colors"}.${examples ? " The menu shows example items for now: replace them in **Your details** (paste a list, or add photos by tapping them on the phone)." : ""}\n\nYour business area is built in: **Staff mode** in the app and your **owner page** (Publish → app database). Want something different? Just ask here.`,
    createdAt: Date.now(),
  };
}
