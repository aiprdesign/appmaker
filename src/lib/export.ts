import JSZip from "jszip";
import type { Project, StoreListing } from "./types";
import { isAllowedPath } from "./validate";

/** Versions from the Expo SDK 57 bundledNativeModules manifest. */
const EXPO_DEPS: Record<string, string> = {
  expo: "~57.0.25",
  "expo-status-bar": "~57.0.1",
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.3",
  "react-native-web": "~0.21.0",
  "@react-native-async-storage/async-storage": "2.2.0",
  "react-native-safe-area-context": "~5.7.0",
  "expo-haptics": "~57.0.3",
};

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "my-app"
  );
}

/** Draws the app icon (emoji on a gradient) to a square PNG. */
export async function renderIcon(listing: StoreListing, size = 1024): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, shade(listing.primaryColor, 0.25));
  g.addColorStop(1, shade(listing.primaryColor, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${size * 0.56}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(listing.iconEmoji || "✨", size / 2, size / 2 + size * 0.04);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const gr = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (gr << 8) | b).toString(16).slice(1)}`;
}

export function usedDependencies(project: Project): Record<string, string> {
  const code = Object.values(project.files).join("\n");
  const deps: Record<string, string> = {};
  for (const [name, version] of Object.entries(EXPO_DEPS)) {
    const always = ["expo", "react", "react-dom", "react-native", "react-native-web", "expo-status-bar"].includes(name);
    if (always || code.includes(`'${name}'`) || code.includes(`"${name}"`)) deps[name] = version;
  }
  return deps;
}

export function appJson(project: Project) {
  const l = project.listing;
  return {
    expo: {
      name: l.name,
      slug: slugify(l.name),
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      splash: { image: "./assets/icon.png", resizeMode: "contain", backgroundColor: l.primaryColor },
      ios: {
        bundleIdentifier: l.bundleId,
        buildNumber: "1",
        supportsTablet: true,
        infoPlist: { ITSAppUsesNonExemptEncryption: false },
      },
      android: {
        package: l.bundleId.replace(/-/g, "_"),
        versionCode: 1,
        adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: l.primaryColor },
      },
      web: { favicon: "./assets/icon.png" },
    },
  };
}

const EAS_JSON = {
  cli: { version: ">= 16.0.0", appVersionSource: "remote" },
  build: {
    development: { developmentClient: false, distribution: "internal" },
    preview: { distribution: "internal", android: { buildType: "apk" } },
    production: { autoIncrement: true },
  },
  submit: { production: {} },
};

function readme(project: Project): string {
  const l = project.listing;
  return `# ${l.name}

${l.subtitle}

Built with Appmaker. This is a standard [Expo](https://expo.dev) React Native project.

## Run it on your phone

\`\`\`bash
npm install
npx expo start
\`\`\`

Scan the QR code with the **Expo Go** app (iOS / Android).

## Ship to the App Store and Google Play

1. Install the EAS CLI and log in: \`npm install -g eas-cli && eas login\`
2. Link the project: \`eas init\`
3. Build release binaries: \`eas build --platform all --profile production\`
4. Submit:
   - iOS (requires an Apple Developer account): \`eas submit --platform ios\`
   - Android (requires a Google Play Console account): \`eas submit --platform android\`

Or push to GitHub and add an \`EXPO_TOKEN\` secret — the included workflow builds and submits on every tag.

## Store listing

- **Name:** ${l.name}
- **Subtitle:** ${l.subtitle}
- **Category:** ${l.category}
- **Keywords:** ${l.keywords}
- **Bundle ID:** ${l.bundleId}
- **Privacy:** ${l.privacyNotes}
- **Support URL:** ${l.supportUrl || "(add in Appmaker's Publish tab)"}
- **Privacy policy URL:** ${l.privacyPolicyUrl || "(add in Appmaker's Publish tab)"}

### Description

${l.description}
`;
}

const WORKFLOW = `name: EAS build & submit
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: \${{ secrets.EXPO_TOKEN }}
      - run: npm install
      - run: eas build --platform all --profile production --non-interactive --auto-submit
`;

export async function exportProjectZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const slug = slugify(project.listing.name);
  const root = zip.folder(slug)!;
  root.file(
    "package.json",
    JSON.stringify(
      {
        name: slug,
        version: "1.0.0",
        main: "index.js",
        private: true,
        scripts: {
          start: "expo start",
          ios: "expo start --ios",
          android: "expo start --android",
          web: "expo start --web",
        },
        dependencies: usedDependencies(project),
        devDependencies: { "@babel/core": "^7.25.0" },
      },
      null,
      2,
    ),
  );
  root.file("index.js", "import { registerRootComponent } from 'expo';\nimport App from './App';\n\nregisterRootComponent(App);\n");
  root.file("app.json", JSON.stringify(appJson(project), null, 2));
  root.file("eas.json", JSON.stringify(EAS_JSON, null, 2));
  root.file("babel.config.js", "module.exports = function (api) {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n");
  root.file(".gitignore", "node_modules/\n.expo/\ndist/\nweb-build/\n*.jks\n*.p8\n*.p12\n*.key\n*.mobileprovision\n");
  root.file("README.md", readme(project));
  root.file(".github/workflows/eas.yml", WORKFLOW);
  root.file("assets/icon.png", await renderIcon(project.listing));
  for (const [path, code] of Object.entries(project.files)) {
    if (isAllowedPath(path)) root.file(path, code);
  }
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
