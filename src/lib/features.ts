/** Site features the owner can switch on and off in /admin (shared by server and browser). */
export const FEATURES = {
  google: {
    label: "Sign in with Google",
    description: "Shows “Continue with Google” on the sign-in page. Also needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    default: false,
  },
  passkeys: { label: "Passkeys", description: "Sign in with Face ID, a fingerprint or the device passcode.", default: true },
  signups: { label: "New account sign-ups", description: "Lets new people create accounts. Existing accounts can always sign in.", default: true },
  websiteImport: { label: "Build from a website", description: "URL to App: the tab and section on the home page.", default: true },
  bookings: {
    label: "Bookings",
    description: "Apps can take bookings: customers pick a free time in the app, and the business manages them on an owner page. Off until you turn it on.",
    default: false,
  },
  appData: {
    label: "App database",
    description: "Apps can keep shared data (orders, requests, reviews, a menu the business edits) in Appmaker's own database: no Supabase or server to set up.",
    default: true,
  },
  autoAppData: {
    label: "Turn on the app database automatically",
    description:
      "While you're developing: when an app needs one (orders, bookings, requests), its database turns on by itself for signed-in builders, so the owner page and staff mode work at once. Turn off to have people turn it on themselves in Publish.",
    default: true,
  },
  cloudBuilds: { label: "Expo cloud builds", description: "“Build & upload with Expo” in the Publish tab.", default: true },
  publicStatus: { label: "Public status page", description: "Anyone can open /status. When off, only a signed-in admin can.", default: true },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type Features = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function defaultFeatures(): Features {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, FEATURES[k].default])) as Features;
}
