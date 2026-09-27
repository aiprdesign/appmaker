/**
 * 100 app requests used to measure how well Appmaker builds apps. They cover
 * the App Store's main categories, vague and very specific wording, and a
 * handful of follow-up edits to test iteration.
 */
export interface EvalCase {
  id: string;
  category: string;
  prompt: string;
  /** Optional second request, applied to the generated app. */
  followUp?: string;
}

const raw: [string, string, string?][] = [
  // Productivity
  ["Productivity", "A to-do list with projects, due dates, priorities and a Today view.", "Add a way to mark tasks as recurring every day or week."],
  ["Productivity", "A pomodoro focus timer with custom work/break lengths and a history of completed sessions."],
  ["Productivity", "A notes app with folders, pinning, search and a markdown-style checklist."],
  ["Productivity", "A simple kanban board with To do, Doing and Done columns where I can move cards."],
  ["Productivity", "A daily planner that shows my schedule as time blocks from 6am to 10pm."],
  ["Productivity", "An app to track books I'm reading, with progress, ratings and a want-to-read list."],
  ["Productivity", "A shopping list app with categories like produce and dairy, and a way to check items off."],
  ["Productivity", "A goal tracker where I set yearly goals, break them into milestones and see percent complete."],
  ["Productivity", "A minimal journaling app with one prompt per day and a calendar of past entries."],
  ["Productivity", "A password-free bookmark saver for links I want to read later, with tags."],
  // Health & Fitness
  ["Health & Fitness", "A water intake tracker with a daily goal, quick-add buttons and a weekly chart.", "Change the theme to calming blues and add a reminder settings screen."],
  ["Health & Fitness", "A workout logger for gym sessions: exercises, sets, reps, weight and personal records."],
  ["Health & Fitness", "A running app that logs runs manually with distance and time and shows pace and weekly totals."],
  ["Health & Fitness", "A sleep diary where I log bedtime, wake time and quality, with averages."],
  ["Health & Fitness", "A calorie counter with a food list, meals by time of day and a daily total vs goal."],
  ["Health & Fitness", "A meditation app with guided breathing animation (inhale/hold/exhale) and session streaks."],
  ["Health & Fitness", "A 30-day plank challenge with a daily target and a progress calendar."],
  ["Health & Fitness", "A medication reminder list with doses, times and a checkbox for each dose taken today."],
  ["Health & Fitness", "A step goal tracker where I enter steps each day and see streaks and badges."],
  ["Health & Fitness", "A yoga pose library with difficulty levels and the ability to build my own routine."],
  // Finance
  ["Finance", "A monthly budget app with categories, spending limits and alerts when I go over."],
  ["Finance", "A bill splitter: enter the total, tip percent and number of people, including uneven splits."],
  ["Finance", "A subscription tracker that lists my subscriptions, renewal dates and total monthly cost.", "Add a sort option by price and by next renewal date."],
  ["Finance", "A savings goals app with a progress bar for each goal and deposit history."],
  ["Finance", "A simple invoice maker for freelancers: clients, line items, totals and paid/unpaid status."],
  ["Finance", "A net worth tracker with assets and debts and a history of monthly snapshots."],
  ["Finance", "A kids' allowance tracker for two children with chores that earn money."],
  ["Finance", "A currency converter with a few popular currencies and editable exchange rates."],
  ["Finance", "A debt payoff planner comparing snowball and avalanche methods."],
  ["Finance", "A receipt log for expenses with merchant, amount, category and a monthly report."],
  // Food & Drink
  ["Food & Drink", "A recipe box with ingredients, steps, cooking time and favourites.", "Add a serving-size scaler that adjusts ingredient amounts."],
  ["Food & Drink", "A weekly meal planner that generates a shopping list from planned meals."],
  ["Food & Drink", "A coffee brewing guide with timers for pour-over, French press and AeroPress."],
  ["Food & Drink", "A wine journal to rate wines with grape, region, price and tasting notes."],
  ["Food & Drink", "A pantry inventory with expiry dates that highlights items expiring soon."],
  ["Food & Drink", "A restaurant wishlist to save places I want to try, by cuisine and neighbourhood."],
  ["Food & Drink", "A baking conversion helper for cups, grams and oven temperatures."],
  ["Food & Drink", "An ordering app for a small pizza shop with a menu, cart and checkout summary."],
  ["Food & Drink", "A cocktail recipe app with filters by spirit and a 'what can I make' mode."],
  ["Food & Drink", "A fasting timer with 16:8 and 18:6 presets and a history of fasts."],
  // Education
  ["Education", "Spanish vocabulary flashcards with flip animation and a spaced-repetition score."],
  ["Education", "A multiplication practice game for kids with levels, timer and stars.", "Make it more colourful and add a parent progress screen."],
  ["Education", "A study planner for exams with subjects, topics and a countdown to each exam."],
  ["Education", "A periodic table explorer with element details and a quiz mode."],
  ["Education", "A world capitals quiz with multiple choice and a high score."],
  ["Education", "A reading log for a classroom where kids log minutes read per day."],
  ["Education", "A typing speed test that shows words per minute and accuracy."],
  ["Education", "A guitar chord library with finger positions drawn as a fretboard diagram."],
  ["Education", "A grade calculator: weighted assignments, current grade and what I need on the final."],
  ["Education", "A word of the day app with definitions, examples and a saved words list."],
  // Lifestyle
  ["Lifestyle", "A plant care app with watering schedules and a 'needs water today' list."],
  ["Lifestyle", "A mood tracker with emoji moods, notes and a monthly mood calendar."],
  ["Lifestyle", "A gratitude journal with three prompts a day and streaks."],
  ["Lifestyle", "A closet organizer to catalogue clothes by type, colour and season and build outfits."],
  ["Lifestyle", "A dog care app for walks, feeding times and vet appointments.", "Support multiple pets with a pet switcher at the top."],
  ["Lifestyle", "A birthday and anniversary reminder app with countdowns and gift ideas."],
  ["Lifestyle", "A home chores rotation for a shared flat with weekly assignments."],
  ["Lifestyle", "A packing list maker for trips with templates for beach, city and camping."],
  ["Lifestyle", "A wedding planning checklist with budget, guest list and vendors."],
  ["Lifestyle", "A baby tracker for feeds, nappies and sleep with a daily summary."],
  // Travel
  ["Travel", "A trip itinerary planner with days, activities, times and locations."],
  ["Travel", "A travel expense tracker in multiple currencies with a total in my home currency."],
  ["Travel", "A countries visited tracker with a list by continent and percent of the world visited."],
  ["Travel", "A road trip fuel cost calculator with distance, mpg and fuel price."],
  ["Travel", "A phrasebook for travellers in Japan with categories and favourites."],
  // Utilities
  ["Utilities", "A tip calculator with custom percentages and rounding."],
  ["Utilities", "A unit converter for length, weight, temperature and volume."],
  ["Utilities", "A countdown app for upcoming events with colourful cards."],
  ["Utilities", "A stopwatch and lap timer with a lap history."],
  ["Utilities", "A random decision maker: spin a wheel of options I type in."],
  ["Utilities", "A world clock showing times in cities I pick."],
  ["Utilities", "A tally counter with multiple named counters."],
  ["Utilities", "A password generator with length and character options and a strength meter."],
  ["Utilities", "A QR-style business card app that shows my contact details beautifully."],
  ["Utilities", "A parking reminder: note where I parked, level and spot, and a meter timer."],
  // Games & Entertainment
  ["Games", "Tic-tac-toe against a simple computer opponent with a score board."],
  ["Games", "A memory matching card game with emoji pairs, moves counter and best score."],
  ["Games", "A trivia quiz with categories, 10 questions per round and a results screen."],
  ["Games", "A dice roller for board games with 1–6 dice and roll history."],
  ["Games", "A scorekeeper for card games with players, rounds and a leaderboard."],
  ["Entertainment", "A movie watchlist with ratings, genres and a watched/unwatched filter."],
  ["Entertainment", "A podcast episode tracker where I log episodes and notes."],
  ["Entertainment", "A board game night planner with games owned, players and winners history."],
  ["Music", "A metronome with tempo slider, time signatures and a visual beat."],
  ["Music", "A practice log for musicians with minutes practised per instrument per day."],
  // Business
  ["Business", "An inventory tracker for a small shop with stock levels and low-stock alerts."],
  ["Business", "A client appointment book for a hair salon with services and prices."],
  ["Business", "A time tracker for freelancers with projects, hourly rate and weekly earnings.", "Add an export-style summary screen for a chosen week."],
  ["Business", "A lead tracker (mini CRM) with stages from new to won and notes."],
  ["Business", "A tip jar tracker for a café team splitting tips by hours worked."],
  // Sports
  ["Sports", "A basketball scoreboard with quarters, fouls and a game clock."],
  ["Sports", "A golf scorecard for 18 holes with par and totals."],
  ["Sports", "A climbing log for boulder problems with grades and sends."],
  ["Sports", "A cycling training plan tracker with weekly distance goals."],
  ["Sports", "A tennis match tracker with sets, games and points."],
  // Vague and unusual requests
  ["Vague", "An app for my dog."],
  ["Vague", "Something to help me drink less coffee."],
  ["Vague", "make me a cool app"],
  ["Vague", "An app for a small bakery called Sunrise Loaves."],
  ["Vague", "A dark-mode only app for night-shift nurses to log breaks and hydration."],
];

export const EVAL_CASES: EvalCase[] = raw.map(([category, prompt, followUp], i) => ({
  id: `app-${String(i + 1).padStart(3, "0")}`,
  category,
  prompt,
  ...(followUp ? { followUp } : {}),
}));
