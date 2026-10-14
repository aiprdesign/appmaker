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
import { READY_PRESETS, readyAppFiles, readyDesign } from "../src/lib/ready-app";
import { BUSINESS_TEMPLATES, TEMPLATES, templateSlug } from "../src/lib/templates";
import { isLucideIcon } from "../src/lib/validate";
import { designIssues } from "../src/lib/app-design";

const SERVER = process.env.SERVER || "http://localhost:3150";
const OUT = path.join(process.cwd(), "public", "templates");

interface Row {
  icon: string;
  title: string;
  meta: string;
  right?: string;
  rightIcon?: string;
}
interface Screen {
  eyebrow: string;
  title: string;
  color: string;
  bg: string;
  /** How the screen is composed, so the templates don't all look alike. */
  layout: "stat" | "feature" | "grid" | "list";
  hero: { icon?: string; big: string; sub: string; progress?: number; button?: string };
  /** Business apps: Open now badge and one-tap actions. */
  open?: string;
  actions?: string[];
  chips?: string[];
  section: string;
  rows: Row[];
  tabs: [string, string][];
  /** Bottom navigation: a curved bar with a raised center button, a floating pill, a floating bar, or a plain bar. */
  nav: "notch" | "notchDark" | "pill" | "float" | "capsule" | "dock" | "orbit" | "bubble" | "topline" | "sheet" | "editorial" | "glass" | "split" | "bar";
  /** The main action's button (a Lucide icon), for notch, orbit and split bars. */
  fab?: string;
  /** The main action's label, for split bars. */
  fabLabel?: string;
  /** A brand-colored header with a curved bottom edge behind the title. */
  header?: "curve";
}

/** Home screens for templates without a sample app. */
const SCREENS: Record<string, Screen> = {
  "recipe-box": {
    nav: "float",
    layout: "feature",
    eyebrow: "What's cooking",
    title: "Recipes",
    color: "#D97706",
    bg: "#FFFBF5",
    hero: { icon: "CookingPot", big: "Creamy tomato pasta", sub: "25 min · Easy · 4 servings", button: "Cook now" },
    chips: ["All", "Quick", "Veggie", "Dessert"],
    section: "This week",
    rows: [
      { icon: "Salad", title: "Greek salad", meta: "10 min · Veggie", rightIcon: "Heart" },
      { icon: "Soup", title: "Chickpea curry", meta: "35 min · Vegan", rightIcon: "Heart" },
      { icon: "Croissant", title: "Fluffy pancakes", meta: "20 min · Breakfast" },
    ],
    tabs: [
      ["BookOpen", "Recipes"],
      ["CalendarDays", "Plan"],
      ["Heart", "Saved"],
    ],
  },
  "language-flashcards": {
    nav: "dock",
    layout: "stat",
    eyebrow: "Spanish · Day 12",
    title: "Study",
    color: "#0284C7",
    bg: "#F5FAFE",
    hero: { icon: "Languages", big: "18 / 25 cards", sub: "Daily goal: almost there", progress: 0.72 },
    section: "Decks",
    rows: [
      { icon: "Apple", title: "Food & drink", meta: "42 cards · 8 due", right: "Study" },
      { icon: "Plane", title: "Travel phrases", meta: "30 cards · 3 due", right: "Study" },
      { icon: "House", title: "At home", meta: "26 cards · all done", rightIcon: "Check" },
    ],
    tabs: [
      ["Library", "Decks"],
      ["Target", "Review"],
      ["TrendingUp", "Progress"],
    ],
  },
  "plant-care": {
    nav: "capsule",
    layout: "grid",
    eyebrow: "Today",
    title: "My plants",
    color: "#15803D",
    bg: "#F6FBF7",
    hero: { icon: "Droplet", big: "2 need water", sub: "Monstera and Basil are thirsty", button: "Water all" },
    section: "Your plants",
    rows: [
      { icon: "Sprout", title: "Monstera", meta: "Water today · Living room", rightIcon: "Droplet" },
      { icon: "Leaf", title: "Basil", meta: "Water today · Kitchen", rightIcon: "Droplet" },
      { icon: "Sprout", title: "Cactus", meta: "In 9 days · Office", rightIcon: "Check" },
    ],
    tabs: [
      ["Sprout", "Plants"],
      ["NotebookPen", "Log"],
      ["Settings", "Settings"],
    ],
  },
  "event-countdown": {
    nav: "orbit",
    fab: "Plus",
    layout: "stat",
    eyebrow: "Coming up",
    title: "Countdowns",
    color: "#DB2777",
    bg: "#FFF7FB",
    hero: { icon: "Plane", big: "12 days", sub: "Trip to Lisbon · Oct 12" },
    section: "Upcoming",
    rows: [
      { icon: "Cake", title: "Mia's birthday", meta: "Nov 3 · Family", right: "34d" },
      { icon: "Gift", title: "Holidays", meta: "Dec 24 · Break", right: "85d" },
      { icon: "Rocket", title: "App launch", meta: "Jan 15 · Work", right: "107d" },
    ],
    tabs: [
      ["Hourglass", "Events"],
      ["Plus", "Add"],
      ["LayoutGrid", "Categories"],
    ],
  },
  "restaurant-or-cafe": {
    nav: "bubble",
    header: "curve",
    layout: "feature",
    eyebrow: "Trattoria · Brooklyn",
    title: "Luigi's",
    color: "#B91C1C",
    bg: "#FFF8F6",
    open: "Open now · until 11 pm",
    hero: { icon: "Pizza", big: "Today's special", sub: "Wood-fired truffle pizza · $18", button: "Book a table" },
    actions: ["Call", "Directions", "Order"],
    section: "Menu favourites",
    rows: [
      { icon: "CookingPot", title: "Cacio e pepe", meta: "Handmade pasta · V", right: "$19" },
      { icon: "Pizza", title: "Margherita", meta: "San Marzano, fior di latte", right: "$16" },
      { icon: "CakeSlice", title: "Tiramisu", meta: "House recipe", right: "$9" },
    ],
    tabs: [
      ["House", "Home"],
      ["UtensilsCrossed", "Menu"],
      ["Star", "Rewards"],
    ],
  },
  "salon-or-barber": {
    nav: "pill",
    layout: "stat",
    eyebrow: "Studio Luxe",
    title: "Book a visit",
    color: "#9D174D",
    bg: "#FFF7FA",
    open: "Open now · until 7 pm",
    hero: { icon: "Scissors", big: "4 of 6 visits", sub: "2 more for 20% off", progress: 0.66 },
    actions: ["Book", "WhatsApp", "Directions"],
    section: "Services",
    rows: [
      { icon: "Scissors", title: "Cut & blow-dry", meta: "45 min · with Ana", right: "$55" },
      { icon: "Palette", title: "Colour & gloss", meta: "90 min · with Jo", right: "$120" },
      { icon: "Scissors", title: "Beard trim", meta: "20 min · with Sam", right: "$25" },
    ],
    tabs: [
      ["House", "Home"],
      ["Scissors", "Services"],
      ["Gift", "Loyalty"],
    ],
  },
  "gym-or-studio": {
    nav: "notchDark",
    fab: "QrCode",
    layout: "list",
    eyebrow: "Iron Yard Gym",
    title: "Today's classes",
    color: "#1D4ED8",
    bg: "#F5F8FF",
    open: "Open now · 5 am – 11 pm",
    hero: { icon: "Flame", big: "6-day streak", sub: "You checked in yesterday", button: "Check in" },
    chips: ["All", "HIIT", "Yoga", "Spin"],
    section: "Up next",
    rows: [
      { icon: "Bike", title: "Spin 45", meta: "6:00 pm · Studio B · 4 spots", right: "Book" },
      { icon: "Flower2", title: "Flow yoga", meta: "7:00 pm · Studio A", right: "Book" },
      { icon: "Dumbbell", title: "Strength basics", meta: "7:30 pm · Floor", right: "Book" },
    ],
    tabs: [
      ["CalendarDays", "Classes"],
      ["CreditCard", "Membership"],
      ["MapPin", "Visit"],
    ],
  },
  "clinic-or-dentist": {
    nav: "topline",
    header: "curve",
    layout: "list",
    eyebrow: "Bright Smile Dental",
    title: "Hello, Sam",
    color: "#0F766E",
    bg: "#F4FBFA",
    open: "Open now · until 6 pm",
    hero: { icon: "CalendarDays", big: "Check-up · Tue 10:30", sub: "Reminder set for the day before" },
    actions: ["Call", "Book", "Directions"],
    section: "Our services",
    rows: [
      { icon: "Smile", title: "Check-up & clean", meta: "About 45 minutes" },
      { icon: "Sparkles", title: "Whitening", meta: "Consultation first" },
      { icon: "Stethoscope", title: "Meet the team", meta: "4 practitioners" },
    ],
    tabs: [
      ["House", "Home"],
      ["Stethoscope", "Services"],
      ["Info", "Visit"],
    ],
  },
  "local-shop": {
    nav: "sheet",
    layout: "grid",
    eyebrow: "Maple & Co.",
    title: "New in",
    color: "#6D28D9",
    bg: "#FAF7FF",
    open: "Open now · until 8 pm",
    hero: { icon: "Tag", big: "Weekend offer", sub: "15% off candles & home scents", button: "Shop the offer" },
    chips: ["All", "Home", "Gifts", "Kitchen"],
    section: "Popular",
    rows: [
      { icon: "Flame", title: "Fig & cedar candle", meta: "Home · 40 h burn", right: "$28" },
      { icon: "ShoppingBasket", title: "Woven basket", meta: "Handmade", right: "$42" },
      { icon: "Coffee", title: "Stoneware mug", meta: "Kitchen · 4 colours", right: "$18" },
    ],
    tabs: [
      ["ShoppingBag", "Shop"],
      ["Heart", "Wishlist"],
      ["Gift", "Rewards"],
    ],
  },
  "church-or-community": {
    nav: "editorial",
    layout: "list",
    eyebrow: "Grace Community",
    title: "This week",
    color: "#A16207",
    bg: "#FFFBF2",
    hero: { icon: "Church", big: "Sunday service", sub: "9:00 & 11:00 am · Main hall", button: "Remind me" },
    actions: ["Prayer", "Give", "Directions"],
    section: "Events",
    rows: [
      { icon: "Music", title: "Choir practice", meta: "Thu 7 pm · Chapel" },
      { icon: "Soup", title: "Community dinner", meta: "Fri 6 pm · Hall", right: "RSVP" },
      { icon: "Users", title: "Family morning", meta: "Sat 10 am · Garden" },
    ],
    tabs: [
      ["House", "Home"],
      ["CalendarDays", "Events"],
      ["NotebookPen", "Notes"],
    ],
  },
  "real-estate-agent": {
    nav: "glass",
    header: "curve",
    layout: "feature",
    eyebrow: "Harbor Homes",
    title: "Featured",
    color: "#0F766E",
    bg: "#F5FAF9",
    hero: { icon: "House", big: "$649,000", sub: "3 bd · 2 ba · 1,850 sq ft · Oak St", button: "Book a viewing" },
    chips: ["Buy", "Rent", "Saved", "Open house"],
    section: "New listings",
    rows: [
      { icon: "House", title: "Maple Ave townhouse", meta: "2 bd · 2 ba · 1,200 sq ft", right: "$489k" },
      { icon: "Building2", title: "Harbor view condo", meta: "1 bd · 1 ba · 780 sq ft", right: "$395k" },
      { icon: "Trees", title: "Family home, Elm Rd", meta: "4 bd · 3 ba · 2,400 sq ft", right: "$825k" },
    ],
    tabs: [
      ["Search", "Search"],
      ["Heart", "Saved"],
      ["Calculator", "Mortgage"],
    ],
  },
  "home-services": {
    nav: "split",
    fab: "Phone",
    fabLabel: "Call now",
    layout: "grid",
    eyebrow: "FixRight Plumbing",
    title: "How can we help?",
    color: "#EA580C",
    bg: "#FFF8F3",
    open: "Open now · 24/7 emergencies",
    hero: { icon: "Wrench", big: "Get a free quote", sub: "Reply within 2 hours", button: "Request a quote" },
    actions: ["Call", "WhatsApp", "Reviews"],
    section: "Services",
    rows: [
      { icon: "ShowerHead", title: "Leaks & repairs", meta: "Same-day visits", right: "from $89" },
      { icon: "Flame", title: "Boiler service", meta: "Annual check", right: "from $120" },
      { icon: "Bath", title: "Bathroom fitting", meta: "Free survey", right: "Quote" },
    ],
    tabs: [
      ["House", "Home"],
      ["ReceiptText", "Quotes"],
      ["MapPin", "Areas"],
    ],
  },
  "car-repair-auto-shop": {
    nav: "notch",
    fab: "Wrench",
    layout: "stat",
    eyebrow: "Northside Motors",
    title: "Your car",
    color: "#2563EB",
    bg: "#F5F8FF",
    open: "Open now · until 6 pm",
    hero: { icon: "CarFront", big: "Ready to collect", sub: "VW Golf · Brakes & oil change · $245", progress: 1, button: "Get directions" },
    actions: ["Call", "WhatsApp", "Directions"],
    section: "Services",
    rows: [
      { icon: "Droplet", title: "Oil & filter change", meta: "About 45 minutes", right: "from $59" },
      { icon: "Disc", title: "Brakes", meta: "Pads and discs, checked free", right: "from $120" },
      { icon: "Gauge", title: "Diagnostics", meta: "Warning lights, same day", right: "$45" },
    ],
    tabs: [
      ["House", "Home"],
      ["ClipboardList", "Requests"],
      ["CalendarClock", "Reminders"],
    ],
  },
  bakery: {
    nav: "capsule",
    layout: "feature",
    eyebrow: "Crumb & Co.",
    title: "Fresh today",
    color: "#B45309",
    bg: "#FFFAF3",
    open: "Open now · until 4 pm",
    hero: { icon: "Croissant", big: "Almond croissants", sub: "Out of the oven at 8:00 · $3.80", button: "Pre-order" },
    chips: ["All", "Bread", "Pastries", "Cakes"],
    section: "Baked this morning",
    rows: [
      { icon: "Wheat", title: "Sourdough loaf", meta: "48-hour ferment · Vegan", right: "$7" },
      { icon: "Cake", title: "Custom celebration cake", meta: "Order 3 days ahead", right: "from $45" },
      { icon: "Cookie", title: "Brown butter cookies", meta: "Contains nuts", right: "$2.50" },
    ],
    tabs: [
      ["Croissant", "Menu"],
      ["ShoppingBag", "Pre-orders"],
      ["Gift", "Rewards"],
    ],
  },
  "pizza-takeaway": {
    nav: "bubble",
    header: "curve",
    layout: "feature",
    eyebrow: "Tony's Pizza · Delivery & pickup",
    title: "Hungry?",
    color: "#DC2626",
    bg: "#FFF7F5",
    open: "Open now · until 11 pm",
    hero: { icon: "Pizza", big: "2 large for $25", sub: "Tuesday deal · pickup or delivery", button: "Order now" },
    actions: ["Call", "Order", "Directions"],
    section: "Most ordered",
    rows: [
      { icon: "Pizza", title: "Pepperoni", meta: "Large · extra cheese +$2", right: "$16" },
      { icon: "Flame", title: "Spicy Diavola", meta: "Chili, salami, mozzarella", right: "$17" },
      { icon: "Salad", title: "Garden salad", meta: "Side · vegan", right: "$7" },
    ],
    tabs: [
      ["House", "Home"],
      ["UtensilsCrossed", "Menu"],
      ["ShoppingBag", "Orders"],
    ],
  },
  "coffee-shop": {
    nav: "pill",
    layout: "stat",
    eyebrow: "Morning Ritual Coffee",
    title: "Good morning",
    color: "#7C4A2D",
    bg: "#FBF7F3",
    open: "Open now · until 5 pm",
    hero: { icon: "Coffee", big: "7 of 9 stamps", sub: "2 more for a free coffee", progress: 0.78 },
    chips: ["Coffee", "Tea", "Food"],
    section: "Order ahead",
    rows: [
      { icon: "Coffee", title: "Flat white", meta: "Oat milk +$0.50", right: "$4.20" },
      { icon: "CupSoda", title: "Iced latte", meta: "Double shot", right: "$4.80" },
      { icon: "Croissant", title: "Butter croissant", meta: "Baked this morning", right: "$3.50" },
    ],
    tabs: [
      ["Coffee", "Order"],
      ["Gift", "Stamps"],
      ["MapPin", "Visit"],
    ],
  },
  "hotel-or-b-b": {
    nav: "glass",
    header: "curve",
    layout: "list",
    eyebrow: "The Harbour Inn",
    title: "Welcome",
    color: "#0F766E",
    bg: "#F3FAF8",
    hero: { icon: "BedDouble", big: "Sea view double", sub: "Breakfast included · from $140 a night", button: "Request dates" },
    actions: ["Call", "WhatsApp", "Directions"],
    section: "Guest guide",
    rows: [
      { icon: "Wifi", title: "Wi-Fi", meta: "HarbourGuest · password at reception" },
      { icon: "Coffee", title: "Breakfast", meta: "7:30 – 10:00 · Garden room" },
      { icon: "Clock", title: "Check-out", meta: "By 11:00 · late check-out on request" },
    ],
    tabs: [
      ["BedDouble", "Rooms"],
      ["BookOpen", "Guide"],
      ["Map", "Explore"],
    ],
  },
  "pet-grooming-vet": {
    nav: "dock",
    layout: "stat",
    eyebrow: "Happy Paws",
    title: "Hi, Luna's human",
    color: "#7C3AED",
    bg: "#F8F5FF",
    open: "Open now · until 7 pm",
    hero: { icon: "PawPrint", big: "Ready for pickup", sub: "Luna · Full groom · $55", progress: 1 },
    section: "Services",
    rows: [
      { icon: "Scissors", title: "Full groom", meta: "Bath, cut and nails · small dogs", right: "from $45" },
      { icon: "Syringe", title: "Vaccinations", meta: "Reminder set for March", right: "$35" },
      { icon: "Stethoscope", title: "Check-up", meta: "About 20 minutes", right: "$40" },
    ],
    tabs: [
      ["PawPrint", "Home"],
      ["CalendarCheck", "Visits"],
      ["Bell", "Reminders"],
    ],
  },
  florist: {
    nav: "editorial",
    layout: "grid",
    eyebrow: "Petal & Stem",
    title: "Fresh flowers",
    color: "#DB2777",
    bg: "#FFF6FA",
    open: "Open now · same-day delivery until 2 pm",
    hero: { icon: "Flower2", big: "Seasonal bouquet", sub: "Peonies and garden roses · $55", button: "Send flowers" },
    chips: ["Birthday", "Love", "Sympathy"],
    section: "Bestsellers",
    rows: [
      { icon: "Flower", title: "Blush roses", meta: "12 stems", right: "$65" },
      { icon: "Sprout", title: "Potted orchid", meta: "Lasts for months", right: "$40" },
      { icon: "Gift", title: "Gift box", meta: "Flowers and chocolates", right: "$75" },
    ],
    tabs: [
      ["Flower2", "Shop"],
      ["ShoppingBag", "Orders"],
      ["Info", "Care"],
    ],
  },
  "driving-school": {
    nav: "notchDark",
    fab: "CalendarPlus",
    layout: "stat",
    eyebrow: "Green Light Driving School",
    title: "Your progress",
    color: "#1D4ED8",
    bg: "#F4F7FF",
    hero: { icon: "Car", big: "14 of 20 lessons", sub: "Next: Thursday 4:00 pm with Sam", progress: 0.7 },
    section: "Get test ready",
    rows: [
      { icon: "TrafficCone", title: "Theory quiz", meta: "42 of 50 road signs right", right: "84%" },
      { icon: "Route", title: "Test routes", meta: "3 routes near the test centre" },
      { icon: "BadgeCheck", title: "Mock test", meta: "Book with your instructor", right: "$55" },
    ],
    tabs: [
      ["House", "Home"],
      ["GraduationCap", "Theory"],
      ["CalendarDays", "Lessons"],
    ],
  },
  "tutoring-lessons": {
    nav: "topline",
    layout: "list",
    eyebrow: "Bright Minds Tutoring",
    title: "This week",
    color: "#4F46E5",
    bg: "#F6F6FF",
    hero: { icon: "BookOpenCheck", big: "Maths · Thu 5 pm", sub: "With Priya · algebra practice" },
    actions: ["Call", "WhatsApp", "Email"],
    section: "Subjects",
    rows: [
      { icon: "Sigma", title: "Maths", meta: "Ages 11–18 · exam prep", right: "$35/h" },
      { icon: "FlaskConical", title: "Science", meta: "Biology, chemistry, physics", right: "$35/h" },
      { icon: "Languages", title: "English", meta: "Reading and essays", right: "$30/h" },
    ],
    tabs: [
      ["House", "Home"],
      ["NotebookPen", "Notes"],
      ["CalendarDays", "Lessons"],
    ],
  },
  "laundry-dry-cleaning": {
    nav: "orbit",
    fab: "Truck",
    layout: "stat",
    eyebrow: "Fresh Press Laundry",
    title: "Your order",
    color: "#0284C7",
    bg: "#F2F9FD",
    open: "Open now · until 8 pm",
    hero: { icon: "Shirt", big: "Ready for pickup", sub: "#7B2E · 5 shirts, 1 suit · $38", progress: 1 },
    section: "Prices",
    rows: [
      { icon: "WashingMachine", title: "Wash & fold", meta: "Next day", right: "$2/lb" },
      { icon: "Shirt", title: "Dry cleaning", meta: "Suits, dresses, coats", right: "from $8" },
      { icon: "Scissors", title: "Alterations", meta: "Hems and repairs", right: "from $12" },
    ],
    tabs: [
      ["House", "Home"],
      ["ClipboardList", "Orders"],
    ],
  },
  "accountant-or-law-office": {
    nav: "sheet",
    layout: "list",
    eyebrow: "Carter & Lane Accountants",
    title: "How can we help?",
    color: "#334155",
    bg: "#F6F7F9",
    open: "Open now · until 5:30 pm",
    hero: { icon: "CalendarClock", big: "Tax return due Jan 31", sub: "Reminder set · documents checklist ready", button: "Book a meeting" },
    actions: ["Call", "Email", "Directions"],
    section: "Services",
    rows: [
      { icon: "Calculator", title: "Personal tax returns", meta: "Self-employed and landlords" },
      { icon: "Building2", title: "Small business accounts", meta: "Bookkeeping and payroll" },
      { icon: "FileText", title: "Documents checklist", meta: "What to bring to your first meeting" },
    ],
    tabs: [
      ["House", "Home"],
      ["CalendarDays", "Dates"],
      ["Users", "Team"],
    ],
  },
  "cleaning-service": {
    nav: "float",
    layout: "list",
    eyebrow: "Sparkle Home Cleaning",
    title: "A cleaner home",
    color: "#0891B2",
    bg: "#F2FBFD",
    open: "Booking now · Mon–Sat",
    hero: { icon: "Sparkles", big: "Book a clean", sub: "Quote within the hour · Insured cleaners", button: "Request a quote" },
    actions: ["Call", "WhatsApp", "Reviews"],
    section: "Services",
    rows: [
      { icon: "House", title: "Regular home clean", meta: "Weekly or every 2 weeks", right: "from $90" },
      { icon: "SprayCan", title: "Deep clean", meta: "Kitchen, bathrooms, inside cupboards", right: "from $180" },
      { icon: "KeyRound", title: "End of tenancy", meta: "Checklist for your deposit", right: "Quote" },
    ],
    tabs: [
      ["House", "Home"],
      ["CalendarCheck", "Bookings"],
      ["MapPin", "Areas"],
    ],
  },
};

/** Action labels and their icons (business apps). */
const ACTION_ICONS: Record<string, string> = { Call: "Phone", Directions: "Navigation", Book: "CalendarCheck", Order: "Bike", WhatsApp: "MessageCircle", Quote: "ReceiptText", Visit: "MapPin", Email: "Mail", Prayer: "HandHeart", Give: "HeartHandshake", Reviews: "Star" };

/**
 * One-screen app that draws a Screen, following Appmaker's modern design rules:
 * Lucide icons (no emoji), a calm surface with the brand color saved for the hero
 * and the primary action, a short type scale, left alignment, grouped lists and a
 * composition chosen per template (big number, feature card, tile grid, list).
 */
function screenApp(screen: Screen): string {
  // A notch bar needs the same number of tabs on each side of its center button.
  const s = (screen.nav === "notch" || screen.nav === "notchDark") && screen.tabs.length % 2 ? { ...screen, tabs: [...screen.tabs, ["CircleUser", "Profile"] as [string, string]] } : screen;
  const icons = [
    ...new Set([
      ...(s.hero.icon ? [s.hero.icon] : []),
      ...s.rows.flatMap((r) => [r.icon, ...(r.rightIcon ? [r.rightIcon] : [])]),
      ...s.tabs.map(([i]) => i),
      ...(s.fab ? [s.fab] : []),
      ...(s.actions ?? []).map((a) => {
        if (!ACTION_ICONS[a]) throw new Error(`No icon for the action ${a}`);
        return ACTION_ICONS[a];
      }),
      "ChevronRight",
    ]),
  ];
  for (const i of icons) if (!isLucideIcon(i)) throw new Error(`Not a Lucide icon: ${i}`);
  return `import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { ${icons.join(", ")} } from 'lucide-react-native';

const S = ${JSON.stringify(s)};
const ICON = { ${icons.join(", ")} };
const ACTION = ${JSON.stringify(ACTION_ICONS)};
const C = { ink: '#0C0C0E', muted: '#6A6A72', line: '#E6E5E1', surface: '#FFFFFF', open: '#15803D', onBrand: '#FFFFFF', dim: 'rgba(255,255,255,0.6)' };
const tint = S.color + '14';
const tint2 = S.color + '1F';
const Icon = ({ name, size = 20, color = S.color, strokeWidth = 2 }) => {
  const I = ICON[name];
  return I ? <I size={size} color={color} strokeWidth={strokeWidth} /> : null;
};

function Hero() {
  const h = S.hero;
  if (S.layout === 'stat' || S.header === 'curve') {
    return (
      <View style={[styles.card, { padding: 20, marginTop: 24 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.big}>{h.big}</Text>
            <Text style={[styles.sub, { marginTop: 4 }]}>{h.sub}</Text>
          </View>
          {h.icon ? (
            <View style={[styles.tile, { width: 48, height: 48 }]}>
              <Icon name={h.icon} size={24} />
            </View>
          ) : null}
        </View>
        {h.progress != null ? (
          <View style={{ height: 6, borderRadius: 999, backgroundColor: tint, marginTop: 20, overflow: 'hidden' }}>
            <View style={{ height: 6, width: Math.round(h.progress * 100) + '%', backgroundColor: S.color, borderRadius: 999 }} />
          </View>
        ) : null}
        {h.button ? (
          <View style={[styles.primary, { marginTop: 20 }]}>
            <Text style={styles.primaryText}>{h.button}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ marginTop: 24, borderRadius: 24, backgroundColor: S.color, padding: 20, overflow: 'hidden', minHeight: 196, justifyContent: 'flex-end' }}>
      {h.icon ? (
        <View style={{ position: 'absolute', right: -24, top: -24, width: 160, height: 160, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={h.icon} size={64} color={C.onBrand} strokeWidth={1.5} />
        </View>
      ) : null}
      <Text style={[styles.big, { color: C.onBrand, maxWidth: '78%' }]}>{h.big}</Text>
      <Text style={[styles.sub, { color: C.onBrand, opacity: 0.85, marginTop: 4 }]}>{h.sub}</Text>
      {h.button ? (
        <View style={{ alignSelf: 'flex-start', marginTop: 16, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 16, height: 44, justifyContent: 'center' }}>
          <Text style={[styles.primaryText, { color: S.color }]}>{h.button}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Rows() {
  if (S.layout === 'grid') {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {S.rows.map((r, i) => (
          <View key={r.title} style={[styles.card, { width: i === S.rows.length - 1 && S.rows.length % 2 ? '100%' : '47.5%', padding: 16 }]}>
            <View style={styles.tile}>
              <Icon name={r.icon} />
            </View>
            <Text style={[styles.rowTitle, { marginTop: 12 }]} numberOfLines={2}>{r.title}</Text>
            <Text style={styles.meta} numberOfLines={2}>{r.meta}</Text>
            {r.right ? <Text style={[styles.value, { marginTop: 8 }]}>{r.right}</Text> : null}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.card}>
      {S.rows.map((r, i) => (
        <View key={r.title} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 64 }}>
          <View style={styles.tile}>
            <Icon name={r.icon} />
          </View>
          <View style={{ flex: 1, marginLeft: 12, paddingVertical: 12, borderBottomWidth: i < S.rows.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.title}</Text>
              <Text style={styles.meta}>{r.meta}</Text>
            </View>
            {r.rightIcon ? <Icon name={r.rightIcon} size={20} /> : r.right ? <Text style={styles.value}>{r.right}</Text> : <Icon name="ChevronRight" size={20} color={C.muted} />}
          </View>
        </View>
      ))}
    </View>
  );
}


/** The bottom navigation, in the screen's own style (every app has a different one). */
function Nav() {
  const tabs = S.tabs;
  switch (S.nav) {
    case 'pill':
      // A floating dark pill; the current tab opens into a brand chip with its label.
      return (
        <View style={[styles.floating, { backgroundColor: C.ink, height: 64, borderRadius: 999, paddingHorizontal: 8 }]}>
          {tabs.map(([icon, label], i) =>
            i === 0 ? (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 20, borderRadius: 999, backgroundColor: S.color }}>
                <Icon name={icon} size={20} color={C.onBrand} />
                <Text style={[styles.sub, { color: C.onBrand, fontWeight: '600', marginLeft: 8 }]}>{label}</Text>
              </View>
            ) : (
              <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                <Icon name={icon} size={24} color={C.dim} strokeWidth={1.75} />
              </View>
            ),
          )}
        </View>
      );
    case 'float':
      // A floating rounded bar; a short brand line marks the current tab.
      return (
        <View style={[styles.floating, { backgroundColor: C.surface, height: 72, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Icon name={icon} size={24} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              <View style={{ width: i ? 4 : 16, height: 4, borderRadius: 999, marginTop: 8, backgroundColor: i ? 'transparent' : S.color }} />
            </View>
          ))}
        </View>
      );
    case 'capsule':
      // A light floating bar; the current tab sits in a soft brand capsule with its label.
      return (
        <View style={[styles.floating, { backgroundColor: C.surface, height: 68, borderRadius: 999, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={i ? { flex: 1, alignItems: 'center' } : { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 18, borderRadius: 999, backgroundColor: tint2 }}>
              <Icon name={icon} size={22} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              {i ? null : <Text style={[styles.sub, { color: S.color, fontWeight: '600', marginLeft: 8 }]}>{label}</Text>}
            </View>
          ))}
        </View>
      );
    case 'dock':
      // A dock of rounded tiles; the current one is filled with the brand color.
      return (
        <View style={[styles.floating, { left: 32, right: 32, backgroundColor: C.surface, borderRadius: 24, padding: 8, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: i ? tint : S.color }}>
              <Icon name={icon} size={22} color={i ? S.color : C.onBrand} />
              <Text style={[styles.meta, { marginTop: 4, color: i ? S.color : C.onBrand, fontWeight: '600' }]}>{label}</Text>
            </View>
          ))}
        </View>
      );
    case 'orbit':
      // Separate floating circles, one per tab; the current one is filled.
      return (
        <View style={[styles.floating, { left: 0, right: 0, justifyContent: 'center', gap: 16, shadowOpacity: 0 }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={[styles.orb, i ? { backgroundColor: C.surface } : { backgroundColor: S.color, width: 64, height: 64 }]}>
              <Icon name={icon} size={i ? 22 : 26} color={i ? C.ink : C.onBrand} strokeWidth={i ? 1.75 : 2.25} />
            </View>
          ))}
          {S.fab ? (
            <View style={[styles.orb, { backgroundColor: C.ink }]}>
              <Icon name={S.fab} size={22} color={C.onBrand} />
            </View>
          ) : null}
        </View>
      );
    case 'bubble': {
      // The current tab's icon rises out of the bar in a brand circle.
      return (
        <View style={styles.bar}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              {i ? (
                <Icon name={icon} size={24} color={C.muted} strokeWidth={1.75} />
              ) : (
                <View style={{ marginTop: -40, width: 60, height: 60, borderRadius: 999, backgroundColor: S.color, borderWidth: 6, borderColor: S.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={24} color={C.onBrand} strokeWidth={2.25} />
                </View>
              )}
              <Text style={[styles.meta, { marginTop: 4, color: i ? C.muted : S.color, fontWeight: i ? '500' : '600' }]}>{label}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'notch':
    case 'notchDark': {
      // A bar with a curved notch holding a raised round button for the main action.
      const dark = S.nav === 'notchDark';
      const left = tabs.slice(0, Math.ceil(tabs.length / 2));
      const right = tabs.slice(left.length);
      const tab = ([icon, label], i, first) => (
        <View key={label} style={{ flex: 1, alignItems: 'center' }}>
          <Icon name={icon} size={24} color={first ? (dark ? C.onBrand : S.color) : dark ? C.dim : C.muted} strokeWidth={first ? 2.25 : 1.75} />
          <Text style={[styles.meta, { marginTop: 4, color: first ? (dark ? C.onBrand : S.color) : dark ? C.dim : C.muted, fontWeight: first ? '600' : '500' }]}>{label}</Text>
        </View>
      );
      return (
        <View style={[styles.bar, dark && { backgroundColor: C.ink, borderTopWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
          <View style={styles.notch} />
          {left.map((t, i) => tab(t, i, i === 0))}
          <View style={{ width: 88 }} />
          {right.map((t, i) => tab(t, i, false))}
          <View style={styles.fab}>
            <Icon name={S.fab} size={28} color={C.onBrand} strokeWidth={2.25} />
          </View>
        </View>
      );
    }
    case 'topline':
      // A plain bar; the current tab gets a brand line along the top edge and a tinted column.
      return (
        <View style={[styles.bar, { paddingTop: 0 }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', paddingTop: 12, backgroundColor: i ? 'transparent' : tint }}>
              <View style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 3, borderBottomLeftRadius: 999, borderBottomRightRadius: 999, backgroundColor: i ? 'transparent' : S.color }} />
              <Icon name={icon} size={24} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              <Text style={[styles.meta, { marginTop: 4, color: i ? C.muted : S.color, fontWeight: i ? '500' : '600' }]}>{label}</Text>
            </View>
          ))}
        </View>
      );
    case 'sheet':
      // A brand-colored bar with big rounded top corners, like a sheet; a dot under the current tab.
      return (
        <View style={[styles.bar, { backgroundColor: S.color, borderTopWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16 }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', opacity: i ? 0.65 : 1 }}>
              <Icon name={icon} size={24} color={C.onBrand} strokeWidth={i ? 1.75 : 2.25} />
              <Text style={[styles.meta, { marginTop: 4, color: C.onBrand, fontWeight: i ? '500' : '600' }]}>{label}</Text>
              <View style={{ width: 4, height: 4, borderRadius: 999, marginTop: 4, backgroundColor: i ? 'transparent' : C.onBrand }} />
            </View>
          ))}
        </View>
      );
    case 'editorial':
      // Words only, like a magazine: the current tab is ink with a brand underline.
      return (
        <View style={[styles.bar, { paddingTop: 16, paddingHorizontal: 12 }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.sub, { color: i ? C.muted : C.ink, fontWeight: i ? '500' : '700', letterSpacing: 0.2 }]}>{label}</Text>
              <View style={{ width: 24, height: 2, marginTop: 8, borderRadius: 999, backgroundColor: i ? 'transparent' : S.color }} />
            </View>
          ))}
        </View>
      );
    case 'glass':
      // A frosted floating bar; only the current tab shows its label.
      return (
        <View style={[styles.floating, { height: 72, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' }]}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Icon name={icon} size={24} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              {i ? null : <Text style={[styles.meta, { marginTop: 4, color: S.color, fontWeight: '600' }]}>{label}</Text>}
            </View>
          ))}
        </View>
      );
    case 'split':
      // Tabs in a floating pill, and the main action as its own labelled button beside it.
      return (
        <View style={[styles.floating, { gap: 12, shadowOpacity: 0 }]}>
          <View style={{ flex: 1, flexDirection: 'row', height: 64, borderRadius: 999, backgroundColor: C.surface, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }}>
            {tabs.map(([icon, label], i) => (
              <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                <Icon name={icon} size={22} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 64, paddingHorizontal: 20, borderRadius: 999, backgroundColor: S.color }}>
            <Icon name={S.fab} size={20} color={C.onBrand} strokeWidth={2.25} />
            <Text style={[styles.sub, { color: C.onBrand, fontWeight: '600', marginLeft: 8 }]}>{S.fabLabel}</Text>
          </View>
        </View>
      );
    default:
      return (
        <View style={styles.bar}>
          {tabs.map(([icon, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Icon name={icon} size={24} color={i ? C.muted : S.color} strokeWidth={i ? 1.75 : 2.25} />
              <Text style={[styles.meta, { marginTop: 4, color: i ? C.muted : S.color, fontWeight: i ? '500' : '600' }]}>{label}</Text>
            </View>
          ))}
        </View>
      );
  }
}

export default function App() {
  const curve = S.header === 'curve';
  return (
    <View style={{ flex: 1, backgroundColor: S.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 140 }}>
        {curve ? <View style={styles.curve} /> : null}
        <Text style={[styles.eyebrow, curve && { color: C.onBrand, opacity: 0.8 }]}>{S.eyebrow}</Text>
        <Text style={[styles.title, curve && { color: C.onBrand }]}>{S.title}</Text>
        {S.open ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: curve ? C.onBrand : C.open }} />
            <Text style={[styles.meta, { color: curve ? C.onBrand : C.open, marginTop: 0, marginLeft: 8, fontWeight: '600' }]}>{S.open}</Text>
          </View>
        ) : null}
        <Hero />
        {S.actions ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {S.actions.map((a) => (
              <View key={a} style={[styles.card, { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name={ACTION[a]} size={20} />
                <Text style={[styles.meta, { color: C.ink, fontWeight: '600', marginTop: 4 }]}>{a}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {S.chips ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
            {S.chips.map((c, i) => (
              <View key={c} style={{ paddingHorizontal: 16, height: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: i ? C.surface : C.ink, borderWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: C.line }}>
                <Text style={[styles.sub, { color: i ? C.ink : C.onBrand, fontWeight: '600' }]}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.section}>{S.section}</Text>
        <Rows />
      </ScrollView>
      <Nav />
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 15, fontWeight: '500', color: C.muted },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: C.ink, marginTop: 4 },
  big: { fontSize: 40, fontWeight: '700', letterSpacing: -1, color: C.ink, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 15, color: C.muted },
  section: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, color: C.ink, marginTop: 32, marginBottom: 12 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, shadowColor: C.ink, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  meta: { fontSize: 13, color: C.muted, marginTop: 2 },
  value: { fontSize: 15, fontWeight: '600', color: C.ink, fontVariant: ['tabular-nums'] },
  primary: { height: 48, borderRadius: 12, backgroundColor: S.color, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '600', color: C.onBrand },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 12, paddingBottom: 28 },
  floating: { position: 'absolute', left: 20, right: 20, bottom: 28, flexDirection: 'row', alignItems: 'center', shadowColor: C.ink, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  orb: { width: 52, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  notch: { position: 'absolute', top: -44, left: '50%', marginLeft: -44, width: 88, height: 88, borderRadius: 999, backgroundColor: S.bg },
  fab: { position: 'absolute', top: -32, left: '50%', marginLeft: -32, width: 64, height: 64, borderRadius: 999, backgroundColor: S.color, alignItems: 'center', justifyContent: 'center', shadowColor: S.color, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  // A very large circle whose bottom edge makes a gentle arc under the title.
  curve: { position: 'absolute', top: -1300, left: '50%', marginLeft: -800, width: 1600, height: 1600, borderRadius: 999, backgroundColor: S.color },
});
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

/** The app behind each template's screenshot. */
export function templateFiles(slug: string) {
  const sample = SAMPLES[slug];
  const screen = SCREENS[slug];
  if (sample) return parseGeneration(demoResponse(sample.prompt, false)).files;
  if (screen) return { "App.js": screenApp(screen) };
  // Business templates without their own screen: the real ready-made app, as people get it.
  const ready = READY_PRESETS[slug];
  return ready ? readyAppFiles(ready, ready.sample, readyDesign(ready.sample, slug)) : null;
}

async function main() {
  // CHECK_ONLY=1: run the design check on every template's app, without screenshots.
  if (process.env.CHECK_ONLY) {
    for (const t of [...TEMPLATES, ...BUSINESS_TEMPLATES]) {
      const files = templateFiles(templateSlug(t));
      const looks = files ? designIssues(files) : [];
      console.log(`${looks.length ? "FAIL" : "ok  "} ${templateSlug(t)}${looks.map((i) => `\n  - ${i.file}: ${i.message}`).join("")}`);
    }
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.warn("  page error:", e.message));
  // ONLY=slug,slug: just those templates' screenshots.
  const only = process.env.ONLY?.split(",");
  for (const t of [...TEMPLATES, ...BUSINESS_TEMPLATES]) {
    const slug = templateSlug(t);
    if (only && !only.includes(slug)) continue;
    const sample = SAMPLES[slug];
    const files = templateFiles(slug);
    if (!files) {
      console.warn(`skip ${slug}: no sample app or screen`);
      continue;
    }
    // The home page shows Appmaker's design skills: every app passes the design check.
    const looks = designIssues(files);
    if (looks.length) throw new Error(`${slug} fails the design check:\n${looks.map((i) => `- ${i.file}: ${i.message}`).join("\n")}`);
    // A plain file on the server gives the page its origin (the home page's own React would still be running).
    await page.goto(`${SERVER}/preview/axe-core-LICENSE.txt`);
    await page.setContent(buildPreviewHtml(files, SERVER, "ios"), { waitUntil: "networkidle" });
    // Wait until the app has drawn (the preview compiles it first), then let images and fonts settle.
    // (A plain loop: the preview's content security policy blocks waitForFunction's polling.)
    for (let i = 0; i < 60 && (await page.evaluate(() => document.body.innerText.trim().length)) < 20; i++) await page.waitForTimeout(500);
    await page.waitForTimeout(1200);
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
