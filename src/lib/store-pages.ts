import type { Project } from "./types";

/**
 * Support page and privacy policy for an app, hosted by Appmaker so the app
 * can be submitted to the App Store (Apple asks for a support page) and
 * Google Play (both stores ask for a privacy policy).
 *
 * The pages are built only from fixed wording plus a few checked facts: the
 * app's name, the business, a contact email, and what the app's code does
 * (read by appFacts). They're a starting point, not legal advice.
 */

export interface AppFacts {
  /** Saves what people add (favourites, notes, settings) on the device. */
  onDevice: boolean;
  notifications: boolean;
  camera: boolean;
  photos: boolean;
  /** Opens the phone, email, maps, WhatsApp or websites. */
  opensLinks: boolean;
  bookings?: boolean;
  /** Web services the app loads content from. */
  services: string[];
}

export interface StorePageContent {
  appName: string;
  developer: string;
  email: string;
  website?: string;
  description: string;
  /** Effective date, YYYY-MM-DD. */
  updated: string;
  facts: AppFacts;
}

export class PageInputError extends Error {}

const HOST = /^(?=.{3,120}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const uses = (code: string, pkg: string) => code.includes(`'${pkg}'`) || code.includes(`"${pkg}"`);

/** What the app's code does, for the privacy policy. */
export function appFacts(files: Record<string, string>): AppFacts {
  const code = Object.values(files).join("\n");
  const services = new Set<string>();
  for (const m of code.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const host = m[1].toLowerCase();
    if (HOST.test(host)) services.add(host);
  }
  return {
    onDevice: uses(code, "@react-native-async-storage/async-storage"),
    notifications: uses(code, "expo-notifications"),
    camera: /launchCameraAsync|requestCameraPermissions/.test(code),
    photos: /launchImageLibraryAsync|requestMediaLibraryPermissions/.test(code),
    opensLinks: /Linking\.openURL/.test(code),
    bookings: /\/api\/book\/[A-Za-z0-9_-]+/.test(code),
    services: [...services].sort().slice(0, 15),
  };
}

function text(v: unknown, label: string, max: number, required = true): string {
  const t =
    typeof v === "string"
      ? v
          .replace(/[\u0000-\u001f<>]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  if (required && !t) throw new PageInputError(`${label} is required.`);
  if (t.length > max) throw new PageInputError(`${label} is too long (max ${max} characters).`);
  return t;
}

/** Checks page content from the browser; only these fields and shapes are stored. */
export function parsePageContent(v: unknown): StorePageContent {
  if (!v || typeof v !== "object") throw new PageInputError("Page details are missing.");
  const o = v as Record<string, unknown>;
  const email = text(o.email, "Contact email", 120);
  if (!EMAIL.test(email)) throw new PageInputError("Enter a valid contact email.");
  const website = text(o.website, "Website", 300, false);
  if (website && !/^https:\/\/[^\s"'<>]+$/i.test(website)) throw new PageInputError("The website must start with https://");
  const f = (o.facts ?? {}) as Record<string, unknown>;
  const services = Array.isArray(f.services) ? f.services.filter((h): h is string => typeof h === "string" && HOST.test(h)).slice(0, 15) : [];
  const updated = typeof o.updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.updated) ? o.updated : new Date().toISOString().slice(0, 10);
  return {
    appName: text(o.appName, "App name", 60),
    developer: text(o.developer, "Business or developer name", 80),
    email,
    ...(website ? { website } : {}),
    description: text(o.description, "Description", 200, false),
    updated,
    facts: {
      onDevice: f.onDevice === true,
      notifications: f.notifications === true,
      camera: f.camera === true,
      photos: f.photos === true,
      opensLinks: f.opensLinks === true,
      bookings: f.bookings === true,
      services,
    },
  };
}

/** Page details for a project, with the business's name and email filled in when known. */
export function pageContentFor(project: Project, input: { developer: string; email: string; website?: string }): StorePageContent {
  return {
    appName: project.listing.name || project.name,
    developer: input.developer,
    email: input.email,
    ...(input.website ? { website: input.website } : {}),
    description: project.listing.subtitle || "",
    updated: new Date().toISOString().slice(0, 10),
    facts: appFacts(project.files),
  };
}

export interface PageSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export function privacySections(c: StorePageContent): PageSection[] {
  const f = c.facts;
  const sections: PageSection[] = [
    {
      heading: "Overview",
      paragraphs: [
        `${c.appName} ("the app") is provided by ${c.developer}. This policy explains what information the app handles and how. It applies to the app on iPhone, iPad and Android.`,
      ],
    },
    {
      heading: "Information we collect",
      paragraphs: f.bookings
        ? [
            `When you book an appointment, the app sends your name, phone number, the time you chose, the service and any note to ${c.developer} so they can see and manage your booking. Bookings are stored securely by Appmaker, the service that runs bookings for ${c.developer}, and are deleted automatically one year after the appointment. They are used only for your booking.`,
            "Apart from bookings, we do not collect personal information through the app. The app has no user accounts, advertising or analytics, and we do not sell or share personal information.",
          ]
        : [
            "We do not collect personal information through the app. The app has no user accounts, advertising or analytics, and we do not sell or share personal information.",
          ],
    },
    {
      heading: "Information stored on your device",
      paragraphs: [
        f.onDevice
          ? "Things you add or choose in the app, such as favourites, notes, progress and settings, are saved only on your device. They are not sent to us."
          : "The app does not store personal information on your device.",
      ],
    },
  ];
  if (f.camera || f.photos) {
    sections.push({
      heading: f.camera && f.photos ? "Camera and photos" : f.camera ? "Camera" : "Photos",
      paragraphs: [
        `The app asks for access to your ${[f.camera && "camera", f.photos && "photo library"].filter(Boolean).join(" and ")} only when you choose to add a picture. Pictures stay on your device and are not uploaded to us. You can change this permission at any time in your device's settings.`,
      ],
    });
  }
  if (f.notifications) {
    sections.push({
      heading: "Notifications",
      paragraphs: [
        "If you turn on reminders, the app schedules notifications on your device. You can turn them off in the app or in your device's settings at any time.",
      ],
    });
  }
  if (f.services.length) {
    sections.push({
      heading: "Services the app connects to",
      paragraphs: [
        "To show content, the app loads information from the services below. Like any website, they receive standard technical information such as your device's IP address. Their own privacy policies apply.",
      ],
      bullets: f.services,
    });
  }
  if (f.opensLinks) {
    sections.push({
      heading: "Contacting us and other apps",
      paragraphs: [
        "Buttons in the app can open your phone, email, maps, WhatsApp or a website. What you send through those apps is handled by them and by us only to reply to you.",
      ],
    });
  }
  sections.push(
    {
      heading: "Children",
      paragraphs: ["The app is not directed to children under 13, and we do not knowingly collect information from children."],
    },
    {
      heading: "Deleting your data",
      paragraphs: [
        f.onDevice
          ? "You can delete everything the app has saved by deleting the app from your device. Because we do not hold your data, there is nothing else to delete on our side."
          : "Because we do not hold your data, there is nothing to delete on our side.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: ["If this policy changes, we will update this page and the date below."],
    },
    {
      heading: "Contact",
      paragraphs: [`Questions about this policy? Email ${c.email}.`],
    },
  );
  return sections;
}

export function supportSections(c: StorePageContent): PageSection[] {
  const f = c.facts;
  return [
    {
      heading: "Get help",
      paragraphs: [`Email ${c.email} and we'll get back to you as soon as we can. Please include your device model and what happened.`],
    },
    {
      heading: "Frequently asked questions",
      paragraphs: [],
      bullets: [
        f.onDevice
          ? "Where is my data? Everything you add is saved on your device only, so it stays private and works offline."
          : "Do I need an account? No. The app works without signing up.",
        "How do I delete my data? Delete the app from your device and everything it saved is removed.",
        ...(f.notifications ? ["How do I stop reminders? Turn them off in the app's settings, or in your device's notification settings."] : []),
        "The app isn't working as expected. Update it to the latest version from the App Store or Google Play, then restart it. If the problem continues, email us.",
      ],
    },
    {
      heading: "Accessibility",
      paragraphs: [
        `We want ${c.appName} to be usable by everyone. It's designed to work with VoiceOver and TalkBack, to follow your device's text size and light or dark mode, and to meet WCAG 2.1 AA color contrast.`,
        `If anything in the app is hard to use, email ${c.email} and tell us what happened and which device you use. We'll help and work on a fix.`,
      ],
    },
  ];
}

/** Terms of use for the app: a plain starting point the owner should read (and have checked) before publishing. */
export function termsSections(c: StorePageContent): PageSection[] {
  const f = c.facts;
  return [
    {
      heading: "About these terms",
      paragraphs: [
        `These terms apply to ${c.appName} ("the app"), provided by ${c.developer}. By using the app you agree to them. On iPhone and iPad, Apple's standard licence agreement for apps also applies.`,
      ],
    },
    {
      heading: "Using the app",
      paragraphs: [
        "You may use the app for your own personal, lawful purposes. Don't misuse it: don't try to break it, copy it, or use it to harm others.",
        "We work to keep the information in the app accurate and up to date, but details such as prices, opening hours and availability can change. If something matters to you, check with us.",
      ],
    },
    ...(f.bookings
      ? [
          {
            heading: "Bookings",
            paragraphs: [
              "When you book a time in the app, it's reserved for you straight away. To change or cancel a booking, please contact us. We may need to change or cancel a booking in exceptional cases; if so, we'll contact you using the details you gave.",
            ],
          },
        ]
      : []),
    {
      heading: "Your information",
      paragraphs: ["How the app handles your information is explained in our privacy policy."],
    },
    {
      heading: "The app itself",
      paragraphs: [
        "The app, its name and its content belong to us or our licensors. We may update the app or change or stop features. We aim to keep it available, but can't promise it will always work without interruption.",
        "To the extent the law allows, the app is provided \"as is\" and we aren't liable for indirect losses from using it. Nothing in these terms affects your rights as a consumer that can't be limited by law.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [`We may update these terms; the date at the top shows the current version. Questions: ${c.email}.`],
    },
  ];
}

/**
 * For people who host the pages on their own site (Google Sites, Hostinger,
 * WordPress…): the same pages as plain text to paste into a page editor, or
 * as a complete web page to upload. Missing details become [placeholders].
 */
function withPlaceholders(c: StorePageContent): StorePageContent {
  return { ...c, developer: c.developer || "[your business name]", email: c.email || "[your email]" };
}

export type OwnPage = "privacy" | "support";

const OWN_PAGES: Record<OwnPage, { title: (c: StorePageContent) => string; sections: (c: StorePageContent) => PageSection[] }> = {
  privacy: { title: (c) => `Privacy policy for ${c.appName}`, sections: privacySections },
  support: { title: (c) => `${c.appName}: help and support`, sections: supportSections },
};

/** The page as plain text: headings, paragraphs and "•" bullets, ready to paste. */
export function pageAsText(page: OwnPage, content: StorePageContent): string {
  const c = withPlaceholders(content);
  const lines = [OWN_PAGES[page].title(c), `Last updated: ${c.updated}`, ""];
  for (const s of OWN_PAGES[page].sections(c)) {
    lines.push(s.heading, ...s.paragraphs, ...(s.bullets ?? []).map((b) => `• ${b}`), "");
  }
  return lines.join("\n").trim() + "\n";
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The page as a complete, simple web page that works on any host. */
export function pageAsHtml(page: OwnPage, content: StorePageContent): string {
  const c = withPlaceholders(content);
  const title = escapeHtml(OWN_PAGES[page].title(c));
  const body = OWN_PAGES[page]
    .sections(c)
    .map(
      (s) =>
        `<h2>${escapeHtml(s.heading)}</h2>\n${s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}${
          s.bullets?.length ? `\n<ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""
        }`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; color: #1f2937; background: #ffffff; max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.8rem; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  .updated { color: #4b5563; margin: 0 0 24px; }
  a { color: #1d4ed8; }
  @media (prefers-color-scheme: dark) { body { color: #e5e7eb; background: #111827; } .updated { color: #9ca3af; } a { color: #93c5fd; } }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="updated">Last updated: ${escapeHtml(c.updated)}</p>
${body}
</body>
</html>
`;
}
