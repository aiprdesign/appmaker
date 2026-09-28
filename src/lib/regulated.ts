import { userFacingText, type ClaimHit } from "./claims";
import type { FileMap, StoreListing } from "./types";

/**
 * Regulated claims: always checked, whatever the wording setting. Health and
 * medical claims (disease, treatment, diagnosis, "clinically proven", "FDA
 * approved") are regulated by the FDA and FTC and get apps rejected under App
 * Store guideline 1.4.1; financial promises ("guaranteed returns") are
 * regulated by the FTC and SEC. Health apps must also say they aren't
 * medical advice.
 */

export const REGULATED_RULES = `## Health, medical and financial claims (always on)
Never claim or imply that the app diagnoses, treats, cures, mitigates or prevents any disease or condition, or that it replaces a doctor, medication or professional advice. Do NOT write: "cures", "treats insomnia", "heals", "prevents diabetes", "reverses", "diagnoses", "detects heart disease", "clinically proven", "scientifically proven", "doctor recommended", "FDA approved"/"FDA cleared", "medical grade", "burn fat", "lose 10 lbs", "detox", "boosts immunity", "relieves anxiety/pain/depression", "replaces your medication". Describe tracking and logging instead: "Log your blood pressure readings", "Track how you slept", "Notes to share with your doctor".
If the app deals with health, symptoms, medication, vital signs, diet, weight, mental health or fitness metrics, show this line on its main screen or settings/about screen and in the store description: "This app is not a medical device and does not provide medical advice. Talk to a healthcare professional about your health."
No financial promises: never write "guaranteed returns", "risk-free", "get rich", "can't lose", "double your money" or promise profits. Describe features ("Track your spending by category").`;

interface Rule {
  kind: string;
  pattern: RegExp;
}

const CONDITIONS =
  "(?:diseases?|illness(?:es)?|conditions?|disorders?|infections?|viruse?s?|covid(?:-19)?|flu|colds?|cancers?|tumou?rs?|diabetes|hypertension|high blood pressure|heart disease|strokes?|obesity|arthritis|asthma|allergies|migraines?|headaches?|pain|insomnia|sleep apnea|depression|anxiety|adhd|autism|dementia|alzheimer'?s|parkinson'?s|ptsd|ocd|acne|eczema|psoriasis|addiction|inflammation)";

const RULES: Rule[] = [
  { kind: "disease claim", pattern: new RegExp(`\\b(?:cures?|cured|curing|treats?|treating|treatment for|heals?|healing|prevents?|preventing|prevention of|reverses?|reversing|mitigates?|eliminates?|fights?|beats?|relieves?|relief (?:from|for))\\b(?:\\s+\\w+){0,3}?\\s+${CONDITIONS}\\b`, "gi") },
  { kind: "cure claim", pattern: /\b(?:cures?|cured|miracle cure)\b/gi },
  { kind: "diagnosis claim", pattern: /\b(?:diagnos(?:e|es|ed|is|ing|tic)|detects?\s+(?:\w+\s+){0,2}(?:disease|cancer|diabetes|condition|infection|arrhythmia|afib))\b/gi },
  { kind: "medical endorsement", pattern: /\b(?:clinically|scientifically|medically)\s+(?:proven|tested|validated|shown)\b|\b(?:doctor|physician|dermatologist|dentist)[-\s]?(?:recommended|approved|endorsed)\b|\bFDA[-\s]?(?:approved|cleared|registered|certified)\b|\bmedical[-\s]grade\b/gi },
  { kind: "weight-loss or wellness claim", pattern: /\b(?:burns?\s+(?:belly\s+)?fat|fat[-\s]burning|lose\s+\d+\s*(?:lbs?|pounds|kg|kilos)|melts?\s+(?:away\s+)?(?:fat|pounds)|detox(?:es|ify|ifies)?|boosts?\s+(?:your\s+)?(?:immune(?:\s+system)?|immunity)|anti[-\s]aging)\b/gi },
  { kind: "replaces medical care", pattern: /\b(?:replaces?|instead of|no need for|stop taking)\s+(?:your\s+)?(?:doctor|physician|therapist|therapy|medications?|medicines?|prescriptions?|drugs?)\b/gi },
  { kind: "financial promise", pattern: /\b(?:guaranteed\s+(?:returns?|profits?|income|gains?)|risk[-\s]free\s+(?:investment|returns?|profits?|trading)|get\s+rich|can'?t\s+lose|double\s+your\s+money|passive\s+income\s+guaranteed)\b/gi },
];

// Clearly medical topics only: everyday fitness, mood or sleep logs aren't
// flagged, and neither are app names like "Pulse".
const HEALTH_TOPIC =
  /\b(?:symptoms?|medications?|medicines?|pills?|dosage|doses|prescriptions?|blood\s+(?:pressure|sugar|glucose)|glucose|insulin|heart\s+rate|spo2|oxygen\s+(?:level|saturation)|bmi|mental\s+health|therapy|diagnos\w*|fertility|ovulation|pregnan\w*|period\s+(?:tracker|tracking)|menstrua\w*|pain\s+(?:level|log|tracker)|chronic|allerg(?:y|ies)|asthma|migraines?)\b/i;
const DISCLAIMER = /\b(?:not\s+(?:a\s+)?medical\s+(?:device|advice)|not\s+(?:intended|meant)\s+to\s+(?:diagnose|replace)|consult\s+(?:a|your)\s+(?:doctor|healthcare|physician)|talk\s+to\s+(?:a|your)\s+(?:doctor|healthcare)|for\s+informational\s+purposes)\b/i;

export const HEALTH_DISCLAIMER = "This app is not a medical device and does not provide medical advice. Talk to a healthcare professional about your health.";

function find(text: string): { phrase: string; kind: string; index: number }[] {
  const hits: { phrase: string; kind: string; index: number }[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const index = m.index ?? 0;
      const overlaps = hits.some((h) => index < h.index + h.phrase.length && h.index < index + m[0].length);
      if (!overlaps) hits.push({ phrase: m[0].trim(), kind: rule.kind, index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

export function checkRegulatedClaims(files: FileMap, listing?: Partial<StoreListing>): ClaimHit[] {
  const hits: ClaimHit[] = [];
  const texts: { where: string; text: string }[] = [];
  for (const [path, code] of Object.entries(files)) {
    if (/\.(jsx?|json)$/.test(path)) for (const text of userFacingText(code)) texts.push({ where: path, text });
  }
  for (const field of ["name", "subtitle", "description", "keywords"] as const) {
    const value = listing?.[field];
    if (typeof value === "string" && value) texts.push({ where: `Store listing: ${field}`, text: value });
  }
  for (const { where, text } of texts) {
    for (const h of find(text)) {
      if (hits.some((x) => x.where === where && x.phrase.toLowerCase() === h.phrase.toLowerCase())) continue;
      const start = Math.max(0, h.index - 30);
      hits.push({ where, phrase: h.phrase, kind: h.kind, context: text.slice(start, h.index + h.phrase.length + 30).trim() });
    }
  }
  // Health apps must say they aren't medical advice, in the app and the listing.
  const appText = texts.filter((t) => !t.where.startsWith("Store listing")).map((t) => t.text).join("\n");
  const listingText = [listing?.name, listing?.subtitle, listing?.description, listing?.keywords].filter(Boolean).join("\n");
  const topic = HEALTH_TOPIC.exec(`${appText}\n${listingText}`)?.[0];
  if (topic && Object.keys(files).length) {
    if (!DISCLAIMER.test(appText)) {
      hits.push({ where: "App", phrase: "missing health disclaimer", kind: "health disclaimer", context: `The app is about ${topic.toLowerCase()} but doesn't say it isn't medical advice. Add: "${HEALTH_DISCLAIMER}"` });
    }
    if (listing?.description && !DISCLAIMER.test(listing.description)) {
      hits.push({ where: "Store listing: description", phrase: "missing health disclaimer", kind: "health disclaimer", context: `Add to the description: "${HEALTH_DISCLAIMER}"` });
    }
  }
  return hits;
}

export function describeRegulated(hits: ClaimHit[]): string {
  return hits
    .map((h) => (h.kind === "health disclaimer" ? `- ${h.where}: ${h.context}` : `- ${h.where}: "${h.phrase}" (${h.kind}) in “${h.context}”`))
    .join("\n");
}
