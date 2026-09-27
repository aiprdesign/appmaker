export type FileMap = Record<string, string>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Files the assistant wrote in this turn. */
  files?: string[];
  /** Set on messages the builder sent automatically to repair the app. */
  kind?: "auto-fix";
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
  createdAt: number;
  updatedAt: number;
}
