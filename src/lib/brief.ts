/**
 * The app brief: three one-tap questions shown before building when a prompt
 * is short and vague ("a gym app"). Answers are added to the prompt, so the
 * first version matches what the person had in mind. No AI involved.
 */

export const BRIEF_SKIP_KEY = "appmaker.brief.skip";

export const AUDIENCES = [
  { id: "me", label: "Just me", text: "for my own personal use" },
  { id: "customers", label: "My business's customers", text: "for the customers of my business" },
  { id: "team", label: "My team, class or club", text: "for a team, class or club to use together" },
  { id: "everyone", label: "Anyone", text: "for anyone who downloads it from the App Store and Google Play" },
] as const;

export const STYLES = [
  { id: "clean", label: "Clean & simple", text: "clean and simple, lots of white space, calm colors" },
  { id: "bold", label: "Bold & colorful", text: "bold and colorful, big headings, playful accents" },
  { id: "soft", label: "Calm & soft", text: "calm and soft, rounded shapes, gentle pastel colors" },
  { id: "sleek", label: "Sleek & premium", text: "sleek and premium, refined typography and generous spacing" },
] as const;

const CATEGORIES: { match: RegExp; features: string[] }[] = [
  {
    match: /\b(gym|fitness|workout|exercise|training|yoga|pilates|run|running)/i,
    features: ["Workout plans", "Exercise timer", "Progress charts", "Class timetable", "Personal records", "Reminders"],
  },
  {
    match: /\b(restaurant|cafe|café|coffee|bakery|food|menu|pizza|bar|kitchen|recipe)/i,
    features: ["Menu with photos", "Order or book a table", "Opening hours & directions", "Loyalty stamp card", "Offers", "Favourites"],
  },
  {
    match: /\b(salon|barber|hair|nails|beauty|spa|massage|clinic|dentist|physio)/i,
    features: ["Book an appointment", "Services & prices", "Team & gallery", "Opening hours & directions", "Loyalty card", "Reminders"],
  },
  {
    match: /\b(shop|store|boutique|products?|catalog|sell|market)/i,
    features: ["Product catalog", "Search & categories", "Wishlist", "Offers", "Contact & directions", "Order by WhatsApp"],
  },
  {
    match: /\b(habit|routine|streak|goal|mindful|meditat|sleep|water)/i,
    features: ["Daily check-ins", "Streaks", "Reminders", "Stats & charts", "Custom habits", "Notes"],
  },
  {
    match: /\b(budget|expense|money|finance|spend|saving|bills?)/i,
    features: ["Add expenses quickly", "Monthly budget", "Categories", "Charts", "Bill reminders", "Savings goals"],
  },
  {
    match: /\b(journal|diary|notes?|mood|gratitude|writing)/i,
    features: ["Daily entries", "Mood tracking", "Search", "Photos in entries", "Reminders", "Private & offline"],
  },
  {
    match: /\b(learn|study|quiz|flashcards?|language|school|course|lesson)/i,
    features: ["Lessons", "Quizzes", "Flashcards", "Progress tracking", "Daily reminders", "Streaks"],
  },
  {
    match: /\b(travel|trip|holiday|vacation|itinerary|packing)/i,
    features: ["Trip itinerary", "Packing list", "Places to visit", "Budget", "Notes & photos", "Countdown"],
  },
  {
    match: /\b(event|wedding|party|conference|festival|church|community)/i,
    features: ["Schedule", "RSVP", "Venue & directions", "Announcements", "Photo gallery", "Contact"],
  },
  { match: /\b(pet|dog|cat|vet)/i, features: ["Pet profiles", "Feeding & walks", "Vet appointments", "Medication reminders", "Photos", "Weight log"] },
  {
    match: /\b(task|todo|to-do|project|planner|schedule|chores?)/i,
    features: ["Tasks & lists", "Due dates", "Reminders", "Priorities", "Shared lists", "Progress"],
  },
];

const GENERIC = ["Easy to add things", "Search", "Reminders", "Stats & charts", "Favourites", "Works offline"];

/** Short, vague prompts get the brief; detailed ones (or ones with a list of features) don't. */
export function needsBrief(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || /\[[^\]]+\]/.test(text)) return false;
  const words = text.split(/\s+/).length;
  const listed = (text.match(/,|;|\band\b|\n|•|- /g) ?? []).length;
  return words <= 10 && listed < 2;
}

export function suggestFeatures(prompt: string): string[] {
  return CATEGORIES.find((c) => c.match.test(prompt))?.features ?? GENERIC;
}

/** Questions the AI wrote for this particular idea (see /api/brief). */
export interface AiBrief {
  /** One sentence: what the AI thinks the person wants. */
  understood: string;
  questions: { q: string; options: string[]; multi: boolean }[];
}

/** Reads the AI's JSON reply, keeping only well-formed, short questions. Null when it's unusable. */
export function parseAiBrief(text: string): AiBrief | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const r = raw as { understood?: unknown; questions?: unknown };
  if (!Array.isArray(r.questions)) return null;
  const questions = r.questions
    .map((x) => x as { q?: unknown; question?: unknown; options?: unknown; multi?: unknown })
    .map((x) => ({
      q: String(x.q ?? x.question ?? "").trim().slice(0, 120),
      options: (Array.isArray(x.options) ? x.options : [])
        .map((o) => String(o ?? "").trim().slice(0, 48))
        .filter(Boolean)
        .slice(0, 6),
      multi: x.multi === true,
    }))
    .filter((x) => x.q && x.options.length >= 2)
    .slice(0, 3);
  return { understood: String(r.understood ?? "").trim().slice(0, 240), questions };
}

export interface BriefAnswers {
  /** Answers to the AI's own questions, when it wrote them. */
  picks?: { q: string; choices: string[] }[];
  audience?: (typeof AUDIENCES)[number]["id"];
  business?: string;
  features: string[];
  extra?: string;
  style?: (typeof STYLES)[number]["id"];
}

/** The prompt with the answers added, in plain words the AI can follow. */
export function briefPrompt(prompt: string, a: BriefAnswers): string {
  const audience = AUDIENCES.find((x) => x.id === a.audience);
  const style = STYLES.find((x) => x.id === a.style);
  const business = a.business?.trim().slice(0, 80);
  const extra = a.extra?.trim().slice(0, 300);
  const features = [...a.features.map((f) => f.trim()).filter(Boolean), ...(extra ? [extra] : [])];
  return [
    prompt.trim(),
    "",
    ...(audience
      ? [`Who it's for: ${audience.text}${business ? `. The business is called "${business}"` : ""}.`]
      : business
        ? [`The business is called "${business}".`]
        : []),
    ...(features.length ? [`Must-have features: ${features.join("; ")}.`] : []),
    ...(a.picks ?? []).filter((p) => p.choices.length).map((p) => `${p.q.replace(/\?$/, "")}: ${p.choices.join(", ")}.`),
    ...(style ? [`Look and feel: ${style.text}.`] : []),
  ]
    .join("\n")
    .trim();
}
