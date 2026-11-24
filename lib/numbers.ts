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
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  bees: 20, pachas: 50, pachaas: 50,
};

const MULTS: Record<string, number> = {
  hundred: 100, "सौ": 100, sau: 100, "நூறு": 100,
  thousand: 1000, "हज़ार": 1000, "हजार": 1000, hazaar: 1000, hazar: 1000, "ஆயிரம்": 1000, k: 1000,
  lakh: 100000, lakhs: 100000, lac: 100000, "लाख": 100000, "லட்சம்": 100000,
  crore: 10000000, "करोड़": 10000000, "கோடி": 10000000,
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
