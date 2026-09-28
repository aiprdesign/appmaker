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
  createdAt: number;
  updatedAt: number;
}
