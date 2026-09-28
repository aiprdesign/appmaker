export type FileMap = Record<string, string>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Files the assistant wrote in this turn. */
  files?: string[];
  /** Set on messages the builder sent automatically to repair the app. */
  kind?: "auto-fix";
  /** The request failed; the UI offers to try it again. */
  error?: boolean;
  /** Snapshot of the app right after this reply, for "restore". */
  versionId?: string;
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

export interface ExpoState {
  link?: ExpoLink;
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
  /** "claim-safe" (default): app text and listing avoid marketing claims. */
  wording?: "claim-safe" | "standard";
  createdAt: number;
  updatedAt: number;
}
