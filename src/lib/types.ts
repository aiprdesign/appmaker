export type FileMap = Record<string, string>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Files the assistant wrote in this turn. */
  files?: string[];
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

export interface Project {
  id: string;
  name: string;
  prompt: string;
  files: FileMap;
  messages: ChatMessage[];
  listing: StoreListing;
  createdAt: number;
  updatedAt: number;
}
