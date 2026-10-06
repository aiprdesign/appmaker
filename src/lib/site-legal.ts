/**
 * Terms of service and privacy policy for this Appmaker site. The site
 * owner fills in their details in Admin → Settings → Legal details; until
 * then the pages show highlighted [placeholders]. {{field}} marks where a
 * detail goes.
 */

export interface LegalDetails {
  /** The business that runs this site, e.g. "Acme Apps Ltd". */
  company: string;
  /** Where people can reach you about privacy and the terms. */
  email: string;
  /** Postal address (some laws require one). */
  address: string;
  /** Whose laws apply, e.g. "England and Wales" or "the State of California". */
  jurisdiction: string;
  /** When these versions take effect, YYYY-MM-DD. */
  effective: string;
}

export const LEGAL_FIELDS: { key: keyof LegalDetails; label: string; placeholder: string; hint: string }[] = [
  { key: "company", label: "Business name", placeholder: "Your company name", hint: "The business that runs this site." },
  { key: "email", label: "Contact email", placeholder: "your contact email", hint: "For privacy requests and questions about the terms." },
  { key: "address", label: "Postal address", placeholder: "your business address", hint: "Some privacy laws require a postal address." },
  { key: "jurisdiction", label: "Governing law", placeholder: "your country or state", hint: 'Whose laws apply, e.g. "England and Wales".' },
  { key: "effective", label: "Effective date", placeholder: "date", hint: "When this version takes effect (YYYY-MM-DD)." },
];

export const EMPTY_LEGAL: LegalDetails = { company: "", email: "", address: "", jurisdiction: "", effective: "" };

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

/** Checks the details from the admin; anything invalid is left blank (and shown as a placeholder). */
export function parseLegal(v: unknown): LegalDetails {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const text = (x: unknown, max: number) =>
    typeof x === "string"
      ? x
          .replace(/[\u0000-\u001f<>{}]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, max)
      : "";
  const email = text(o.email, 120);
  const effective = text(o.effective, 10);
  return {
    company: text(o.company, 100),
    email: EMAIL.test(email) ? email : "",
    address: text(o.address, 200),
    jurisdiction: text(o.jurisdiction, 80),
    effective: /^\d{4}-\d{2}-\d{2}$/.test(effective) ? effective : "",
  };
}

export const missingLegal = (d: LegalDetails) => LEGAL_FIELDS.filter((f) => !d[f.key]).map((f) => f.label);

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  /** Shown after the bullets. */
  after?: string[];
}

export function termsSections(): LegalSection[] {
  return [
    {
      heading: "About these terms",
      paragraphs: [
        'These terms are an agreement between you and {{company}} ("we", "us"), which runs Appmaker at this website. They apply when you use the site, whether or not you have an account. By using Appmaker you agree to them. If you use Appmaker for a business, you agree on behalf of that business.',
      ],
    },
    {
      heading: "What Appmaker does",
      paragraphs: [
        "Appmaker uses AI to create mobile apps from your descriptions or from a website you name, shows them in a preview, and helps you publish them. Depending on this site's settings it can also build apps for the App Store and Google Play, host support and privacy pages for your apps, keep apps up to date from a website, and take bookings in your apps.",
        "AI makes mistakes. Apps, text, listings and suggestions made by Appmaker may be incomplete, inaccurate or not suitable for your purpose. Check everything before you publish or rely on it.",
      ],
    },
    {
      heading: "Your account",
      paragraphs: [
        "You need to give a valid email address and keep your password or passkey safe. You're responsible for what happens in your account. Tell us at {{email}} straight away if you think someone else is using it. You must be old enough to agree to these terms where you live, and at least 13.",
      ],
    },
    {
      heading: "You are responsible for your apps",
      paragraphs: [
        "You're responsible for everything in your apps and their store listings: text, claims, prices, images and features. Make sure it's true, accurate and allowed, and that it follows the law and Apple's and Google's rules. That includes rules on advertising, consumer protection, privacy, health and financial claims, and intellectual property.",
        "Appmaker's claim-safe wording and its checks for health, medical and financial claims help, but they can't catch everything and aren't legal advice. Whether an app is accepted by Apple or Google is up to them.",
        "If your app collects information from its users (for example bookings), you are responsible to those users for how it's handled, and for having a privacy policy that describes it.",
        "Appmaker can draft your app's privacy policy, support page and terms of use from what its code does, but you are responsible for them, wherever they're hosted: what they say must be true and complete for your app and your business, including anything Appmaker can't see (such as services, tools or data you add outside it), and lawful where you publish. They're a starting point, not legal advice: read them, correct them, and keep them up to date.",
      ],
    },
    {
      heading: "What you may not do",
      paragraphs: ["Don't use Appmaker to make or publish anything that:"],
      bullets: [
        "is illegal, fraudulent, deceptive or misleading, or impersonates someone else;",
        "infringes anyone's copyright, trademark or other rights, including content copied from a website you don't have permission to use;",
        "is malware, spyware, or designed to collect information without consent;",
        "harasses, threatens or exploits anyone, or sexualises minors;",
        "tries to break, overload, probe or get around the limits or security of Appmaker.",
      ],
    },
    {
      heading: "Your content and your apps",
      paragraphs: [
        "You keep the rights you have in what you give us, like your descriptions, logos and text. You own the app code Appmaker creates for you and can download it and use it as you like, subject to the licenses of the open-source parts it uses (such as React Native, Expo and Lucide icons).",
        "You give us permission to store and process your content only as needed to run Appmaker for you: for example to send it to the AI service that writes your app, to show your preview, and to build and host what you ask for.",
        "When you use URL to App, you confirm you have the right to use that website's content and images in your app.",
      ],
    },
    {
      heading: "Credits and payments",
      paragraphs: [
        "Some actions cost credits, as shown on the Credits page. There are no subscriptions: you buy credit packs when you need them. Payments are processed by Stripe; we don't see or store your card details. Prices are shown before you pay and may include tax where required.",
        "Credits don't expire while this site offers them, have no cash value, and can't be transferred or exchanged. Free credits may be topped up monthly and don't carry over. Buying any pack unlocks the paid features for your account. Payments aren't refundable except where the law requires it or we decide otherwise; if an AI request fails before doing anything, its credits are returned automatically.",
        "We may change prices, what things cost in credits, and free allowances in the future. Changes don't affect credits you've already bought.",
      ],
    },
    {
      heading: "Other services",
      paragraphs: [
        "Appmaker relies on other services, such as AI providers, Expo, Apple, Google and Stripe. Their own terms apply when you use them through Appmaker (for example Apple's and Google's developer agreements when you publish). We're not responsible for their services, availability or decisions.",
      ],
    },
    {
      heading: "Availability and changes",
      paragraphs: [
        "We work to keep Appmaker running and your data safe, but we can't promise it will always be available or error-free. Keep your own copy of anything important (you can download each app). We may change or stop features, and we'll tell you in advance of changes that significantly affect you where we can.",
      ],
    },
    {
      heading: "Ending your use",
      paragraphs: [
        "You can stop using Appmaker at any time and delete your account yourself from the account menu (or ask us at {{email}}). We may suspend or close accounts that break these terms or put others at risk. Sections that by their nature should continue (like responsibility for your apps and the limits below) continue after your use ends.",
      ],
    },
    {
      heading: "Disclaimers and limits",
      paragraphs: [
        "Appmaker is provided \"as is\". To the extent the law allows, we don't give warranties that it's fit for a particular purpose, and we aren't liable for indirect or consequential losses, lost profits or lost data, or for apps and content you publish. Our total liability for anything relating to Appmaker is limited to the amount you paid us in the 12 months before the claim.",
        "Nothing in these terms limits rights you have as a consumer that can't be limited by agreement, or liability that can't be limited by law.",
      ],
    },
    {
      heading: "Law and disputes",
      paragraphs: [
        "These terms are governed by the laws of {{jurisdiction}}, and disputes go to its courts, unless the law where you live gives you the right to bring them there.",
      ],
    },
    {
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms. The date at the top shows the current version. If a change is significant, we'll tell you before it applies; using Appmaker after that means you accept the new terms.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: ["{{company}}, {{address}}. Email: {{email}}."],
    },
  ];
}

export function privacySections(): LegalSection[] {
  return [
    {
      heading: "Who we are",
      paragraphs: [
        "{{company}} runs Appmaker at this website and is responsible for your personal information when you use it. Questions or requests: {{email}}, or write to {{address}}.",
      ],
    },
    {
      heading: "What we collect",
      paragraphs: ["We collect only what we need to run Appmaker:"],
      bullets: [
        "Account details: your email address, a securely hashed password or your passkeys, or your Google account's email and ID if you sign in with Google.",
        "Your apps: your descriptions and chat messages, the app code, store listings, logos and settings. They're kept in your browser and, when you're signed in, in your account so they appear on your other devices.",
        "Websites you import: the public pages of a website you give us (text, images and contact details it shows), and, if you turn on live updates, fresh copies at most once a day.",
        "Credits and payments: your balance, what used credits, and your purchases. Stripe handles your card; we receive the payment's result, never your card number.",
        "Publishing: when you build or upload an app, the app and the keys needed for that build (such as your App Store Connect key) are used for that build only. Keys you enter for Expo, Apple or AI services are kept in your browser and sent only when needed; we don't store them on our servers.",
        "Technical information: your IP address and basic request details, used for security and to limit abuse (for example rate limits), and anonymous counts of how AI builds turn out (no prompts, code or personal information).",
      ],
    },
    {
      heading: "People who use your apps",
      paragraphs: [
        "If your app takes bookings through Appmaker, we store the booking details your customers enter (name, phone, time, service and note) on your behalf, so you can see and manage them. You decide how they're used; we process them only to run bookings for you, and delete them one year after the appointment. The privacy policy Appmaker creates for your app describes this for your customers.",
      ],
    },
    {
      heading: "How we use it",
      paragraphs: ["We use your information:"],
      bullets: [
        "to create, preview, save, build and host your apps, and to take bookings in them;",
        "to run your account and sign-in, and to keep Appmaker secure and prevent abuse;",
        "to handle credits and payments, and meet legal and tax obligations;",
        "to answer your messages, and to improve how good the apps are, using anonymous counts.",
      ],
      after: ["We don't sell your personal information, don't show ads, and don't use analytics or tracking cookies."],
    },
    {
      heading: "Services we use",
      paragraphs: ["We share information only with services that help run Appmaker, and only what they need:"],
      bullets: [
        "our hosting and database provider, which stores the site and your account;",
        "the AI provider that writes your apps, which receives your descriptions, chat and app code for each request;",
        "Stripe, for payments;",
        "Expo, when you build or preview apps on a phone, and Apple and Google when you publish;",
        "Google, if you choose to sign in with Google.",
      ],
    },
    {
      heading: "Cookies and storage",
      paragraphs: [
        "We use one essential cookie to keep you signed in. Your apps and some settings are also kept in your browser's storage so the builder works quickly and offline. There are no advertising or analytics cookies.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "We keep your account and apps until you delete them or delete your account (from the account menu, which removes everything in it straight away). When you delete an app, it's removed from your account. Bookings are deleted one year after the appointment, and anonymous quality counts after about 13 months. Stripe keeps payment records as long as tax law requires.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Depending on where you live, you can ask to see, correct, download or delete your personal information, object to or limit how we use it, and complain to your data protection authority. You can download each app yourself from the builder and delete your account from the account menu at any time; for anything else, email {{email}} and we'll respond within the time the law requires.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "Passwords are stored only as secure hashes, sign-in sessions as hashed tokens, and connections are encrypted. No system is perfectly secure; if something goes wrong that affects you, we'll tell you as the law requires.",
      ],
    },
    {
      heading: "Children",
      paragraphs: ["Appmaker isn't meant for children under 13, and we don't knowingly collect their information."],
    },
    {
      heading: "International transfers",
      paragraphs: [
        "Our service providers may process information in other countries. Where the law requires, we use appropriate safeguards, such as standard contractual clauses.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: ["We may update this policy. The date at the top shows the current version, and we'll tell you about significant changes."],
    },
  ];
}

export function accessibilitySections(): LegalSection[] {
  return [
    {
      heading: "Our commitment",
      paragraphs: [
        "{{company}} wants Appmaker to be usable by everyone, including people who use screen readers, keyboards, larger text or reduced motion. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA.",
      ],
    },
    {
      heading: "What we do",
      paragraphs: ["On this website:"],
      bullets: [
        "pages can be used with a keyboard, with a visible focus outline;",
        "buttons and form fields have labels for screen readers, and pages use headings and landmarks;",
        "text and controls meet WCAG AA contrast, and nothing depends on color alone;",
        "text can be enlarged with your browser's zoom or the accessibility menu, and pages adapt to phones;",
        "animations stop when your device asks for reduced motion;",
        "the accessibility menu (the round button in the corner) offers larger text, higher contrast, less motion, underlined links and wider text spacing, and remembers your choice;",
        "we check key pages with automated accessibility tests (axe).",
      ],
      after: [
        "In the apps Appmaker makes: every app follows the phone's light or dark mode, its colors are checked for WCAG AA contrast, its text follows the phone's text-size setting, and it's built with screen-reader labels and roles. After each build Appmaker checks contrast, text size, button size, layout and missing screen-reader labels, and asks the AI to fix what it finds.",
      ],
    },
    {
      heading: "Known limitations",
      paragraphs: ["Some parts are harder to use, and we're working on them:"],
      bullets: [
        "the live app preview is a simulated phone: screen readers can read it, but it doesn't behave exactly like VoiceOver or TalkBack on a real phone (test on your phone with Expo Go for that);",
        "the code editor is a plain text area without code navigation for screen readers;",
        "pages from other services, such as Stripe's checkout, follow their own accessibility standards.",
      ],
    },
    {
      heading: "Apps you publish",
      paragraphs: [
        "You're responsible for the accessibility of the apps you publish. Appmaker helps, but test your app with VoiceOver (iPhone) and TalkBack (Android), and with larger text, before you publish. Appmaker adds an accessibility section with your contact email to each app's support page.",
      ],
    },
    {
      heading: "Feedback and help",
      paragraphs: [
        "If something is hard to use, or you need information in another format, email {{email}}. Tell us the page and what happened. We aim to reply within 5 working days.",
      ],
    },
    {
      heading: "About this statement",
      paragraphs: ["This statement was last reviewed on the date at the top. {{company}}, {{address}}."],
    },
  ];
}
