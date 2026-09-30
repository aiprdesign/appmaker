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
      paragraphs: [
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
  ];
}
