/**
 * Deterministic number handling. Used to
 *  1) guarantee spoken prices that STT already wrote as digits are preserved EXACTLY, and
 *  2) provide a working fallback when the LLM is unavailable.
 */

const UNITS: Record<string, number> = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  // Hindi (Devanagari + common romanised)
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8,
  "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30,
  "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90,
  "तेरह": 13, "चौदह": 14, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "छे": 6,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  bees: 20, pachas: 50, pachaas: 50,
  // Tamil — units, tens, spoken variants
  "ஒன்று": 1, "ஒரு": 1, "ஓர்": 1, "இரண்டு": 2, "ரெண்டு": 2, "மூன்று": 3, "மூணு": 3, "நான்கு": 4, "நாலு": 4,
  "ஐந்து": 5, "அஞ்சு": 5, "ஆறு": 6, "ஏழு": 7, "எட்டு": 8, "ஒன்பது": 9, "பத்து": 10, "பதினொன்று": 11,
  "பன்னிரண்டு": 12, "பதினைந்து": 15, "இருபது": 20, "இருபத்தி": 20, "இருபத்தைந்து": 25, "முப்பது": 30,
  "நாற்பது": 40, "ஐம்பது": 50, "அம்பது": 50, "அறுபது": 60, "எழுபது": 70, "எண்பது": 80, "தொண்ணூறு": 90,
  // Tamil — hundreds blocks (added as-is)
  "இருநூறு": 200, "இருநூற்று": 200, "முந்நூறு": 300, "முன்னூறு": 300, "முந்நூற்று": 300, "நானூறு": 400,
  "நானூற்று": 400, "ஐநூறு": 500, "ஐநூற்று": 500, "அஞ்சுநூறு": 500, "அறுநூறு": 600, "அறுநூற்று": 600,
  "எழுநூறு": 700, "எழுநூற்று": 700, "எண்ணூறு": 800, "எண்ணூற்று": 800, "தொள்ளாயிரம்": 900, "தொள்ளாயிரத்து": 900,
  "நூற்று": 100,
  // Tamil — thousands blocks ("எட்டாயிரத்து ஐநூறு" = 8000 + 500)
  "ஓராயிரம்": 1000, "ஆயிரத்தி": 1000, "இரண்டாயிரம்": 2000, "இரண்டாயிரத்து": 2000, "ரெண்டாயிரம்": 2000,
  "மூவாயிரம்": 3000, "மூவாயிரத்து": 3000, "மூணாயிரம்": 3000, "நான்காயிரம்": 4000, "நான்காயிரத்து": 4000,
  "நாலாயிரம்": 4000, "நாலாயிரத்து": 4000, "ஐயாயிரம்": 5000, "ஐயாயிரத்து": 5000, "ஐந்தாயிரம்": 5000,
  "அஞ்சாயிரம்": 5000, "ஆறாயிரம்": 6000, "ஆறாயிரத்து": 6000, "ஏழாயிரம்": 7000, "ஏழாயிரத்து": 7000,
  "எட்டாயிரம்": 8000, "எட்டாயிரத்து": 8000, "ஒன்பதாயிரம்": 9000, "ஒன்பதாயிரத்து": 9000,
  "பத்தாயிரம்": 10000, "பத்தாயிரத்து": 10000, "இருபதாயிரம்": 20000, "இருபதாயிரத்து": 20000,
  "ஐம்பதாயிரம்": 50000, "ஐம்பதாயிரத்து": 50000,
};

const MULTS: Record<string, number> = {
  hundred: 100, "सौ": 100, sau: 100, "நூறு": 100,
  thousand: 1000, "हज़ार": 1000, "हजार": 1000, hazaar: 1000, hazar: 1000, "ஆயிரம்": 1000, k: 1000,
  "ஆயிரத்து": 1000,
  lakh: 100000, lakhs: 100000, lac: 100000, "लाख": 100000, "லட்சம்": 100000, "லட்சத்து": 100000, "லட்ச": 100000,
  crore: 10000000, "करोड़": 10000000, "கோடி": 10000000, "கோடியே": 10000000,
};

const FRACTION_PREFIX: Record<string, number> = { "साढ़े": 0.5, sadhe: 0.5, saadhe: 0.5, "डेढ़": 1.5, dedh: 1.5, "ढाई": 2.5, dhai: 2.5 };

function digitsToNumber(s: string): number {
  return Number(s.replace(/[,\s]/g, ""));
}

/** Convert native digits (०-९, ௦-௯, etc.) to ASCII. */
export function normalizeDigits(text: string): string {
  const blocks = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];
  return text.replace(/[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    const base = blocks.find((b) => cp >= b && cp <= b + 9)!;
    return String(cp - base);
  });
}

/**
 * Parse an amount phrase like "8,500", "1.2 lakh", "8.5k", "eight thousand five hundred",
 * "साढ़े आठ हज़ार", "1 lakh 20 thousand". Returns null if not a number.
 */
export function parseAmount(phrase: string): number | null {
  const tokens = normalizeDigits(phrase.toLowerCase())
    .replace(/(\d)\s*k\b/g, "$1 k")
    .replace(/[-–]/g, " ")
    .split(/\s+|(?<=\d)(?=[a-zऀ-෿])/)
    .map((t) => t.replace(/[^\p{L}\p{M}\d.,]/gu, ""))
    .filter(Boolean);
  if (!tokens.length) return null;

  let total = 0;
  let current = 0;
  let fraction = 0;
  let seen = false;
  for (const tok of tokens) {
    if (tok === "and" || tok === "और" || tok === "aur") continue;
    if (FRACTION_PREFIX[tok] !== undefined) {
      fraction = FRACTION_PREFIX[tok];
      seen = true;
      continue;
    }
    if (/^\d[\d,]*(\.\d+)?$/.test(tok)) {
      current += digitsToNumber(tok);
      seen = true;
      continue;
    }
    if (UNITS[tok] !== undefined) {
      current += UNITS[tok];
      seen = true;
      continue;
    }
    if (MULTS[tok] !== undefined) {
      const m = MULTS[tok];
      let base = current || 1;
      if (fraction === 0.5) base += 0.5;
      else if (fraction) base = fraction;
      fraction = 0;
      if (m === 100) current = base * 100;
      else {
        total += base * m;
        current = 0;
      }
      seen = true;
      continue;
    }
    if (seen) break; // stop at first non-number word after a number started
  }
  if (!seen) return null;
  const n = Math.round(total + current);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lac|thousand|हज़ार|हजार|लाख|ஆயிரம்|லட்சம்)?(?:\s+\d[\d,]*(?:\s*(?:thousand|हज़ार|हजार|ஆயிரம்))?)?)`;
const CUR_AFTER = String.raw`(?:rupees?|rs\.?|inr|bucks|रुपये|रुपए|रुपया|रु\.?|ரூபாய்|ரூ\.?|రూపాయలు|ರೂಪಾಯಿ|രൂപ|টাকা|रुपयांना|રૂપિયા)`;
const CUR_BEFORE = String.raw`(?:₹|rs\.?|inr|रु\.?|ரூ\.?)`;

/** Finds amounts explicitly tied to a currency word/symbol. Returns distinct values. */
export function findCurrencyAmounts(text: string): number[] {
  const t = normalizeDigits(text);
  const found = new Set<number>();
  const before = new RegExp(`${CUR_BEFORE}\\s*${NUM}`, "giu");
  const after = new RegExp(`${NUM}\\s*${CUR_AFTER}`, "giu");
  for (const re of [before, after]) {
    for (const m of t.matchAll(re)) {
      const v = parseAmount(m[1]);
      if (v && v > 0) found.add(v);
    }
  }
  return [...found];
}

const PRICE_WORDS = String.raw`(?:price|cost|rate|daam|dam|keemat|kimat|कीमत|क़ीमत|दाम|रेट|விலை|ధర|ಬೆಲೆ|വില|দাম|किंमत|કિંમત)`;
const QTY_WORDS = String.raw`(?:quantity|qty|stock|pieces?|pcs|units?|nos|मात्रा|पीस|नग|स्टॉक|எண்ணிக்கை|பீஸ்|துண்டு|ஸ்டாக்|పీసులు|ಪೀಸ್|എണ്ണം|পিস|नग|નંગ)`;

export function findPriceNear(text: string): number | null {
  const t = normalizeDigits(text);
  const cur = findCurrencyAmounts(t);
  if (cur.length === 1) return cur[0];
  const re = new RegExp(`${PRICE_WORDS}[^\\d]{0,25}${NUM}|${NUM}[^\\d]{0,12}${PRICE_WORDS}`, "iu");
  const m = t.match(re);
  if (m) return parseAmount(m[1] ?? m[2]);
  return cur[0] ?? null;
}

export function findQuantityNear(text: string): number | null {
  const t = normalizeDigits(text);
  const re = new RegExp(`(\\d+)\\s*${QTY_WORDS}|${QTY_WORDS}[^\\d]{0,20}(\\d+)`, "iu");
  const m = t.match(re);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) ? n : null;
}

export function mentionsPrice(text: string): boolean {
  return new RegExp(PRICE_WORDS, "iu").test(text) || findCurrencyAmounts(text).length > 0;
}

export function mentionsQuantity(text: string): boolean {
  return new RegExp(QTY_WORDS, "iu").test(text);
}

// ───────────────────────── Number spans (for translation protection + back-checks) ─────────────────────────

export type NumberSpan = { start: number; end: number; text: string; value: number; kind: "digits" | "words" | "phone" };

/** Romanised Hindi words collide with English ("do", "char", "das") — only digits/English words count in Latin text. */
const ROMANISED_HINDI = new Set(["ek", "do", "teen", "char", "chaar", "paanch", "panch", "chhe", "saat", "aath", "nau", "das", "bees", "pachas", "pachaas", "sau", "hazaar", "hazar", "sadhe", "saadhe", "dedh", "dhai", "k"]);
/** Single words that are usually articles or verbs, not numbers ("a", "give"). */
const AMBIGUOUS_ALONE = new Set(["one", "एक", "ஒரு", "ஓர்", "ஒன்று", "दो"]);

function lexValue(tok: string): boolean {
  const t = tok.toLowerCase();
  if (ROMANISED_HINDI.has(t)) return false;
  return UNITS[t] !== undefined || MULTS[t] !== undefined || FRACTION_PREFIX[t] !== undefined;
}

const PHONE_RE = /(?:\+91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const DIGITS_RE = /(?<![\d.])\d[\d,]*(?:\.\d+)?(?:\s*(?:k|lakhs?|lac|thousand|हज़ार|हजार|लाख|ஆயிரம்|லட்சம்))?(?![\d])/gi;

/**
 * Finds every number in text: phone numbers, digit runs (8,500 · 1.2 lakh), and number-word runs
 * in English, Hindi and Tamil ("எட்டாயிரத்து ஐநூறு" → 8500, "आठ हज़ार पाँच सौ" → 8500).
 */
export function findNumberSpans(input: string, opts: { lenient?: boolean } = {}): NumberSpan[] {
  const text = normalizeDigits(input);
  const spans: NumberSpan[] = [];
  const taken = (a: number, b: number) => spans.some((s) => a < s.end && b > s.start);

  for (const m of text.matchAll(PHONE_RE)) {
    spans.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], value: Number(m[0].replace(/\D/g, "").slice(-10)), kind: "phone" });
  }
  for (const m of text.matchAll(DIGITS_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (taken(start, end)) continue;
    const v = parseAmount(m[0]);
    if (v != null) spans.push({ start, end, text: m[0], value: v, kind: "digits" });
  }

  // Word runs: consecutive number words (connectors "and"/"और" allowed inside a run).
  const words = [...text.matchAll(/[\p{L}\p{M}]+/gu)].map((m) => ({ w: m[0], start: m.index!, end: m.index! + m[0].length }));
  let i = 0;
  while (i < words.length) {
    if (!lexValue(words[i].w) || taken(words[i].start, words[i].end)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < words.length) {
      const next = words[j + 1];
      const gap = text.slice(words[j].end, next.start);
      if (!/^[\s-]*$/.test(gap)) break;
      if (lexValue(next.w)) {
        j++;
        continue;
      }
      const conn = /^(and|और|aur)$/i.test(next.w) && words[j + 2] && lexValue(words[j + 2].w);
      if (conn) {
        j += 2;
        continue;
      }
      break;
    }
    const run = words.slice(i, j + 1);
    const spanText = text.slice(run[0].start, run[run.length - 1].end);
    const value = parseAmount(spanText);
    const lone = !opts.lenient && run.length === 1 && AMBIGUOUS_ALONE.has(run[0].w.toLowerCase());
    if (value != null && !lone && !taken(run[0].start, run[run.length - 1].end)) {
      spans.push({ start: run[0].start, end: run[run.length - 1].end, text: spanText, value, kind: "words" });
    }
    i = j + 1;
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** All numeric values in text (digits and number words). `lenient` also counts lone "one"/"दो"-style words. */
export function numericValues(text: string, opts: { lenient?: boolean } = {}): number[] {
  return findNumberSpans(text, opts).map((s) => s.value);
}

/**
 * Back-check: every number stated in the source must appear (as digits or words) in the translation.
 * Returns the missing values — empty means the translation is safe to send.
 */
export function missingNumbers(source: string, translated: string): number[] {
  const want = numericValues(source);
  const have = numericValues(translated, { lenient: true });
  const pool = [...have];
  const missing: number[] = [];
  for (const v of want) {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
    else missing.push(v);
  }
  return missing;
}

/** Indian digit grouping: 8500 → "8,500", 120000 → "1,20,000". */
export function formatIndian(n: number): string {
  return n.toLocaleString("en-IN");
}
