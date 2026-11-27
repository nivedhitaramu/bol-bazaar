/**
 * "When things go wrong" — pure helpers shared by server and client (unit-tested, no network).
 *
 *  classifyYesNo()   spoken yes/no in English, Hindi, Tamil, romanised ("aamaa", "haan", "illa")
 *  isUndo()          "No, wrong" / "illa, thappu" / "nahi, galat" → undo the last change
 *  valuesToConfirm() prices / quantities / phone numbers that must be read back before saving
 *  findConfusable()  a word that is easily misheard ("zari" ↔ "saree") → ask about ONLY that word
 *  simulatedConfusion() the /demo "simulate noise" path (deterministic, credible)
 *  prompts           spoken prompts in the speaker's language
 */
import { findNumberSpans, formatIndian, normalizeDigits } from "./numbers";

const norm = (s: string) =>
  normalizeDigits(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

// ───────────────────────── yes / no / undo ─────────────────────────

const YES = new Set([
  "yes", "yeah", "yep", "yup", "ya", "correct", "right", "ok", "okay", "sure", "confirm", "confirmed", "done",
  "haan", "han", "haa", "ha", "haanji", "ji", "sahi", "theek", "thik", "bilkul",
  "हाँ", "हां", "हा", "जी", "सही", "ठीक", "बिल्कुल",
  "aamaa", "aama", "ama", "aamam", "amam", "seri", "sari", "sariyaa", "correcta",
  "ஆமாம்", "ஆமா", "ஆம்", "சரி", "சரியா", "சரிதான்",
]);
const NO = new Set([
  "no", "nope", "nah", "wrong", "incorrect", "cancel", "stop", "undo",
  "nahi", "nahin", "na", "galat", "mat",
  "नहीं", "नही", "ना", "गलत", "ग़लत",
  "illa", "illai", "ille", "venam", "vendaam", "vendam", "thappu", "tappu",
  "இல்லை", "இல்ல", "வேண்டாம்", "தப்பு", "தவறு",
]);
/** Words that mean "that was wrong" (undo), not just "no". */
const WRONG = new Set(["wrong", "undo", "incorrect", "galat", "गलत", "ग़लत", "thappu", "tappu", "தப்பு", "தவறு"]);
const UNDO_PHRASES = [/\bundo\b/, /\bthat'?s wrong\b/, /\bgo back\b/, /पहले जैसा/, /वापस करो/, /முன்பு போல/, /மாத்து வேண்டாம்/];

export function classifyYesNo(text: string): "yes" | "no" | null {
  const w = words(text);
  if (!w.length || w.length > 8) return null; // a long sentence is not an answer
  const yes = w.some((x) => YES.has(x));
  const no = w.some((x) => NO.has(x));
  if (yes && !no) return "yes";
  if (no && !yes) return "no";
  // "no, it's right" / "haan, nahi" — ambiguous: ask again
  return null;
}

/** "No, wrong" · "illa, thappu" · "nahi, galat" · "undo" → undo the last change. */
export function isUndo(text: string): boolean {
  const n = norm(text);
  const w = n.split(" ");
  if (!w.length || w.length > 6) return false;
  return w.some((x) => WRONG.has(x)) || UNDO_PHRASES.some((re) => re.test(n));
}

// ───────────────────────── numbers to confirm ─────────────────────────

const CURRENCY_NEAR = /(₹|rs\.?|rupee|rupees|रुपये|रुपए|रुपया|ரூபாய்|ரூ)/iu;

export type ConfirmValue = { kind: "price" | "number" | "phone"; value: number; text: string };

/** Every price / quantity / phone number in an utterance — these are read back before saving. */
export function valuesToConfirm(text: string): ConfirmValue[] {
  const t = normalizeDigits(text);
  return findNumberSpans(t).map((s) => {
    const around = t.slice(Math.max(0, s.start - 3), s.end + 12);
    const kind: ConfirmValue["kind"] = s.kind === "phone" ? "phone" : CURRENCY_NEAR.test(around) || s.value >= 100 ? "price" : "number";
    return { kind, value: s.value, text: s.text };
  });
}

export function formatValue(v: ConfirmValue): string {
  if (v.kind === "price") return `₹${formatIndian(v.value)}`;
  if (v.kind === "phone") return v.text.replace(/\s+/g, " ");
  return String(v.value);
}

// ───────────────────────── misheard words ─────────────────────────

/**
 * Sound-alike pairs that matter for selling (STT gives no per-word confidence, so we ask about
 * the words where a mistake would change the meaning). Each group: interchangeable spellings.
 */
const CONFUSABLE: Array<[string[], string[]]> = [
  [["zari", "jari", "ज़री", "जरी", "ஜரி"], ["saree", "sari", "साड़ी", "सारी", "சாரி"]],
  [["silk", "सिल्क"], ["milk", "मिल्क"]],
  [["cotton", "कॉटन", "காட்டன்"], ["carton", "कार्टन"]],
  [["pattu", "பட்டு"], ["paattu", "பாட்டு"]],
  [["kaadi", "khadi", "खादी", "காதி"], ["kaari", "कारी"]],
];

export type Clarify = { word: string; options: [string, string] };

/** If the utterance contains a word that is easily misheard, ask about only that word. */
export function findConfusable(text: string): Clarify | null {
  const tokens = text.split(/\s+/).map((x) => x.replace(/^[\p{P}]+|[\p{P}]+$/gu, ""));
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    for (const [a, b] of CONFUSABLE) {
      const inA = a.find((f) => f.toLowerCase() === lower);
      const inB = b.find((f) => f.toLowerCase() === lower);
      if (!inA && !inB) continue;
      // offer the partner in the same script as what was heard
      const partners = inA ? b : a;
      const sameScript = partners.find((p) => /\p{Script=Latin}/u.test(p) === /\p{Script=Latin}/u.test(tok)) ?? partners[0];
      return { word: tok, options: inA ? [tok, sameScript] : [sameScript, tok] };
    }
  }
  return null;
}

/**
 * /demo "simulate noise": force the low-confidence path on the next message, credibly:
 *  1) a sound-alike word if there is one, else 2) a number with two digits swapped
 *  (8500 ↔ 5800 — a classic mishearing), else 3) the longest word vs. a near-miss.
 */
export function simulatedConfusion(text: string): Clarify {
  const c = findConfusable(text);
  if (c) return c;
  const nums = findNumberSpans(normalizeDigits(text)).filter((s) => s.kind !== "phone" && s.value >= 10);
  if (nums.length) {
    const v = String(nums[0].value);
    const swapped = v.length >= 2 ? v[1] + v[0] + v.slice(2) : v + "0";
    const alt = swapped === v ? String(nums[0].value + 1) : swapped;
    return { word: nums[0].text, options: [formatIndian(nums[0].value), formatIndian(Number(alt))] };
  }
  const longest = text.split(/\s+/).map((x) => x.replace(/^[\p{P}]+|[\p{P}]+$/gu, "")).sort((a, b) => [...b].length - [...a].length)[0] ?? text;
  const chars = [...longest];
  const alt = chars.length > 3 ? [...chars.slice(0, -2), chars[chars.length - 1], chars[chars.length - 2]].join("") : longest + longest.slice(-1);
  return { word: longest, options: [longest, alt] };
}

/** Which option did the speaker pick? Accepts the word itself, "first/second", or yes (= first). */
export function matchOption(answer: string, options: [string, string]): 0 | 1 | null {
  const a = norm(answer);
  if (!a) return null;
  const hit = options.map((o) => {
    const n = norm(o);
    return n && (a === n || a.includes(n) || (n.length > 3 && n.includes(a)));
  });
  if (hit[0] && !hit[1]) return 0;
  if (hit[1] && !hit[0]) return 1;
  if (/\b(first|one|pehla|pahla|मुदल|முதல்|முதலாவது|पहला|पहले)\b/u.test(a)) return 0;
  if (/\b(second|two|doosra|dusra|दूसरा|இரண்டாவது|ரெண்டாவது)\b/u.test(a)) return 1;
  return null;
}

/** Replace the misheard word with the chosen one (first occurrence, whole token). */
export function applyChoice(text: string, word: string, chosen: string): string {
  if (word === chosen) return text;
  const i = text.indexOf(word);
  return i < 0 ? text : text.slice(0, i) + chosen + text.slice(i + word.length);
}

// ───────────────────────── spoken prompts ─────────────────────────

type L = "en" | "hi" | "ta";
const lk = (lang: string): L => (lang.startsWith("hi") ? "hi" : lang.startsWith("ta") ? "ta" : "en");

export function confirmPrompt(values: ConfirmValue[], lang: string): string {
  const shown = values.slice(0, 3).map(formatValue);
  const list = shown.join(lk(lang) === "hi" ? " और " : lk(lang) === "ta" ? ", " : " and ");
  switch (lk(lang)) {
    case "hi":
      return `मैंने ${list} सुना। क्या यह सही है? हाँ या नहीं बोलिए।`;
    case "ta":
      return `நான் ${list} என்று கேட்டேன். சரியா? ஆமாம் அல்லது இல்லை என்று சொல்லுங்கள்.`;
    default:
      return `I heard ${list}. Is that right? Say yes or no.`;
  }
}

export function clarifyPrompt(c: Clarify, lang: string): string {
  const [a, b] = c.options;
  switch (lk(lang)) {
    case "hi":
      return `“${a}” या “${b}”?`;
    case "ta":
      return `“${a}”-ஆ, “${b}”-ஆ?`;
    default:
      return `Did you say “${a}” or “${b}”?`;
  }
}

export const RECOVERY_TEXT: Record<L, Record<"sayAgain" | "undone" | "notSure" | "couldntHear" | "typeOffer" | "cancelled", string>> = {
  en: {
    sayAgain: "Okay. Please say it again.",
    undone: "Done, I've undone that.",
    notSure: "Sorry, I didn't catch that. Please say yes or no.",
    couldntHear: "I couldn't hear clearly. Please come a little closer, or move somewhere quieter.",
    typeOffer: "Having trouble hearing you. You can type below, and I'll still speak the replies.",
    cancelled: "Okay, cancelled. Nothing was changed.",
  },
  hi: {
    sayAgain: "ठीक है। कृपया फिर से बोलिए।",
    undone: "ठीक है, पिछला बदलाव हटा दिया।",
    notSure: "माफ़ कीजिए, समझ नहीं आया। हाँ या नहीं बोलिए।",
    couldntHear: "साफ़ सुनाई नहीं दिया। कृपया थोड़ा पास आइए, या शांत जगह पर जाइए।",
    typeOffer: "सुनने में दिक्कत हो रही है। आप नीचे लिख सकते हैं, जवाब फिर भी बोलकर सुनाए जाएँगे।",
    cancelled: "ठीक है, रद्द कर दिया। कुछ नहीं बदला।",
  },
  ta: {
    sayAgain: "சரி. தயவுசெய்து மீண்டும் சொல்லுங்கள்.",
    undone: "சரி, கடைசி மாற்றத்தை நீக்கிவிட்டேன்.",
    notSure: "மன்னிக்கவும், புரியவில்லை. ஆமாம் அல்லது இல்லை என்று சொல்லுங்கள்.",
    couldntHear: "தெளிவாகக் கேட்கவில்லை. தயவுசெய்து கொஞ்சம் அருகில் வாருங்கள், அல்லது அமைதியான இடத்திற்குச் செல்லுங்கள்.",
    typeOffer: "கேட்பதில் சிரமம் உள்ளது. கீழே தட்டச்சு செய்யலாம்; பதில்கள் தொடர்ந்து பேசப்படும்.",
    cancelled: "சரி, ரத்து செய்தேன். எதுவும் மாறவில்லை.",
  },
};

export function recoveryText(key: keyof (typeof RECOVERY_TEXT)["en"], lang: string): string {
  return RECOVERY_TEXT[lk(lang)][key];
}

/** "Mark Priya's saree order as Confirmed? Say yes or no." — in the seller's language. */
export function orderConfirmPrompt(buyer: string, product: string, statusLabel: string, lang: string): string {
  switch (lk(lang)) {
    case "hi":
      return `${buyer} का “${product}” ऑर्डर “${statusLabel}” कर दें? हाँ या नहीं बोलिए।`;
    case "ta":
      return `${buyer} அவர்களின் “${product}” ஆர்டரை “${statusLabel}” என்று மாற்றலாமா? ஆமாம் அல்லது இல்லை என்று சொல்லுங்கள்.`;
    default:
      return `Mark ${buyer}'s “${product}” order as “${statusLabel}”? Say yes or no.`;
  }
}
