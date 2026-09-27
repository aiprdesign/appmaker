export interface Template {
  title: string;
  emoji: string;
  color: string;
  category: string;
  prompt: string;
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

export const EDIT_SUGGESTIONS = [
  "Add a dark mode toggle in settings",
  "Add an onboarding flow with 3 screens",
  "Make the design more premium and minimal",
  "Add a settings tab with reset data",
  "Add haptic feedback to buttons",
];
