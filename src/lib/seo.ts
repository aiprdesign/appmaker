import { BUSINESS_TEMPLATES, templateImage, templateSlug, type Template } from "./templates";
import { READY_PRESETS, type ReadyKind } from "./ready-app";

/**
 * Landing pages for search: one per business template (e.g. "Pizza ordering app"), plus a few
 * about how Appmaker works. Short on purpose: a keyword-led title and heading, one line of
 * description, three benefits and two questions, then the button that opens the app.
 */

export interface SeoPage {
  /** URL path, e.g. "/apps/pizza-takeaway". */
  path: string;
  /** <title> (about 60 characters) and the page's one heading. */
  title: string;
  h1: string;
  /** Meta description and the line under the heading (about 150 characters). */
  description: string;
  benefits: string[];
  faq: { q: string; a: string }[];
  image?: string;
  /** The business template the page opens, if any. */
  template?: Template;
}

/** What the app is called in searches: "pizza ordering app", "salon booking app"… */
const NOUN: Record<ReadyKind, string> = { order: "ordering app", booking: "booking app", quote: "app" };
/** Where "booking app" doesn't fit what people search for. */
const NOUN_FOR: Record<string, string> = { "church-or-community": "app" };

/** "Car repair / auto shop" → "car repair shop"; plain words people search for. */
const SEARCH_NAME: Record<string, string> = {
  "restaurant-or-cafe": "restaurant",
  "salon-or-barber": "salon & barber",
  "gym-or-studio": "gym & fitness studio",
  "clinic-or-dentist": "clinic & dentist",
  "local-shop": "local shop",
  "church-or-community": "church & community",
  "real-estate-agent": "real estate",
  "home-services": "plumber & home services",
  "car-repair-auto-shop": "car repair shop",
  "car-dealership": "car dealership",
  "car-wash-detailing": "car wash & detailing",
  bakery: "bakery",
  "cleaning-service": "cleaning business",
  "pizza-takeaway": "pizza & takeaway",
  "coffee-shop": "coffee shop",
  "hotel-or-b-b": "hotel & B&B",
  "pet-grooming-vet": "pet grooming",
  florist: "florist",
  "driving-school": "driving school",
  "tutoring-lessons": "tutoring",
  "laundry-dry-cleaning": "laundry & dry cleaning",
  "accountant-or-law-office": "accountant & law firm",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function templatePage(t: Template): SeoPage | null {
  const slug = templateSlug(t);
  const preset = READY_PRESETS[slug];
  if (!preset) return null;
  const name = SEARCH_NAME[slug] ?? t.title.toLowerCase();
  const noun = NOUN_FOR[slug] ?? NOUN[preset.kind];
  const things = preset.itemsTab.toLowerCase();
  const action = preset.kind === "order" ? "order ahead" : preset.kind === "booking" ? "book" : "ask for a quote";
  return {
    path: `/apps/${slug}`,
    title: `${cap(name)} ${noun} maker: your own app in minutes`,
    h1: `${cap(name)} ${noun}`,
    description: `A ready-made ${name} app for iPhone and Android: ${things}, ${preset.kind === "order" ? "orders" : "requests"} with live tracking, and a staff area. Add your details and publish.`,
    benefits: [
      `Customers ${action} in a few taps and follow it live.`,
      `Your ${things}, hours and contact, filled in from your website.`,
      "Staff mode and an owner page to manage everything.",
    ],
    faq: [
      { q: `How much does a ${name} app cost?`, a: "Start free: the app works straight away. Publishing to the App Store and Google Play uses their own developer accounts." },
      { q: "Do I need to code?", a: "No. Pick the template, add your details, and ask the AI in plain words for any change." },
    ],
    image: templateImage(t),
    template: t,
  };
}

/** Every landing page, in the order they're listed in the footer and the sitemap. */
export const SEO_PAGES: SeoPage[] = [
  {
    path: "/no-code-app-builder",
    title: "No-code app builder for iPhone & Android | Appmaker",
    h1: "No-code app builder",
    description: "Describe your app in plain words and get a real iPhone and Android app you can preview at once and publish to the App Store and Google Play.",
    benefits: ["Describe it, see it on a phone in about a minute.", "Change anything by chatting with the AI.", "Publish to the App Store and Google Play."],
    faq: [
      { q: "Is it a real native app?", a: "Yes: a React Native (Expo) app for iPhone and Android, not a web page in a wrapper." },
      { q: "Can I export the code?", a: "Yes. Download the whole project any time; it's yours." },
    ],
  },
  {
    path: "/website-to-app",
    title: "Turn your website into an app | Appmaker",
    h1: "Turn your website into an app",
    description: "Paste your website address and get a mobile app with your content, photos, colors, menu and contact details, ready for the App Store and Google Play.",
    benefits: ["Your content, photos and colors, read from your site.", "Ordering, booking and a staff area built in.", "Ready in seconds for most local businesses."],
    faq: [
      { q: "Does it copy my whole website?", a: "It takes what customers need on a phone: your name, menu or services, prices, hours, photos and contact." },
      { q: "What if my site changes?", a: "Turn on live updates and the app follows your website, or edit the app any time." },
    ],
  },
  ...BUSINESS_TEMPLATES.map(templatePage).filter((p): p is SeoPage => !!p),
];

export const seoPage = (path: string) => SEO_PAGES.find((p) => p.path === path);

/** The site's public address for canonical links and the sitemap (APP_URL, or Railway's domain). */
export function siteUrl(): string | null {
  const url = process.env.APP_URL?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");
  return url ? url.replace(/\/+$/, "") : null;
}
