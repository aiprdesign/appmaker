import type { ExpoLink, Project } from "./types";
import { isAllowedPath } from "./validate";

/**
 * The files of a standard Expo project for an app, shared by the zip export
 * (in the browser) and cloud builds (on the server). The icon PNG is drawn
 * in the browser, so it is added by the caller.
 */

/** Versions from the Expo SDK 57 bundledNativeModules manifest. */
export const EXPO_DEPS: Record<string, string> = {
  expo: "~57.0.25",
  "expo-status-bar": "~57.0.1",
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.3",
  "react-native-web": "~0.21.0",
  "@react-native-async-storage/async-storage": "2.2.0",
  "react-native-safe-area-context": "~5.7.0",
  "expo-haptics": "~57.0.3",
  "expo-notifications": "~57.0.21",
  "expo-image-picker": "~57.0.20",
  // Not imported by apps: installed on the server so previews can be
  // published with EAS Update for Expo Go.
  "expo-updates": "~57.0.24",
  // Icons (ISC license) and the SVG library they draw with.
  "lucide-react-native": "^1.49.0",
  "react-native-svg": "15.15.4",
};

/** The Expo SDK the apps target, as Expo Go names it (e.g. "57.0.0"). */
export const EXPO_SDK = `${EXPO_DEPS.expo.replace(/^\D*/, "").split(".")[0]}.0.0`;

/**
 * Runtime version of updates Expo Go can open: Expo Go runs any update made
 * for its own SDK, with no build of the app needed.
 */
export const EXPO_GO_RUNTIME = `exposdk:${EXPO_SDK}`;

export const ICON_PATH = "assets/icon.png";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "my-app"
  );
}

export function usedDependencies(project: Project): Record<string, string> {
  const code = Object.values(project.files).join("\n");
  const deps: Record<string, string> = {};
  for (const [name, version] of Object.entries(EXPO_DEPS)) {
    if (name === "expo-updates") continue;
    // react-native-svg comes with the icons.
    if (name === "react-native-svg" && (code.includes("'lucide-react-native'") || code.includes('"lucide-react-native"'))) {
      deps[name] = version;
      continue;
    }
    const always = ["expo", "react", "react-dom", "react-native", "react-native-web", "expo-status-bar"].includes(name);
    if (always || code.includes(`'${name}'`) || code.includes(`"${name}"`)) deps[name] = version;
  }
  return deps;
}

export function usesPackage(project: Project, pkg: string): boolean {
  return Object.values(project.files).some((code) => code.includes(`'${pkg}'`) || code.includes(`"${pkg}"`));
}

/** Native config some modules need; iOS rejects apps without permission texts. */
function plugins(project: Project): unknown[] {
  const uses = (pkg: string) => usesPackage(project, pkg);
  const name = project.listing.name || "This app";
  const list: unknown[] = [];
  if (uses("expo-notifications")) list.push("expo-notifications");
  if (uses("expo-image-picker")) {
    list.push([
      "expo-image-picker",
      {
        photosPermission: `${name} uses your photo library so you can add pictures.`,
        cameraPermission: `${name} uses the camera so you can take pictures.`,
      },
    ]);
  }
  return list;
}

/**
 * app.json; once linked to Expo, the project ID, owner and slug must stay fixed.
 * With expoGo, it's set up to publish an update that Expo Go can open.
 */
export function appJson(project: Project, link: ExpoLink | undefined = project.expo?.link, { expoGo = false } = {}) {
  const l = project.listing;
  const nativePlugins = plugins(project);
  return {
    expo: {
      name: l.name,
      slug: link?.slug ?? slugify(l.name),
      ...(link ? { owner: link.owner } : {}),
      version: "1.0.0",
      orientation: "portrait",
      icon: `./${ICON_PATH}`,
      userInterfaceStyle: "automatic",
      splash: { image: `./${ICON_PATH}`, resizeMode: "contain", backgroundColor: l.primaryColor },
      ios: {
        bundleIdentifier: l.bundleId,
        buildNumber: "1",
        // iPad: on unless turned off in the listing. Portrait only, full screen
        // (no Split View), which Apple requires for portrait-only iPad apps.
        supportsTablet: l.ipad !== false,
        ...(l.ipad !== false ? { requireFullScreen: true } : {}),
        infoPlist: { ITSAppUsesNonExemptEncryption: false },
      },
      android: {
        package: l.bundleId.replace(/-/g, "_"),
        versionCode: 1,
        adaptiveIcon: { foregroundImage: `./${ICON_PATH}`, backgroundColor: l.primaryColor },
      },
      web: { favicon: `./${ICON_PATH}` },
      ...(nativePlugins.length ? { plugins: nativePlugins } : {}),
      ...(link ? { extra: { eas: { projectId: link.projectId } } } : {}),
      ...(expoGo && link ? { runtimeVersion: EXPO_GO_RUNTIME, updates: { url: `https://u.expo.dev/${link.projectId}` } } : {}),
    },
  };
}

/** How `eas submit` reaches App Store Connect without a person at the keyboard. */
export interface IosSubmitConfig {
  ascAppId?: string;
  /** Path of the App Store Connect API key (.p8), relative to the project. */
  ascApiKeyPath?: string;
  ascApiKeyId?: string;
  ascApiKeyIssuerId?: string;
}

/** eas.json. With localIosCredentials, iOS builds sign with Appmaker's credentials.json instead of certificates stored at Expo. */
export function easJson(ios: IosSubmitConfig = {}, localIosCredentials = false) {
  const iosSubmit = Object.fromEntries(Object.entries(ios).filter(([, v]) => v));
  return {
    cli: { version: ">= 16.0.0", appVersionSource: "remote" },
    build: {
      development: { developmentClient: false, distribution: "internal" },
      preview: { distribution: "internal", android: { buildType: "apk" } },
      production: { autoIncrement: true, ...(localIosCredentials ? { ios: { credentialsSource: "local" } } : {}) },
    },
    submit: { production: Object.keys(iosSubmit).length ? { ios: iosSubmit } : {} },
  };
}

function readme(project: Project): string {
  const l = project.listing;
  const linked = project.expo?.link;
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

Appmaker can build and upload the app for you from its Publish tab. To do it yourself:

1. Log in to Expo: \`npx eas-cli@latest login\`
2. ${linked ? `This project is already linked to Expo (${linked.owner}/${linked.slug}).` : "Link the project: `npx eas-cli@latest init`"}
3. Build release binaries: \`npx eas-cli@latest build --platform all --profile production\`
4. Submit:
   - iOS (requires an Apple Developer account): \`npx eas-cli@latest submit --platform ios\`
   - Android (requires a Google Play Console account): \`npx eas-cli@latest submit --platform android\`

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

/**
 * Metro config for bundling on Appmaker's server (Expo Go previews): the
 * bundler may only read the app's own folder and the installed packages, so
 * an import like "../../other-build/credentials.json" can't pull in files
 * from elsewhere on the server.
 */
export const CONTAINED_METRO_CONFIG = `const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const root = fs.realpathSync(__dirname);
const packages = fs.realpathSync(path.join(__dirname, "node_modules"));
const inside = (file) => {
  const real = fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  return [root, packages].some((dir) => real === dir || real.startsWith(dir + path.sep));
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const result = context.resolveRequest(context, moduleName, platform);
  const files = result.type === "sourceFile" ? [result.filePath] : result.type === "assetFiles" ? result.filePaths : [];
  for (const file of files) {
    if (!inside(file)) throw new Error("Blocked import outside the app: " + moduleName);
  }
  return result;
};

module.exports = config;
`;

export const GITIGNORE = "node_modules/\n.expo/\ndist/\nweb-build/\n*.jks\n*.p8\n*.p12\n*.key\n*.mobileprovision\ncredentials.json\nios-certs/\n";

/** Every text file of the Expo project, keyed by path. */
export function expoProjectFiles(
  project: Project,
  options: { link?: ExpoLink; ios?: IosSubmitConfig; localIosCredentials?: boolean; expoGo?: boolean } = {},
): Record<string, string> {
  const slug = slugify(project.listing.name);
  const files: Record<string, string> = {
    "package.json": JSON.stringify(
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
        dependencies: { ...usedDependencies(project), ...(options.expoGo ? { "expo-updates": EXPO_DEPS["expo-updates"] } : {}) },
        devDependencies: { "@babel/core": "^7.25.0" },
      },
      null,
      2,
    ),
    "index.js": "import { registerRootComponent } from 'expo';\nimport App from './App';\n\nregisterRootComponent(App);\n",
    "app.json": JSON.stringify(appJson(project, options.link ?? project.expo?.link, { expoGo: options.expoGo }), null, 2),
    "eas.json": JSON.stringify(easJson(options.ios ?? { ascAppId: project.expo?.ascAppId }, options.localIosCredentials), null, 2),
    "babel.config.js": "module.exports = function (api) {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n",
    ".gitignore": GITIGNORE,
    "README.md": readme(project),
    ".github/workflows/eas.yml": WORKFLOW,
    ...(options.expoGo ? { "metro.config.js": CONTAINED_METRO_CONFIG } : {}),
  };
  for (const [path, code] of Object.entries(project.files)) {
    if (isAllowedPath(path)) files[path] = code;
  }
  return files;
}
