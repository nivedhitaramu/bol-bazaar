/**
 * Translation safety layer — pure functions, no network (unit-tested in tests/translate.test.ts).
 *
 *  1. mask():    prices, quantities, phone numbers and names → ⟦1⟧, ⟦2⟧ … before MT
 *  2. restore(): tokens → exact original values (numbers as digits, names in the TARGET script)
 *  3. applyGlossary(): consistent craft/commerce terms (saree, zari, order, COD…) after MT
 *  4. missingNumbers() (lib/numbers.ts): back-check that no number was lost
 *
 * Measured against the live Sarvam API (Nov 2026):
 *  - ⟦n⟧ tokens survive translation intact and work well for NAMES ("लखनऊ तक" → "⟦1⟧ வரை").
 *  - For NUMBERS, an opaque token loses meaning: "⟦1⟧ ரூபாய், ⟦2⟧ இருக்கு" came back as
 *    "… ⟦1⟧ रुपये और ⟦2⟧ रुपये" (the quantity became "2 rupees"). Exact DIGITS keep both the value and
 *    the meaning ("8,500 रुपये है और इसमें 2 हैं"). So the default numbers strategy is "digits": spoken
 *    number words are rewritten to exact digits before MT; tokens are the retry strategy.
 *  - Tokenising a common noun ("असली ⟦1⟧ है") breaks grammar → glossary terms are enforced AFTER MT.
 */
import { findNumberSpans, formatIndian } from "../numbers";

export type Lang = string; // "ta-IN" | "hi-IN" | …
const short = (l: Lang) => l.split("-")[0];

// ───────────────────────── Names (people & places) ─────────────────────────

/** Known proper nouns with their native-script forms, so a name is restored in the reader's script. */
export const NAMES: Array<Record<string, string>> = [
  { en: "Meena", ta: "மீனா", hi: "मीना" },
  { en: "Priya", ta: "பிரியா", hi: "प्रिया" },
  { en: "Ramesh", ta: "ரமேஷ்", hi: "रमेश" },
  { en: "Arjun", ta: "அர்ஜுன்", hi: "अर्जुन" },
  { en: "Kanchipuram", ta: "காஞ்சிபுரம்", hi: "कांचीपुरम" },
  { en: "Kancheepuram", ta: "காஞ்சீபுரம்", hi: "कांचीपुरम" },
  { en: "Lucknow", ta: "லக்னோ", hi: "लखनऊ" },
  { en: "Khurja", ta: "குர்ஜா", hi: "खुर्जा" },
  { en: "Chennai", ta: "சென்னை", hi: "चेन्नई" },
  { en: "Delhi", ta: "டெல்லி", hi: "दिल्ली" },
  { en: "Mumbai", ta: "மும்பை", hi: "मुंबई" },
  { en: "Tamil Nadu", ta: "தமிழ்நாடு", hi: "तमिलनाडु" },
  { en: "Uttar Pradesh", ta: "உத்தரப் பிரதேசம்", hi: "उत्तर प्रदेश" },
];

// ───────────────────────── Glossary (craft & commerce terms) ─────────────────────────

type GlossaryTerm = {
  /** Canonical form per language. */
  canon: Record<string, string>;
  /** Forms that identify the term in the SOURCE (any language / romanised). */
  detect: string[];
  /** Wrong or inconsistent renderings to replace in the OUTPUT, per target language. */
  fix: Record<string, string[]>;
};

export const GLOSSARY: GlossaryTerm[] = [
  {
    canon: { en: "saree", hi: "साड़ी", ta: "புடவை" },
    detect: ["saree", "sari", "साड़ी", "साडी", "புடவை", "சேலை"],
    fix: { hi: ["saree", "sari"], ta: ["saree", "sari"], en: ["sari"] },
  },
  {
    canon: { en: "zari", hi: "ज़री", ta: "ஜரிகை" },
    detect: ["zari", "jari", "ज़री", "जरी", "ஜரிகை", "ஜரி"],
    fix: { hi: ["zari", "jari", "जरी"], ta: ["zari", "jari", "ஜரீனா", "ஜரீ"], en: ["jari"] },
  },
  {
    canon: { en: "handloom", hi: "हथकरघा", ta: "கைத்தறி" },
    detect: ["handloom", "हथकरघा", "हैंडलूम", "கைத்தறி"],
    fix: { hi: ["handloom", "हैंडलूम"], ta: ["handloom", "ஹேண்ட்லூம்"] },
  },
  {
    canon: { en: "terracotta", hi: "टेराकोटा", ta: "டெரகோட்டா" },
    detect: ["terracotta", "टेराकोटा", "டெரகோட்டா", "சுடுமண்"],
    fix: { hi: ["terracotta"], ta: ["terracotta"] },
  },
  {
    canon: { en: "pickle", hi: "अचार", ta: "ஊறுகாய்" },
    detect: ["pickle", "achaar", "achar", "अचार", "ஊறுகாய்"],
    fix: { hi: ["pickle", "achaar", "achar"], ta: ["pickle"], en: ["achaar", "achar"] },
  },
  {
    canon: { en: "order", hi: "ऑर्डर", ta: "ஆர்டர்" },
    detect: ["order", "ऑर्डर", "आर्डर", "ஆர்டர்"],
    fix: { hi: ["आदेश", "order", "आर्डर"], ta: ["order"] },
  },
  {
    canon: { en: "delivery", hi: "डिलीवरी", ta: "டெலிவரி" },
    detect: ["delivery", "deliver", "डिलीवरी", "டெலிவரி"],
    fix: { hi: ["delivery", "वितरण", "सुपुर्दगी"], ta: ["delivery", "விநியோகம்"] },
  },
  {
    canon: { en: "cash on delivery (COD)", hi: "कैश ऑन डिलीवरी (COD)", ta: "கேஷ் ஆன் டெலிவரி (COD)" },
    detect: ["COD", "cash on delivery", "कैश ऑन डिलीवरी", "கேஷ் ஆன் டெலிவரி"],
    fix: { hi: ["सीओडी", "COD"], ta: ["சிஓடி", "COD"] },
  },
  {
    canon: { en: "silk", hi: "रेशम", ta: "பட்டு" },
    detect: ["silk", "रेशम", "रेशमी", "பட்டு"],
    fix: { hi: ["silk"], ta: ["silk"] },
  },
];

// ───────────────────────── Helpers ─────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Unicode-aware "whole word" match (Indic scripts have combining marks that \b ignores). */
function wordRe(term: string, flags = "giu") {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{M}\\p{N}])`, flags);
}

export function scriptOf(text: string): "Latn" | "Taml" | "Deva" | "Beng" | "Gujr" | "Knda" | "Mlym" | "Telu" | "Guru" | "Orya" | null {
  const counts: Record<string, number> = {};
  const ranges: Array<[string, number, number]> = [
    ["Deva", 0x0900, 0x097f], ["Beng", 0x0980, 0x09ff], ["Guru", 0x0a00, 0x0a7f], ["Gujr", 0x0a80, 0x0aff],
    ["Orya", 0x0b00, 0x0b7f], ["Taml", 0x0b80, 0x0bff], ["Telu", 0x0c00, 0x0c7f], ["Knda", 0x0c80, 0x0cff],
    ["Mlym", 0x0d00, 0x0d7f], ["Latn", 0x0041, 0x007a],
  ];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x5b && cp <= 0x60) continue; // [\]^_` inside the Latin range
    const hit = ranges.find(([, a, b]) => cp >= a && cp <= b);
    if (hit) counts[hit[0]] = (counts[hit[0]] ?? 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (best?.[0] as ReturnType<typeof scriptOf>) ?? null;
}

const SCRIPT_LANG: Record<string, Lang> = {
  Taml: "ta-IN", Beng: "bn-IN", Gujr: "gu-IN", Knda: "kn-IN", Mlym: "ml-IN", Telu: "te-IN", Guru: "pa-IN", Orya: "od-IN",
};

/** Local, offline language guess from the script. Devanagari = Hindi unless the hint says Marathi. */
export function guessLanguageFromScript(text: string, hint?: Lang): { lang: Lang | null; script: ReturnType<typeof scriptOf> } {
  const script = scriptOf(text);
  if (!script) return { lang: hint ?? null, script };
  if (script === "Deva") return { lang: hint === "mr-IN" ? "mr-IN" : "hi-IN", script };
  if (script === "Latn") return { lang: null, script }; // romanised Indic vs English needs /text-lid or a hint
  return { lang: SCRIPT_LANG[script] ?? hint ?? null, script };
}

// ───────────────────────── Mask / restore ─────────────────────────

export type Slot =
  | { token: string; kind: "number"; original: string; value: number; numberKind: "digits" | "words" | "phone" }
  | { token: string; kind: "name"; original: string; forms: Record<string, string> | null };

export type Masked = { text: string; slots: Slot[] };
type SlotData = Slot extends infer S ? (S extends Slot ? Omit<S, "token"> : never) : never;

const TOKEN = (n: number) => `⟦${n}⟧`;
/** Tolerates models that add spaces or swap brackets: ⟦ 1 ⟧, [1], 【1】. */
const TOKEN_RE = /[⟦\[【]\s*(\d{1,3})\s*[⟧\]】]/g;

/**
 * Replace numbers and names with ⟦n⟧ tokens.
 * `extraNames` = the seller's/buyer's own names and product names for this conversation (kept verbatim).
 */
export function mask(
  text: string,
  extraNames: string[] = [],
  opts: { numbers?: "digits" | "tokens"; knownNames?: "token" | "verify" } = {}
): Masked {
  const numbersMode = opts.numbers ?? "tokens";
  // "verify": well-known names (NAMES table) are left for the model to inflect naturally
  // (Tamil glues case endings: காஞ்சிபுரத்தில்) and checked afterwards with missingNames().
  const knownMode = opts.knownNames ?? "token";
  const slots: Slot[] = [];
  type Hit = { start: number; end: number; slot: SlotData };
  const hits: Hit[] = [];
  const overlaps = (a: number, b: number) => hits.some((h) => a < h.end && b > h.start);

  // Numbers first (prices, quantities, phones — digits or words).
  // "digits" mode: number WORDS become exact digits inline (no token); digits/phones pass through as-is.
  const inline: Array<{ start: number; end: number; text: string }> = [];
  for (const s of findNumberSpans(text)) {
    if (numbersMode === "tokens") {
      hits.push({ start: s.start, end: s.end, slot: { kind: "number", original: s.text, value: s.value, numberKind: s.kind } });
    } else if (s.kind === "words") {
      inline.push({ start: s.start, end: s.end, text: formatIndian(s.value) });
    }
  }
  const overlapsInline = (a: number, b: number) => inline.some((h) => a < h.end && b > h.start);

  // Names: only as standalone words — Tamil glues case suffixes onto names ("லக்னோவுக்கு"), and
  // tokenising half a word would break it. Those inflected forms are left to the model.
  const candidates: Array<{ form: string; forms: Record<string, string> | null }> = [];
  const known = new Set(NAMES.flatMap((n) => Object.values(n).map((f) => f.toLowerCase())));
  if (knownMode === "token") for (const n of NAMES) for (const f of Object.values(n)) candidates.push({ form: f, forms: n });
  for (const x of extraNames) {
    const v = x?.trim();
    if (!v || v.length < 2) continue;
    if (knownMode === "verify" && known.has(v.toLowerCase())) continue;
    candidates.push({ form: v, forms: null });
  }
  candidates.sort((a, b) => b.form.length - a.form.length); // longest first ("Tamil Nadu" before "Tamil")

  for (const c of candidates) {
    for (const m of text.matchAll(wordRe(c.form))) {
      const start = m.index!;
      const end = start + m[0].length;
      if (overlaps(start, end) || overlapsInline(start, end)) continue;
      hits.push({ start, end, slot: { kind: "name", original: m[0], forms: c.forms } });
    }
  }

  type Edit = { start: number; end: number; replace: string; slot?: SlotData };
  const edits: Edit[] = [
    ...hits.map((h) => ({ start: h.start, end: h.end, replace: "", slot: h.slot })),
    ...inline.map((h) => ({ start: h.start, end: h.end, replace: h.text })),
  ].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  let n = 0;
  for (const e of edits) {
    if (e.slot) {
      const token = TOKEN(++n);
      out += text.slice(pos, e.start) + token;
      slots.push({ ...e.slot, token } as Slot);
    } else out += text.slice(pos, e.start) + e.replace;
    pos = e.end;
  }
  out += text.slice(pos);
  return { text: out, slots };
}

/** What a slot becomes in the target language. Numbers → digits (Indian grouping); names → target script. */
export function slotValue(slot: Slot, target: Lang): string {
  if (slot.kind === "number") {
    if (slot.numberKind === "phone" || slot.numberKind === "digits") return slot.original;
    return formatIndian(slot.value); // spoken number words → exact digits
  }
  return slot.forms?.[short(target)] ?? slot.forms?.en ?? slot.original;
}

/** Put the protected values back. Returns the slots whose tokens the model dropped. */
export function restore(translated: string, slots: Slot[], target: Lang): { text: string; lost: Slot[] } {
  const byNum = new Map(slots.map((s) => [Number(s.token.slice(1, -1)), s]));
  const seen = new Set<number>();
  const text = translated.replace(TOKEN_RE, (whole, n: string) => {
    const slot = byNum.get(Number(n));
    if (!slot) return whole;
    seen.add(Number(n));
    return slotValue(slot, target);
  });
  return { text, lost: slots.filter((s) => !seen.has(Number(s.token.slice(1, -1)))) };
}

/**
 * Name back-check for "verify" mode: every well-known name in the source must appear in the output
 * in the target script (a stem match allows Tamil case endings: காஞ்சிபுரம் → காஞ்சிபுரத்தில்).
 */
export function missingNames(source: string, translated: string, target: Lang): string[] {
  const t = short(target);
  const missing: string[] = [];
  for (const n of NAMES) {
    const forms = Object.values(n);
    const inSource = forms.some((f) => wordRe(f).test(source) || (scriptOf(f) !== "Latn" && source.includes(f)));
    if (!inSource) continue;
    const accept = [n[t], n.en].filter(Boolean).map((f) => {
      const chars = [...f];
      return chars.slice(0, Math.max(3, chars.length - 2)).join("").toLowerCase();
    });
    const out = translated.toLowerCase();
    if (!accept.some((stem) => out.includes(stem))) missing.push(n.en);
  }
  return missing;
}

// ───────────────────────── Glossary post-pass ─────────────────────────

/** Terms whose detect-forms occur in the source. */
export function glossaryTermsIn(source: string): GlossaryTerm[] {
  return GLOSSARY.filter((g) => g.detect.some((f) => wordRe(f).test(source) || (scriptOf(f) !== "Latn" && source.includes(f))));
}

/**
 * Make craft/commerce terms consistent in the output: for each glossary term present in the source,
 * replace known wrong/leaked renderings in the translation with the canonical target form.
 * Suffixes glued on with a hyphen are kept ("saree-ஓட" → "புடவை-ஓட").
 */
export function applyGlossary(source: string, translated: string, target: Lang): string {
  const t = short(target);
  let out = translated;
  for (const g of glossaryTermsIn(source)) {
    const canon = g.canon[t];
    if (!canon || out.includes(canon)) continue; // already consistent (also avoids "COD" → "…(COD)" recursion)
    for (const bad of g.fix[t] ?? []) {
      if (bad === canon) continue;
      out = out.replace(wordRe(bad), canon);
    }
  }
  return out;
}
