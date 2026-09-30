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

## Apps for businesses

- **Template screenshots.** Every template card and the showcase under the hero show the app's home screen. These are rendered by Appmaker's own preview runtime at iPhone size: the habit, budget, workout and journal templates are the built-in sample apps, and the others are a one-screen app with the template's content. After adding or changing a template, run `npm run build && APPMAKER_DEMO=1 npx next start -p 3150`, then `npx tsx scripts/template-screens.ts`. A unit test checks that every template has an image.
- **Two ways to start: Prompt to App and URL to App.** They're tabs on the prompt box, and a section on the home page shows them side by side, each with a "Try" button that opens that tab. The admin **Build from a website** switch hides URL to App everywhere.
- **Share links for URL to App.** `https://your-site/?url=theirbusiness.com` opens Appmaker and reads that website straight away, ready to build. Send one to a business owner as "see your website as an app". `/?mode=url` just opens the URL to App tab. The link is removed from the address bar after it's used, so a reload doesn't read the site again.
- **Business templates** on the home page: restaurant or café, salon or barber, gym, clinic, local shop, church, real estate and home services. Each fills in a prompt with [bracketed] blanks for the business's details. The first blank is selected so you can type straight over it. The AI never makes up anything left in brackets.
- **Photos and contact details from the website.** URL to App now also finds:
  - the logo and up to 16 photos (https only; tracking pixels and tiny icons are skipped);
  - phone numbers, emails, WhatsApp, Maps, booking or ordering, and social links;
  - the address and opening hours from the site's structured data.

  The website card shows what was found. The AI uses the photos with `<Image source={{ uri }}>` and uses only these exact details. All of it is checked again on the server before the AI sees it.
- **One-tap actions.** Business apps get a Contact or Visit screen with Call, Email, Directions, WhatsApp, and Book or Order buttons (`Linking.openURL`), and an "Open now" badge when the hours are known. A button is only added when the real detail is known.
- **Your logo as the app icon.** In the Publish tab, under **App icon → Use your logo**. Choose a white or brand-color background, or have the image fill the icon. The icon always has a solid background, because stores reject see-through icons. The logo is resized in the browser and kept with the app, not in the store listing sent to the AI. It's used for downloads, cloud builds and the Expo Go preview.

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

## Admin dashboard

Set `ADMIN_PASSWORD` on the server, then open `/admin`. To change the password, edit the variable and redeploy; this signs everyone out of admin. Admin sign-in is limited to 5 attempts per 15 minutes, and the admin cookie is signed, `httpOnly`, `SameSite=Strict` and lasts 12 hours.

- **Overview.** Members, new and active this week, apps saved in accounts, and how many members use passkeys or Google, plus a 14-day sign-ups chart with a table view.
- **Members.** Search by email and see when each member joined, when they were last active, how they sign in and how many apps they have. You can sign a member out everywhere, or delete them together with their apps (you type their email to confirm).
- **Apps.** Every app saved in an account, with its icon, owner and original idea. Search by app name, owner or idea, or click a member's app count to see just their apps. **View** opens the app read-only: a live phone preview (in the same sandbox as the builder), the store listing, the code and the conversation. Admins can also delete an app; it disappears from the owner's devices on their next sync.
- **Settings.** Switches saved in the database, applied within seconds with no redeploy, and enforced on the server:
  - **Sign in with Google:** off by default.
  - **Passkeys.**
  - **New account sign-ups.**
  - **Build from a website.**
  - **Expo cloud builds.**
  - **Public status page:** when off, `/status` is visible only to a signed-in admin.

## Three checks before an app is shown

Every new version of an app, whether a first build or a change, runs three automatic checks before it appears in the phone preview. Until then the phone shows "Running checks…".

1. **Quality.** The code must run on iPhone and Android: allowed imports only, no web-only code, no asset files, and a valid entry point.
2. **Claim-safe wording.** No marketing claims (see below). This is skipped if the app uses Standard wording.
3. **Health, medical and financial claims.** Always on (`src/lib/regulated.ts`). The app can't say it diagnoses, treats, cures or prevents a disease, or use "clinically proven", "FDA approved", "doctor recommended", "burn fat", "detox", "boosts immunity" or "replaces your medication". Apps about symptoms, medication or vital signs must include a "not medical advice" line in the app and the store listing. No financial promises such as "guaranteed returns" or "risk-free".

The AI is told these rules up front. Problems found afterwards go back to the AI in one repair pass. The app appears once all checks pass, or after two repair attempts, in which case anything left is listed in the Publish checklist.

## Claim-safe wording (on by default)

The **Wording** control, next to the AI model button on the home page and in the chat, has two options:

- **Claim-safe (default).** App text and the store listing stay descriptive. The AI is told not to use:
  - superlatives and rankings: "best", "#1", "leading", "world's fastest"
  - absolutes: "100%", "guaranteed", "never", "always"
  - speed promises: "in seconds", "instantly", "10x faster"
  - unsupported comparisons: "faster", "better"

  After every build, a checker (`src/lib/claims.ts`) scans the text people see (JSX text and prose strings, not code, comments or imports) and the store listing. Anything it finds is rewritten in the automatic fix pass, and the Publish checklist shows the result.
- **Standard.** No wording rules.

The choice is saved per app, and new apps start with the last choice made on the home page.

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
- The preview runs in an iframe with `sandbox="allow-scripts allow-modals"`: no same-origin access (so no cookies, saved keys or page access), no form submission, no popups and no navigating the page. The builder only accepts messages from its own preview frame.
- **App code safety check** (`src/lib/code-safety.ts`). Every app is checked, whoever wrote the code (the AI or a hand edit). The check blocks:
  - code built from text: `eval`, `new Function` and string timers;
  - WebAssembly and background workers;
  - obfuscated or minified code, and large encoded blobs (images embedded as `data:image` are allowed);
  - crypto-mining code, and data sent to Telegram bots or Discord webhooks;
  - `require.context` and computed `require()`/`import()` paths;
  - imports that reach outside the app: absolute paths, URLs, or `../` past the project.

  In the builder, the check is part of the automatic quality check, so the AI removes them. On the server, Expo builds and phone previews refuse them. Admins see a warning on the member's app, and its preview stays paused until they choose to run it.
- **Bundling on the server is confined.** Phone previews are bundled on Appmaker's server, so that project gets a Metro config that refuses any file outside the app folder and the installed packages. Other builds' signing files and the server's own files can't end up in a bundle, even if the pattern check misses something. Store builds are bundled on Expo's servers.
- Security headers are set in `next.config.ts`: `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` and HSTS.
- The API key stays on the server and is never sent to the browser.
- **Website import is protected against SSRF.** Only `http`/`https` on standard ports is allowed. Each connection, including every redirect, is checked when DNS resolves, and refused if it points at a private, loopback, link-local or cloud-metadata address. Page size, redirects and response time are all capped.
- Imported website text is fenced as reference data, and the model is told to ignore any instructions inside it (prompt-injection defence).

## Test on a real iPhone, Android or your own phone

The builder's **Test on a device** menu has two ways to try an app before building it:

- **Your phone (Expo Go)**, the main option. Appmaker publishes the app with [EAS Update](https://docs.expo.dev/eas-update/introduction/) and shows a QR code. Install the free Expo Go app, then scan the code: with the Camera app on iPhone, or from inside Expo Go on Android. The app runs on Expo SDK 57, the same version as the App Store and Google Play builds, and no build is needed. Publishing takes about a minute. The QR code is saved with the app and says when the app has changed since.
  - It uses the same Expo account as cloud builds: the site's `EXPO_TOKEN`, or the user's own Expo account if they connected one. It counts toward the same daily limit (`APPMAKER_HOSTED_BUILD_LIMIT`). The admin "Cloud builds" switch turns it off too.
  - On the server, the update is published with runtime version `exposdk:57.0.0` on the `expo-go` branch, and the QR code opens `exp://u.expo.dev/update/<update group ID>`. `expo-updates` is added only for this. Store builds and the downloaded project don't include it.
  - How to check it on your deployment: open an app, choose **Test on a device → Your phone (Expo Go)**, make the QR code and scan it. If Expo Go can't open it, check that the Expo Go on the phone supports SDK 57.
- **iPhone emulator** and **Android emulator** open the app in [Expo Snack](https://snack.expo.dev) in a new tab. These are real emulators, streamed into the browser, with a short queue at times. Snack can use an older Expo SDK, so some features may behave differently there.

To install the finished app itself, use a build from the Publish tab. A finished **Android — test app** build shows a QR code: scan it with the phone's camera to download and install the app. iPhones install through TestFlight: build for the App Store with automatic upload on.

Both the Expo Go preview and Snack send the app's code to Expo.

## Shipping a generated app

### One click, from the Publish tab (Expo cloud builds)

The **Build & upload with Expo** section builds the real app on Expo's servers (EAS Build). No Mac or Xcode is needed.

**Whose Expo account runs the builds**

- **Hosted (recommended for a SaaS).** Set `EXPO_TOKEN` on the server, for example in Railway → Variables. Builds then run on your Expo account and users never need one, like on the larger app builders. Use a robot user's token from an Expo organization, and optionally set `APPMAKER_EXPO_ACCOUNT` to that organization's name. Each person gets `APPMAKER_HOSTED_BUILD_LIMIT` builds per day (default 10), because builds on your account count towards your Expo plan.
- **User's own account.** Without `EXPO_TOKEN`, each user connects their own Expo account with an access token (expo.dev → account Settings → Access tokens, [Expo's guide](https://docs.expo.dev/accounts/programmatic-access/)). On a hosted server users can still choose this under "Use my own Expo account instead". Their builds don't count towards the daily limit.

**Steps**

1. **Choose a build.** The options are an iPhone App Store build (`.ipa`), an Android test app (`.apk` to install on a phone) or a Google Play build (`.aab`).
2. **Build.** The first build creates the app's project on Expo (`eas init`). Status updates live, with download links.

**iPhone / App Store.** You need the Apple Developer Program ($99/year) and an **App Store Connect API key**: a Team key with Admin access, entered as its Key ID, Issuer ID and `.p8` file. With it, Appmaker does the Apple signing itself, and no one has to sign in to Apple or Expo:

- It registers the bundle ID and turns on Push Notifications if the app uses reminders.
- It creates an Apple Distribution certificate, once per Apple team. Apple allows only a few per team, so the certificate and its private key go back to the user's browser in a password-protected `.p12` and are reused for every later build and app. If the certificate is revoked, Appmaker creates a new one.
- It creates an App Store provisioning profile, and reuses it until it becomes invalid.
- It passes these files to EAS as local credentials (`credentials.json` and `credentialsSource: "local"`).
- Once the app exists in App Store Connect, adding its Apple ID turns on automatic upload. Each iOS build is then sent to App Store Connect when it finishes (`--auto-submit`) and appears in TestFlight. Submitting for review stays a manual step in App Store Connect.

When the builds run on the user's own Expo account, the API key is optional. Without it, the Publish tab offers the command-line route instead: `npx eas-cli@latest credentials:configure-build --platform ios --profile production`.

**Google Play.** Google requires the first upload of a new app to be done by hand in Play Console, so Appmaker gives you the `.aab` to upload.

**Server requirements.** The server runs `eas-cli` (a dependency) and installs the Expo SDK packages once, about 350 MB, to evaluate app config plugins. It needs a long-running Node server with `npm` and a writable temp folder. Railway, Render or a VPS all work; serverless hosts such as Vercel do not. Each build is written to a temporary folder that is deleted afterwards. The EAS CLI runs with a minimal environment: only the Expo token and proxy settings, so the server's AI keys are never passed to it. The App Store Connect key, certificate and profile are written with `0600` permissions and are `.gitignore`d, so they never go into the uploaded source. The server stores none of them: they come from the user's browser with each build.

### By hand, from the exported zip

```bash
npm install && npx expo start            # try it on a phone with Expo Go
npx eas-cli@latest login && npx eas-cli@latest init
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform all
```

Publishing needs an Apple Developer account and a Google Play Console account.

## Accounts and cloud saving

Without a database, projects live in each visitor's browser (`localStorage`, about 5 MB). Add PostgreSQL to turn on accounts:

1. In Railway, click **+ New → Database → PostgreSQL** in the same project.
2. On the Appmaker service's **Variables** tab, add `DATABASE_URL` and choose **Add Reference → Postgres → DATABASE_URL**. Then deploy.
3. `/status` shows **Database connected**, and a **Sign in** button appears in the header.

How it works:

- **Sign-in.** Email and password. Passwords are hashed with scrypt. Sessions are random tokens in an `httpOnly`, `SameSite=Lax` cookie, and only their SHA-256 hash is stored.
- **Protection.** Sign-in is rate limited per address and per account. State-changing requests must come from the same site and be JSON.
- **Saving.** The browser stays the working copy, so the builder is instant and works offline. Every change is saved to the account about 1.5 seconds later; unsaved changes are retried and survive a reload.
- **Syncing.** On load, the account and the browser are merged: the newest copy of each project wins, and deletions carry over to other devices.
- **First sign-in.** Apps made before signing in are added to the account.
- **Sign-out.** Removes the apps from that browser; they stay in the account. It refuses while changes are still unsaved, unless you choose "Sign out anyway".
- **Limits.** Up to 500 apps per account, 4 MB each.
- **Tables.** `app_users`, `app_sessions` and `app_projects` are created automatically on first use.
- **Not included yet.** Password reset by email, which needs an email service.

### Passkeys (Face ID, fingerprint or device passcode)

Signed-in people can add a passkey from the account menu, or from the one-time "Skip the password next time" card on My apps. After that, **Sign in with a passkey** on the sign-in page uses Face ID, a fingerprint or the device passcode, with a small confetti celebration (skipped for people who prefer reduced motion). There's nothing to set up: passkeys work on any HTTPS site with the database on.

- **Standard.** WebAuthn via [SimpleWebAuthn](https://simplewebauthn.dev). The device keeps the private key; the `app_passkeys` table stores only public keys, so its contents can't be used to sign in.
- **Challenges.** Each sign-in or registration uses a one-time challenge that expires after 5 minutes, tied to the browser by a `SameSite=Strict` cookie.
- **Syncing.** Passkeys sync across devices through iCloud Keychain and Google Password Manager.
- **Management.** Passkeys are named after the device (iPhone, Mac, Android phone…), can be removed at any time, and are limited to 20 per account.

### Sign in with Google

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), set up the OAuth consent screen (External; app name, support email).
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add `https://<your-domain>/api/auth/google/callback`. `/status` shows the exact address.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server and deploy. A **Continue with Google** button then appears on the sign-in page.

How it works:

- **Flow.** Authorization code with PKCE, with the state stored in a short-lived `httpOnly` cookie. Google's token is checked for audience, issuer, expiry and a verified email.
- **Existing accounts.** A Google sign-in with the same address as an existing email account links to that account.
- **Passwords.** Google-only accounts have no password.
- **Custom domain.** If you use one, set `APP_URL` (for example `https://appmaker.com`) so the callback address is always right.

Tests: set `TEST_DATABASE_URL` to run the account tests (`npm test`, `npm run test:e2e`). CI starts a PostgreSQL service for them.

## Roadmap / not yet implemented

The UI is ready for a hosted SaaS, but these parts are not wired up yet:

- **Billing.** Pricing tiers are shown on the landing page, but there's no payment integration or usage metering yet.
- **Store metadata upload.** Listing text and screenshots are still pasted into App Store Connect by hand; `eas metadata:push` could automate this.
- **On-device preview.** A QR code for Expo Go (for example, through Expo Snack) is not included yet.
