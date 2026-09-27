# Appmaker — prompt to App Store apps

Appmaker is a SaaS app builder in the spirit of Lovable, Bolt, v0 and Rork, focused on **native mobile apps**. Describe an app in plain English and Appmaker:

1. **Generates a real Expo / React Native app.** Claude writes a multi-screen app with navigation, on-device persistence and seed content, streaming files as it goes.
2. **Runs it live in a phone frame.** The code compiles in a sandboxed iframe on React Native Web, so you can tap through it in an iPhone or Android frame. Runtime errors show a **Fix with AI** button.
3. **Lets you iterate by chat.** Ask for changes ("add dark mode", "add onboarding") and only the changed files are rewritten. You can also edit code by hand in the Code tab.
4. **Gets it ready for the stores.** The Publish tab has an AI-written App Store / Google Play listing (name, subtitle, description, keywords, category, bundle ID, privacy), an icon generator (1024×1024 PNG), a launch checklist, and a one-click **Expo project export** with `app.json`, `eas.json`, the icon, and a GitHub Actions workflow that runs `eas build` and `eas submit`.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000, describe an app, and press Enter.

Without an `ANTHROPIC_API_KEY`, Appmaker runs in **demo mode**. It streams one of the hand-built starter apps in `demo-apps/` (habits, budget, fitness, journal), picked to match your prompt, so you can try the whole flow offline. Editing by chat needs a key.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables AI generation |
| `APPMAKER_MODEL` | Model override (default `claude-opus-5`) |
| `APPMAKER_DEMO=1` | Force demo mode |

## How it works

```
src/
  app/
    page.tsx                 Landing page: hero prompt box, templates, pricing, FAQ
    projects/                "My apps" dashboard
    build/[id]/              Builder workspace
    api/generate/route.ts    Streams generation from Claude (or the demo app)
  components/
    builder/Builder.tsx      Chat, preview, code and publish tabs; generation loop
    Preview.tsx, PhoneFrame.tsx
  lib/
    prompt.ts                System prompt and output protocol
    parse.ts                 Incremental parser for <file>/<listing>/<summary> tags
    preview.ts               Sandboxed preview document (Babel + CommonJS loader)
    export.ts                Expo project zip, app.json/eas.json, icon rendering
    storage.ts               Project persistence (localStorage)
preview-runtime/entry.js     React + React Native Web + shims, bundled by esbuild
demo-apps/                   Starter apps used in demo mode
```

- **Generation protocol.** The model replies with tagged sections: `<plan>`, then one `<file path="…">` per changed file, `<delete path="…"/>`, a JSON `<listing>`, and `<summary>`. The client parses the stream as it arrives, so the chat shows each file as it's written and the Code tab fills in live.
- **Preview sandbox.** `npm run dev` and `npm run build` first run `scripts/build-preview-runtime.mjs`. It bundles React, React Native Web and shims for `@react-native-async-storage/async-storage`, `expo-status-bar`, `react-native-safe-area-context` and `expo-haptics` into `public/preview/runtime.js`, and copies Babel standalone next to it. Because of this, previews don't depend on any third-party CDN. The iframe runs with `sandbox="allow-scripts"` and no same-origin access.
- **Allowed imports.** Generated apps may import only those modules plus `react` and `react-native`, which keeps every app previewable and buildable with Expo.

## Shipping a generated app

From the exported zip:

```bash
npm install && npx expo start            # try it on a phone with Expo Go
npm install -g eas-cli && eas login && eas init
eas build --platform all --profile production
eas submit --platform all
```

Publishing needs an Apple Developer account and a Google Play Console account.

## Roadmap / not yet implemented

The UI is ready for a hosted SaaS, but these parts are not wired up yet:

- **Accounts and cloud sync.** Projects are stored in the browser's localStorage. Replace `src/lib/storage.ts` with a database-backed API.
- **Billing.** Pricing tiers are shown on the landing page, but there's no payment integration or usage metering yet.
- **Hosted builds.** Store builds currently run through the user's own EAS account from the exported project. A server-side EAS integration, using a stored Expo token, would enable one-click submission.
- **On-device preview.** A QR code for Expo Go (for example, through Expo Snack) is not included yet.
