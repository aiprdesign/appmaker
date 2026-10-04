export type FileMap = Record<string, string>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Files the assistant wrote in this turn. */
  files?: string[];
  /** Set on messages the builder sent automatically to repair the app, and on the review agents' findings. */
  kind?: "auto-fix" | "review";
  /** The UX or UI agent's findings (kind "review"). */
  review?: import("./review").Review;
  /** A review's findings were sent to the AI to fix. */
  fixing?: boolean;
  /** The request failed; the UI offers to try it again. */
  error?: boolean;
  /** Snapshot of the app right after this reply, for "restore". */
  versionId?: string;
  /** The user's 👍 / 👎 on this version. */
  feedback?: "up" | "down";
  createdAt: number;
}

/** App Store / Google Play listing metadata, generated alongside the code. */
export interface StoreListing {
  name: string;
  subtitle: string;
  description: string;
  keywords: string;
  category: string;
  bundleId: string;
  primaryColor: string;
  iconEmoji: string;
  privacyNotes: string;
  /** Required by the App Store: a page where users can get help. */
  supportUrl?: string;
  /** Required by both stores: a hosted privacy policy. */
  privacyPolicyUrl?: string;
  /** The iOS app also runs on iPad (needs iPad screenshots). On unless turned off. */
  ipad?: boolean;
}

/** A saved state of the app the user can go back to. */
export interface Version {
  id: string;
  createdAt: number;
  /** What produced it, e.g. the request or "Restored an earlier version". */
  label: string;
  files: FileMap;
  listing: StoreListing;
}

/** A request that was running when the page closed. */
export interface PendingRequest {
  prompt: string;
  startedAt: number;
}

/** One page read during a website import. */
export interface SitePage {
  url: string;
  title: string;
  headings: string[];
  navigation: string[];
  text: string;
}

/** Ways to reach a business, found on its website. */
export interface SiteContact {
  phones: string[];
  emails: string[];
  /** Street address, from the site's structured data. */
  address?: string;
  /** Opening hours as the site states them, e.g. "Mo-Fr 09:00-17:00". */
  hours: string[];
  whatsapp?: string;
  /** Link to the business's booking, reservation or online ordering page. */
  booking?: string;
  /** Link that opens the business in Google or Apple Maps. */
  maps?: string;
  social: string[];
}

/** Content extracted from a website the user imported to base an app on. */
export interface SiteSummary {
  url: string;
  siteName: string;
  title: string;
  description: string;
  /** Likely brand colors, most prominent first. */
  colors: string[];
  language: string;
  pages: SitePage[];
  /** The business's logo (https link), if the site marks one. */
  logo?: string;
  /** Photo links from the site (https only). Older imports don't have them. */
  images?: string[];
  contact?: SiteContact;
}

/** The Expo (EAS) project an app is linked to, created on its first cloud build. */
export interface ExpoLink {
  projectId: string;
  owner: string;
  slug: string;
  /** Linked on the site's Expo account (hosted builds) rather than the user's own. */
  hosted?: boolean;
}

/** An Apple Distribution certificate Appmaker created, kept in the user's browser. */
export interface AppleSigning {
  /** Issuer ID of the key that created it: certificates belong to one Apple team. */
  issuerId: string;
  certificateId: string;
  serialNumber?: string;
  expires?: string;
  /** Base64 .p12 with the certificate and its private key. */
  p12: string;
  password: string;
}

/** What a cloud build produces: an App Store build, a Play Store bundle or an installable APK. */
export type BuildTarget = "ios" | "android" | "android-apk";

/** A build running (or finished) on Expo's servers. */
export interface CloudBuild {
  id: string;
  target: BuildTarget;
  /** EAS status: NEW, IN_QUEUE, IN_PROGRESS, FINISHED, ERRORED, CANCELED… */
  status: string;
  createdAt: number;
  appVersion?: string;
  buildNumber?: string;
  /** Download link for the finished .ipa / .aab / .apk. */
  artifactUrl?: string;
  error?: string;
  queuePosition?: number;
  waitSeconds?: number;
  /** Set when the build was sent to App Store Connect automatically. */
  submission?: { status: string; error?: string };
}

/** Design settings, applied through src/theme.js (see src/lib/design.ts). */
export interface AppDesign {
  primary: string;
  /** "auto" follows the phone's light or dark setting. */
  mode: "auto" | "light" | "dark";
  corners: "sharp" | "rounded" | "soft";
  cards: "flat" | "raised" | "outlined";
  headings: "light" | "regular" | "bold";
}

/** The app's hosted support page and privacy policy. */
export interface StorePagesState {
  id: string;
  developer: string;
  email: string;
  website?: string;
  /** What the pages were made from, to tell when they need updating. */
  fingerprint: string;
}

/** A logo used as the app icon (see src/lib/icon.ts). */
export interface AppIconImage {
  /** The logo as a data URL (PNG, JPEG or WebP, at most 1024 px). */
  image: string;
  /** "white" or "brand": the logo centered on that color; "fill": the image covers the whole icon. */
  background: "white" | "brand" | "fill";
}

/** The app published for Expo Go (EAS Update), opened by scanning a QR code. */
export interface PhonePreview {
  groupId: string;
  /** exp:// link that Expo Go opens. */
  url: string;
  platforms: string[];
  publishedAt: number;
  /** Fingerprint of the app it was published from (see previewSource). */
  source?: string;
}

export interface ExpoState {
  link?: ExpoLink;
  /** The latest preview published for Expo Go. */
  phone?: PhonePreview;
  /** App Store Connect "Apple ID" of the app (a number), needed for uploads. */
  ascAppId?: string;
  builds?: CloudBuild[];
}

export interface Project {
  id: string;
  name: string;
  prompt: string;
  files: FileMap;
  messages: ChatMessage[];
  listing: StoreListing;
  /** Website the app is based on, if one was imported. */
  source?: SiteSummary;
  /** Earlier states of the app, oldest first. */
  versions?: Version[];
  /** Set while a request runs; left behind if the page closed mid-build. */
  pending?: PendingRequest;
  /** Cloud builds with Expo Application Services. */
  expo?: ExpoState;
  /** Design settings from the Design tab; without them the design follows the listing's brand color. */
  design?: AppDesign;
  /** Live updates from the business's website (see src/lib/live.ts). */
  live?: { id: string; url: string; feedUrl: string; fetchedAt: string | null; error?: string | null };
  /** Bookings run by Appmaker (see src/lib/booking.ts): the app's booking address. */
  booking?: { id: string; apiUrl: string };
  /** Hosted support page and privacy policy (see src/lib/store-pages.ts). */
  storePages?: StorePagesState;
  /** The business's logo as the app icon; without it, the icon is drawn from the emoji. */
  icon?: AppIconImage;
  /** "claim-safe" (default): app text and listing avoid marketing claims. */
  wording?: "claim-safe" | "standard";
  createdAt: number;
  updatedAt: number;
}
