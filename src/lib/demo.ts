import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FileMap, SiteSummary, StoreListing } from "./types";

/**
 * Offline demo mode: when no Anthropic credentials are configured, the
 * generator streams one of the hand-built apps in /demo-apps so the whole
 * product flow (build → preview → publish) still works end to end.
 */
interface Demo {
  dir: string;
  match: RegExp;
  listing: StoreListing;
}

const DEMOS: Demo[] = [
  {
    dir: "habits",
    match: /\b(?:habit|routine|streak|goal|daily|mindful)/i,
    listing: {
      name: "Streakly",
      subtitle: "Build habits that stick",
      description:
        "Streakly makes building good habits effortless. Check off your daily habits in one tap and watch your streaks grow.\n\nPick an icon, name your habit, and Streakly keeps track of every day you show up. The stats view shows your best streak and how consistent you've been.\n\nNo accounts, no clutter — your data stays on your device.",
      keywords: "habit,tracker,streak,routine,goals,daily,productivity,self care",
      category: "Health & Fitness",
      bundleId: "com.appmaker.streakly",
      primaryColor: "#6440F0",
      iconEmoji: "✅",
      privacyNotes: "Data is stored on-device only.",
    },
  },
  {
    dir: "budget",
    match: /\b(?:budget|expense|money|finance|spend|wallet|saving)/i,
    listing: {
      name: "Pocketwise",
      subtitle: "Simple monthly budgeting",
      description:
        "Pocketwise shows you exactly how much you have left to spend this month.\n\nLog an expense in seconds, sort it into a category, and see where your money goes with clear category insights.\n\nPrivate by design: everything is stored on your phone.",
      keywords: "budget,expense,money,finance,spending,tracker,wallet,savings",
      category: "Finance",
      bundleId: "com.appmaker.pocketwise",
      primaryColor: "#047857",
      iconEmoji: "💸",
      privacyNotes: "Data is stored on-device only.",
    },
  },
  {
    dir: "fitness",
    match: /\b(?:fitness|workout|gym|exercise|training|yoga|run)/i,
    listing: {
      name: "Pulse Workouts",
      subtitle: "Guided home workouts",
      description:
        "Pulse gives you quick, guided workouts you can do anywhere — no equipment needed.\n\nChoose a routine, follow the timed moves, and pause or skip whenever you need. Every finished session is logged to your progress.\n\nStay consistent with short sessions designed for busy days.",
      keywords: "workout,fitness,hiit,home workout,timer,exercise,training,yoga",
      category: "Health & Fitness",
      bundleId: "com.appmaker.pulse",
      primaryColor: "#D23C17",
      iconEmoji: "🔥",
      privacyNotes: "Data is stored on-device only.",
    },
  },
];

function titleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(build|make|create|that|with|want|app|application|simple|which|their|users|should)$/i.test(w))
    .slice(0, 2);
  const base = words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "Notebook";
  return base.slice(0, 24);
}

function siteDisplayName(site: SiteSummary): string {
  return site.siteName.replace(/\s+/g, " ").trim().slice(0, 30) || "My App";
}

function brandListing(base: StoreListing, site: SiteSummary): StoreListing {
  const name = siteDisplayName(site);
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
  return {
    ...base,
    name,
    subtitle: (site.description.split(/[.!?]/)[0] || base.subtitle).slice(0, 30),
    description: site.description ? `${site.description}\n\n${base.description}` : base.description,
    bundleId: `com.appmaker.${slug}`,
    primaryColor: site.colors[0] ?? base.primaryColor,
  };
}

function readDir(root: string, rel = ""): FileMap {
  const files: FileMap = {};
  for (const entry of readdirSync(path.join(root, rel))) {
    const relPath = rel ? `${rel}/${entry}` : entry;
    if (statSync(path.join(root, relPath)).isDirectory()) {
      Object.assign(files, readDir(root, relPath));
    } else {
      files[relPath] = readFileSync(path.join(root, relPath), "utf8");
    }
  }
  return files;
}

export function demoResponse(prompt: string, isEdit: boolean, site?: SiteSummary): string {
  if (isEdit) {
    const why =
      process.env.APPMAKER_DEMO === "1"
        ? "the server has `APPMAKER_DEMO=1` set"
        : "the server can't see any AI key (for example `REPLICATE_API_TOKEN` or `ANTHROPIC_API_KEY`)";
    return `<plan>Demo mode can't edit apps.</plan>\n<summary>Demo mode is active because ${why}, so I can only make starter apps — not apply changes like "${prompt.slice(0, 80)}". The site owner can open **/status** to see which settings the server can see. You can also add your own key in the AI model settings.</summary>`;
  }
  const demo = DEMOS.find((d) => d.match.test(prompt));
  const root = path.join(process.cwd(), "demo-apps", demo?.dir ?? "journal");
  const files = readDir(root);
  let listing: StoreListing;
  if (demo && !site) {
    listing = demo.listing;
  } else if (demo && site) {
    listing = brandListing(demo.listing, site);
  } else {
    const name = site ? siteDisplayName(site) : titleFromPrompt(prompt);
    files["App.js"] = files["App.js"].replace("'__APP_NAME__'", JSON.stringify(name));
    listing = {
      name,
      subtitle: "Capture ideas in seconds",
      description: `${name} is a fast, focused place for your thoughts.\n\nWrite an entry, tag it with a mood, pin what matters and search everything instantly.\n\nEverything is stored privately on your device.`,
      keywords: "notes,journal,diary,ideas,mood,private,writing",
      category: "Productivity",
      bundleId: `com.appmaker.${name.toLowerCase().replace(/[^a-z]/g, "") || "notebook"}`,
      primaryColor: "#2563EB",
      iconEmoji: "📓",
      privacyNotes: "Data is stored on-device only.",
    };
    if (site) listing = brandListing(listing, site);
  }
  // Rebrand the starter app with the website's main color.
  if (site?.colors[0]) {
    const original = (demo?.listing ?? { primaryColor: "#2563EB" }).primaryColor;
    for (const [p, code] of Object.entries(files)) files[p] = code.split(original).join(site.colors[0]);
  }
  const body = Object.entries(files)
    .map(([p, code]) => `<file path="${p}">\n${code}</file>`)
    .join("\n");
  return `<plan>Building "${listing.name}" — a ${listing.category.toLowerCase()} app with tabbed navigation and on-device storage.</plan>\n${body}\n<listing>${JSON.stringify(
    listing,
  )}</listing>\n<summary>Here's **${listing.name}**, a starter app generated in demo mode (no \`ANTHROPIC_API_KEY\` configured). Try it in the preview — data persists between reloads.\n\n- Add an API key to generate fully custom apps from any prompt\n- Open the **Publish** tab to review the App Store listing\n- Download the Expo project to build for iOS and Android</summary>`;
}
