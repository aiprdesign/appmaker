export interface Template {
  title: string;
  emoji: string;
  color: string;
  category: string;
  prompt: string;
}

/** URL-safe name, e.g. "Restaurant or café" → "restaurant-or-cafe". */
export function templateSlug(t: Pick<Template, "title">): string {
  return t.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Screenshot of the template's app (made by scripts/template-screens.ts). */
export function templateImage(t: Pick<Template, "title">): string {
  return `/templates/${templateSlug(t)}.jpg`;
}

export const TEMPLATES: Template[] = [
  {
    title: "Habit tracker",
    emoji: "✅",
    color: "#7C5CFF",
    category: "Health",
    prompt:
      "A habit tracker where I can add daily habits with an emoji, check them off each day, see streaks, and view weekly stats. Clean, playful purple design.",
  },
  {
    title: "Budget planner",
    emoji: "💸",
    color: "#10B981",
    category: "Finance",
    prompt:
      "A personal budget app: set a monthly budget, log expenses by category, see how much is left, and view spending insights with bar charts.",
  },
  {
    title: "Home workouts",
    emoji: "🔥",
    color: "#FF5A36",
    category: "Fitness",
    prompt:
      "A home workout app with guided routines, a full-screen timer for each move with pause/skip, and a progress screen logging completed workouts.",
  },
  {
    title: "Recipe box",
    emoji: "🍝",
    color: "#F59E0B",
    category: "Food",
    prompt:
      "A recipe app with a searchable list of recipes, recipe detail with ingredients checklist and step-by-step mode, favorites, and a weekly meal planner.",
  },
  {
    title: "Language flashcards",
    emoji: "🗣️",
    color: "#0EA5E9",
    category: "Education",
    prompt:
      "A Spanish flashcards app with decks, a swipe-style study mode that flips cards, spaced repetition scoring, and a daily goal ring.",
  },
  {
    title: "Mood journal",
    emoji: "📓",
    color: "#2563EB",
    category: "Lifestyle",
    prompt:
      "A private mood journal: write daily entries tagged with a mood emoji, search and pin entries, and see a mood calendar for the month.",
  },
  {
    title: "Plant care",
    emoji: "🪴",
    color: "#16A34A",
    category: "Lifestyle",
    prompt:
      "A plant care app to add my plants with watering schedules, show which plants need water today, and keep a care log with notes.",
  },
  {
    title: "Event countdown",
    emoji: "🎉",
    color: "#DB2777",
    category: "Utilities",
    prompt:
      "A countdown app for upcoming events (birthdays, trips, launches) with colorful cards, live days/hours countdowns, and categories.",
  },
];

/**
 * Starting points for a business's own app. The [bracketed] parts are for the
 * business's real details; importing its website instead fills them in.
 */
export const BUSINESS_TEMPLATES: Template[] = [
  {
    title: "Restaurant or café",
    emoji: "🍽️",
    color: "#E0482B",
    category: "Food & Drink",
    prompt:
      "An app for my restaurant [name] in [city]. Home with today's specials and an Open now / Closed badge from our hours [hours], a menu with categories, prices and dietary tags, a digital loyalty card (10 stamps = free coffee, staff add a stamp with a 4-digit PIN), and a Visit screen with one-tap Call [phone], Directions to [address] and Order online / Book a table [link].",
  },
  {
    title: "Salon or barber",
    emoji: "💈",
    color: "#B4546A",
    category: "Beauty",
    prompt:
      "An app for my salon [name]. Services with prices and durations, our team with specialties, a photo gallery, a Book now button that opens [booking link], a loyalty card (every 6th visit 20% off, staff PIN to add a visit), appointment reminders the customer sets, and one-tap Call [phone], WhatsApp and Directions to [address].",
  },
  {
    title: "Gym or studio",
    emoji: "🏋️",
    color: "#2563EB",
    category: "Fitness",
    prompt:
      "An app for my gym [name]. Weekly class timetable with filters by class type, favourite classes with a reminder before they start, membership options and prices, trainers, opening hours with an Open now badge [hours], a check-in streak tracker, and one-tap Call [phone], Directions to [address] and Book a class [link].",
  },
  {
    title: "Clinic or dentist",
    emoji: "🦷",
    color: "#0E9F8E",
    category: "Health",
    prompt:
      "An information app for my clinic [name]. Services we offer (descriptions only, no medical claims), our practitioners, opening hours with an Open now badge [hours], what to bring to a first visit, an appointment reminder the patient sets for themselves, and one-tap Call [phone], Directions to [address] and Book an appointment [link].",
  },
  {
    title: "Local shop",
    emoji: "🛍️",
    color: "#7C3AED",
    category: "Shopping",
    prompt:
      "An app for my shop [name]. A product catalog with categories, prices and a wishlist, this week's offers, new arrivals, a loyalty card with a staff PIN, store hours with an Open now badge [hours], and one-tap Call [phone], Directions to [address], Instagram [link] and Shop online [link].",
  },
  {
    title: "Church or community",
    emoji: "⛪",
    color: "#A16207",
    category: "Community",
    prompt:
      "An app for [name], our church community. Service times and upcoming events with reminders, sermon notes people can save, a prayer request form that opens an email to [email], groups and ministries, a giving button that opens [link], and one-tap Call [phone] and Directions to [address].",
  },
  {
    title: "Real estate agent",
    emoji: "🏡",
    color: "#0F766E",
    category: "Real Estate",
    prompt:
      "An app for my real estate agency [name]. Featured listings with price, beds, baths and area, filters and saved favourites, a mortgage payment calculator (estimates only), an Open house schedule with reminders, and one-tap Call [phone], WhatsApp, Email [email] and Book a viewing [link].",
  },
  {
    title: "Home services",
    emoji: "🧰",
    color: "#EA580C",
    category: "Business",
    prompt:
      "An app for my [plumbing / cleaning / electrical] business [name]. Services with starting prices, a simple quote request that opens an email to [email] with the customer's details and photos described, service areas, reviews, opening hours [hours], and one-tap Call [phone] and WhatsApp.",
  },
];

export const EDIT_SUGGESTIONS = [
  "Add a dark mode toggle in settings",
  "Add an onboarding flow with 3 screens",
  "Make the design more premium and minimal",
  "Add a settings tab with reset data",
  "Add haptic feedback to buttons",
];
