# Appmaker — prompt to App Store apps

Appmaker is a SaaS app builder in the spirit of Lovable, Bolt, v0 and Rork, focused on **native mobile apps**. Describe an app in plain English and Appmaker:

1. **Generates a real Expo / React Native app.** Claude writes a multi-screen app with navigation, on-device persistence and seed content, streaming files as it goes.
2. **Runs it live in a phone frame.** The code compiles in a sandboxed iframe on React Native Web, so you can tap through it in an iPhone or Android frame. Runtime errors show a **Fix with AI** button.
3. **Lets you iterate by chat.** Ask for changes ("add dark mode", "add onboarding") and only the changed files are rewritten. You can also edit code by hand in the Code tab.
4. **Gets it ready for the stores.** The Publish tab has an AI-written App Store / Google Play listing (name, subtitle, description, keywords, category, bundle ID, privacy), an icon generator (1024×1024 PNG), a launch checklist, **one-click cloud builds with Expo** (App Store upload included) and an **Expo project export** with `app.json`, `eas.json`, the icon, and a GitHub Actions workflow that runs `eas build` and `eas submit`.

## Build an app from a website

Click **Import website** under the prompt box, or type a link like `joespizza.com` into your prompt and choose **Use content from …**. Appmaker reads the page you link plus up to 3 key pages on the same site (menu, about, services, pricing, bookings and so on). It pulls out:

- the business name and description
- brand colors
- navigation, headings and page text

The AI uses these to build an app that feels like the business's official app, with its real products, prices, hours and tone. It also picks features that fit, such as ordering for a restaurant or booking for a salon. The site stays attached to the project, so later chat edits can use it too.

Limitations: the importer reads the HTML the server sends. Sites that load all their content with JavaScript, or that block bots, show a friendly error instead.

## What generated apps can do

Apps are self-contained Expo apps that save their data on the device. On top of screens, forms, lists, search, charts, animations and haptics, they can use:

- **Reminders and notifications** (`expo-notifications`): daily, weekly, dated or interval reminders. In the preview, scheduling shows a confirmation banner, and reminders due during the session pop up on the phone screen.
- **Photos and camera** (`expo-image-picker`): pick from the library or take a photo. In the preview this opens your computer's file picker, and large images are downscaled. The export adds the iOS permission texts Apple requires.
- **Live internet data**: `fetch` from free, keyless public APIs such as Open-Meteo (weather), Frankfurter (currency), Wikipedia and Open Library. The quality checks reject `http://` requests and secret keys embedded in app code.

Not yet supported: accounts and cloud sync, maps and GPS, payments, and audio and video.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000, describe an app, and press Enter.

Without an `ANTHROPIC_API_KEY`, Appmaker runs in **demo mode**. It streams one of the hand-built starter apps in `demo-apps/` (habits, budget, fitness, journal), picked to match your prompt, so you can try the whole flow offline. Editing by chat needs a key.

See `.env.example` for every option. The most important ones:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY` | Site-wide keys for each provider |
| `APPMAKER_PROVIDER` / `APPMAKER_MODEL` | Default provider and model (default Anthropic `claude-opus-5`) |
| `APPMAKER_DISABLE_CUSTOM_ENDPOINTS` | Turn off the "Any other AI" custom endpoint option |
| `APPMAKER_ALLOW_PRIVATE_ENDPOINTS` | Self-hosted installs only: allow local endpoints such as Ollama or LM Studio |
| `APPMAKER_RATE_LIMIT` / `APPMAKER_BYOK_RATE_LIMIT` / `APPMAKER_IMPORT_RATE_LIMIT` | Hourly limits per IP |
| `APPMAKER_DEMO=1` | Force demo mode |

## Choosing the AI model

Click the model button (under the prompt box, or in the builder's chat box) to open **AI model** settings:

- **Providers:** Anthropic Claude, OpenAI, Google Gemini, OpenRouter (hundreds of models), Groq, DeepSeek, xAI Grok, Mistral, Together AI, Fireworks AI, Perplexity, Cerebras, Replicate, Hugging Face, Cohere, Alibaba Qwen, Moonshot Kimi, NVIDIA NIM, SambaNova and DeepInfra. Replicate has its own connector (predictions + streaming); the rest use OpenAI-compatible APIs.
- **Your models:** type any model ID for any provider and press **Add**. It's kept in a "Your models" list for that provider, and any model you save with is remembered automatically. Remove entries with the trash icon.
- **Test model:** sends a tiny real request ("reply with OK") to the selected provider, key and model, and shows whether it replied, how fast, and what it said. It uses a small output budget and low effort, and is rate-limited separately.
- **Saved connections:** give a custom endpoint a name (e.g. "Work gateway") and it appears under **Your connections** in the provider list, with its address, format, key and model.
- **Paste any key:** the **Quick setup** box recognises the provider from the key's prefix (`sk-ant-`, `sk-or-`, `r8_`, `hf_`, `AIza`, `gsk_`, …). It switches to that provider, tests the key, loads its models and picks one, so the user just presses Save. A key pasted under the wrong provider moves to the right one automatically.
- **Any other AI:** users can connect any service with an OpenAI- or Anthropic-compatible API (Azure OpenAI, LiteLLM, Hugging Face, Qwen, Kimi, a company gateway…) by entering its base URL, API format, key and model. The **Fill from a known service** list fills in the address and format for dozens of services, including self-hosted Ollama, LM Studio, vLLM and LiteLLM. A bare domain is fixed automatically: `https://` is added, `/v1` is added for OpenAI-style APIs, and a trailing `/v1` is removed for Anthropic-style ones. For safety, only public `https` addresses are accepted. Every connection is checked when DNS resolves, redirects are refused, and a site-wide custom key is never sent to an address a user typed in.
- **Keys:** a provider marked **Ready** has a key set by the site owner. Users can also paste their own key, which is saved only in their browser. It's sent with each request so the server can call the provider, and it's never stored or logged. Requests on the user's own key are billed to their account and have a separate, higher rate limit.
- **Models:** each provider suggests a few models. **Test & load models** checks the key and loads every model it can use, and any model ID can be typed in.

Claude requests use adaptive thinking, high effort, prompt caching, and server-side refusal fallbacks where the model supports them. Other providers are called through their OpenAI-compatible APIs. Quality varies by model: smaller models are more likely to trip the automatic quality checks, which then repair the app.

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

## Quality gates for generated apps

Every app the AI produces goes through automatic checks before you see it:

1. **Static checks** (`src/lib/validate.ts`). `App.js` must exist with a default export, every import must be an allowed package or an existing local file, JSON files must be valid, and the code can't use web-only APIs (`document`, `localStorage`, `className`, HTML tags). File paths outside `App.js` / `src/` are refused, so a generated app can never overwrite export config or escape the project folder.
2. **Runtime check.** The app is run in the preview sandbox. A crash within a few seconds of generation counts as caused by that generation.
3. **Automatic repair.** If either check fails, the issues are sent back to the AI for a fix, up to 2 passes per request. Each pass shows as a "Quality check" note in the chat. If the app still fails after that, the **Fix with AI** button stays available.

## Testing

```bash
npm run check       # lint + typecheck + unit tests
npm run test:e2e    # builds the app and runs browser tests (demo mode, no key needed)
```

- **Unit tests** (`tests/unit`, Vitest) cover the stream parser, the quality checker (including that every built-in demo app passes it), the Expo exporter, API input validation and rate limiting.
- **End-to-end tests** (`tests/e2e`, Playwright) generate each demo app and tap through it. They also check persistence, the publish checklist and zip export, the crash banner, the dashboard and the mobile layout. Using a mocked AI, they verify that the auto-repair loop fixes static and runtime problems, stops after its budget, and rejects unsafe file paths.
- **CI** (`.github/workflows/ci.yml`) runs all of the above on every push.

## Measuring app quality (100-app evaluation)

`npm run eval` asks the AI to build 100 different apps (`evals/prompts.ts`, 14 categories including vague requests and follow-up edits). Every app goes through the same automatic repair loop as the builder, then gets graded on a 390×844 phone screen the way a user and an App Store reviewer would:

| Check | What it does |
| --- | --- |
| Opens without crashing | Loads the app and requires real content on screen |
| Tapping every control never crashes | Taps every button, tab and row, up to 40 taps |
| Forms create content | Fills in inputs (skipping search boxes), taps Add/Save, and looks for the new item |
| Data survives reopening | Reloads the app and looks for the saved item |
| Reaches 3+ screens | Counts distinct screens and states visited |
| Touch targets ≥ 44pt | Apple's minimum, measured on at least 90% of controls |
| Text contrast (WCAG AA) and no text under 11pt | Measured on every text element |
| Fits the phone width | Nothing cut off, except inside sideways carousels |
| Code checks, no placeholder text, saves data | Static analysis |
| Store listing valid | App Store Connect length limits, bundle ID, colour |

```bash
npm run eval                                   # all 100, default model
npm run eval -- --count 10                     # quick run
npm run eval -- --provider openai --model gpt-5.5 --concurrency 4
npm run eval -- --demo                         # no key: grades the built-in demo apps
```

The report lands in `evals/results/<time>/report.md`: the shippable rate, average score, pass rate per check, results by category, and every app with the reason it failed, plus a screenshot of each app. `tests/e2e/grader.spec.ts` proves the grader works: 12 deliberately broken apps must each fail exactly the right check, and the demo apps must score 100.

A full 100-app run makes 100–300 model calls (follow-ups and repairs included). Expect roughly US$30–70 on Claude Opus 5, and less on Sonnet 5 or smaller models. These are estimates; check your provider's usage page.

## Usability and accessibility of Appmaker itself

`tests/e2e/ux-audit.spec.ts` audits every main screen (home, website import, AI settings, my apps, builder chat/preview/code/publish) at phone, tablet and desktop sizes. It checks:

- WCAG 2.1 AA with axe-core
- no sideways page scrolling
- no console errors
- WCAG 2.2 minimum tap-target size on phones
- keyboard-only use, with a visible focus indicator

## Security

- The API validates and size-limits every request, and rate-limits AI generations per IP. The limiter is in memory; use a shared store such as Redis when running multiple instances.
- The preview runs in an iframe with `sandbox="allow-scripts"` and no same-origin access. The builder only accepts messages from its own preview frame.
- Security headers are set in `next.config.ts`: `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` and HSTS.
- The API key stays on the server and is never sent to the browser.
- **Website import is protected against SSRF.** Only `http`/`https` on standard ports is allowed. Each connection, including every redirect, is checked when DNS resolves, and refused if it points at a private, loopback, link-local or cloud-metadata address. Page size, redirects and response time are all capped.
- Imported website text is fenced as reference data, and the model is told to ignore any instructions inside it (prompt-injection defence).

## Shipping a generated app

### One click, from the Publish tab (Expo cloud builds)

The **Build & upload with Expo** section builds the real app on Expo's servers (EAS Build). No Mac or Xcode is needed.

1. **Connect Expo.** Paste an access token from [expo.dev → Account settings → Access tokens](https://expo.dev/settings/access-tokens). It is kept in the browser and sent only with build requests.
2. **Choose a build.** The options are an iPhone App Store build (`.ipa`), an Android test app (`.apk` to install on a phone) or a Google Play build (`.aab`).
3. **Build.** The first build creates the app's project on the user's Expo account (`eas init`). Status updates live, with download links and a link to the build on expo.dev.

**iPhone / App Store.** You need the Apple Developer Program ($99/year), plus two one-time setup steps:

- **Signing (once per app).** Apple requires an interactive sign-in to create the distribution certificate. The Publish tab gives a download and one command to run on any computer with Node.js: `npx eas-cli@latest credentials:configure-build --platform ios --profile production`. After that, Appmaker builds without prompts. If signing is missing, the build fails fast with a message that opens these steps.
- **Automatic upload (optional).** Add the app's App Store Connect Apple ID and an App Store Connect API key (Key ID, Issuer ID and the `.p8` file). Each iOS build is then sent to App Store Connect when it finishes (`--auto-submit`), where it appears in TestFlight. Submitting for review stays a manual step in App Store Connect.

**Google Play.** Google requires the first upload of a new app to be done by hand in Play Console, so Appmaker gives you the `.aab` to upload.

**Server requirements.** The server runs `eas-cli` (a dependency) and installs the Expo SDK packages once, about 350 MB, to evaluate app config plugins. It needs a long-running Node server with `npm` and a writable temp folder. Railway, Render or a VPS all work; serverless hosts such as Vercel do not. Each build is written to a temporary folder that is deleted afterwards. The EAS CLI runs with a minimal environment (the user's token plus proxy settings), so the server's own API keys are never passed to it. The App Store Connect key is written with `0600` permissions and is never included in the uploaded source (it is `.gitignore`d).

### By hand, from the exported zip

```bash
npm install && npx expo start            # try it on a phone with Expo Go
npx eas-cli@latest login && npx eas-cli@latest init
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform all
```

Publishing needs an Apple Developer account and a Google Play Console account.

## Roadmap / not yet implemented

The UI is ready for a hosted SaaS, but these parts are not wired up yet:

- **Accounts and cloud sync.** Projects are stored in the browser's localStorage. Replace `src/lib/storage.ts` with a database-backed API.
- **Billing.** Pricing tiers are shown on the landing page, but there's no payment integration or usage metering yet.
- **Store metadata upload.** Listing text and screenshots are still pasted into App Store Connect by hand; `eas metadata:push` could automate this.
- **On-device preview.** A QR code for Expo Go (for example, through Expo Snack) is not included yet.
