import "server-only";
/**
 * "Speak your shop online": spoken intro → structured shop profile → storefront copy in 3+ languages.
 *  - extractShop(): LLM extracts ONLY what was said (zod-validated); rule-based fallback without a key.
 *  - writeShop():   English copy written from those facts only, then the protected translation
 *                   pipeline (names/numbers protected, glossary, back-check) for hi / ta / seller's language.
 *                   Prices and years use deterministic templates — numbers never pass through MT.
 */
import { z } from "zod";
import { chatCompletion, parseJsonObject, sarvamAvailable, transliterate } from "./sarvam";
import { translate } from "./translate";
import { NAMES, scriptOf } from "./translate/protect";
import { findNumberSpans, formatIndian, normalizeDigits } from "./numbers";
import { langInfo, normalizeLang, shortOf, type LangCode } from "./languages";
import type { Seller, ShopDraft, ShopProfile, ShopText } from "./types";

export const SHOP_FIELDS = [
  "shop_name",
  "owner_name",
  "city",
  "craft",
  "years_of_experience",
  "story",
  "specialties",
  "price_range",
  "phone",
] as const;
export type ShopField = (typeof SHOP_FIELDS)[number];

// ───────────────────────── Extraction ─────────────────────────

const str = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() && !/^(null|none|n\/a|unknown)$/i.test(v.trim()) ? v.trim() : null));
const int = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(normalizeDigits(String(v)).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  });

export const ShopDraftSchema = z.object({
  shop_name: str,
  owner_name: str,
  city: str,
  craft: str,
  years_of_experience: int,
  story: str,
  specialties: z
    .union([z.array(z.string()), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const a = (Array.isArray(v) ? v : v.split(/,|\n/)).map((x) => x.trim()).filter(Boolean).slice(0, 6);
      return a.length ? a : null;
    }),
  price_range: z
    .union([z.object({ min: int, max: int }), z.null()])
    .optional()
    .transform((v) => (v && (v.min != null || v.max != null) ? { min: v.min ?? null, max: v.max ?? null } : null)),
  phone: str,
});

const EXTRACT_SYSTEM = `A small Indian seller describes herself/himself and her/his shop out loud (any Indian language, English, or code-mixed).
Extract ONLY what was actually said. NEVER invent, guess or embellish. Anything not said MUST be null.

Return ONLY JSON:
{"shop_name": string|null, "owner_name": string|null, "city": string|null, "craft": string|null,
 "years_of_experience": integer|null, "story": string|null, "specialties": string[]|null,
 "price_range": {"min": integer|null, "max": integer|null}|null, "phone": string|null}

Rules:
- shop_name: only if a shop/brand name was said. owner_name: the speaker's name, exactly as said.
- city: town/city as said (proper noun, keep exact). craft: in English (e.g. "Kanchipuram silk weaving").
- years_of_experience: integer years doing the craft, if said.
- story: 1–3 English sentences, third person, using ONLY the facts said (who, craft, how long, how it's made, who taught them).
- specialties: up to 5 short English items they said they make/sell.
- price_range: rupees as integers. "sarees start at 5000" → {"min":5000,"max":null}; "between 300 and 1200" → {"min":300,"max":1200}.
  Convert spoken numbers in any Indian language exactly ("ஐயாயிரம்" = 5000, "पाँच हज़ार" = 5000). Never round.
- phone: digits only if a phone/WhatsApp number was said.`;

export async function extractShop(transcript: string, lang: LangCode): Promise<{ draft: ShopDraft; source: "llm" | "heuristic" }> {
  if (sarvamAvailable()) {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await chatCompletion(
          [
            { role: "system", content: EXTRACT_SYSTEM },
            { role: "user", content: `Speaker's language: ${langInfo(lang).name}\nTranscript:\n"""${transcript}"""` },
          ],
          { json: true, maxTokens: 700, temperature: attempt ? 0 : 0.1 }
        );
        const parsed = ShopDraftSchema.safeParse(parseJsonObject(raw));
        if (parsed.success) return { draft: guardShopNumbers(parsed.data, transcript), source: "llm" };
      }
    } catch (e) {
      console.warn("extractShop LLM failed, using rules:", (e as Error).message);
    }
  }
  return { draft: heuristicShop(transcript), source: "heuristic" };
}

const YEAR_WORDS = /^\s*(?:\+|plus)?\s*(?:years?|yrs?|साल|सालों|वर्ष|वर्षों|வருட|வருடம்|வருடங்கள்|வருடமாக|வருடங்களாக|ஆண்டு|ஆண்டுகள்|ஆண்டுகளாக|ஏళ్ల|ವರ್ಷ|വർഷ)/iu;
const CURRENCY_NEAR = /^\s*(?:rupees?|rs\.?|₹|रुपये|रुपए|रुपया|रु|ரூபாய்|ரூ)|(?:₹|rs\.?|inr)\s*$/iu;
const FROM_WORDS = /(start|from|starting|onwards|शुरू|से|முதல்|தொடங்கி|ஆரம்ப)/iu;

/** Exactness guard: years and prices the seller stated explicitly beat the LLM's reading. */
function guardShopNumbers(d: ShopDraft, transcript: string): ShopDraft {
  const h = heuristicShop(transcript);
  return {
    ...d,
    years_of_experience: h.years_of_experience ?? d.years_of_experience,
    price_range: h.price_range ?? d.price_range,
    phone: d.phone ?? h.phone,
  };
}

const CRAFTS: Array<{ re: RegExp; craft: string; specialty: string }> = [
  { re: /kanchipuram|காஞ்சிபுரம்|कांचीपुरम/iu, craft: "Kanchipuram silk weaving", specialty: "Kanchipuram silk sarees" },
  { re: /silk|பட்டு|रेशम/iu, craft: "Silk weaving", specialty: "Silk sarees" },
  { re: /saree|sari|புடவை|சேலை|साड़ी/iu, craft: "Saree weaving", specialty: "Sarees" },
  { re: /handloom|கைத்தறி|हथकरघा/iu, craft: "Handloom weaving", specialty: "Handloom textiles" },
  { re: /zari|ஜரிகை|ज़री|जरी/iu, craft: "Zari work", specialty: "Zari work" },
  { re: /pottery|potter|terracotta|மண்பாண்ட|பானை|मिट्टी के बर्तन|कुम्हार|टेराकोटा/iu, craft: "Pottery", specialty: "Terracotta pottery" },
  { re: /pickle|achaar|ஊறுகாய்|अचार/iu, craft: "Homemade pickles", specialty: "Homemade pickles" },
  { re: /embroider|कढ़ाई|எம்பிராய்டரி/iu, craft: "Embroidery", specialty: "Embroidery" },
  { re: /jewel|आभूषण|गहने|நகை/iu, craft: "Jewellery making", specialty: "Handmade jewellery" },
  { re: /wood|लकड़ी|மரம்/iu, craft: "Woodwork", specialty: "Wooden crafts" },
];

/** Rule-based extraction (no key / LLM down). Conservative: misses rather than invents. */
export function heuristicShop(transcript: string): ShopDraft {
  const t = transcript.trim();
  const first = (res: RegExp[]) => {
    for (const re of res) {
      const m = t.match(re);
      if (m?.[1]) return m[1].trim().replace(/[.,।!?]+$/u, "");
    }
    return null;
  };

  const owner_name = first([
    /\b(?:[Mm]y name is|I am|I'm|[Tt]his is|[Ii]t's)\s+([A-Z][a-z]+)/,
    /मेरा नाम\s+([^\s,।.]+)/u,
    /என்\s*பெயர்\s+([^\s,.]+)/u,
    /నా పేరు\s+([^\s,.]+)/u,
  ]);
  const shop_name = first([
    /\b(?:shop(?:'s)? name is|my shop is called|shop is called|my shop is|brand is)\s+([^.,]+)/i,
    /दुकान का नाम\s+(.+?)\s+है/u,
    /கடை(?:யின்)?\s*பெயர்\s+([^.,]+?)(?:\.|,|$)/u,
  ]);

  // City: any known place name (en / hi / ta forms) → English form
  let city: string | null = null;
  for (const n of NAMES) {
    if (!/^[A-Z]/.test(n.en) || ["Meena", "Priya", "Ramesh", "Arjun", "Tamil Nadu", "Uttar Pradesh"].includes(n.en)) continue;
    if (Object.values(n).some((f) => t.toLowerCase().includes(f.toLowerCase()))) {
      city = n.en;
      break;
    }
  }

  const spans = findNumberSpans(t);
  let years: number | null = null;
  const prices: number[] = [];
  let phone: string | null = null;
  for (const s of spans) {
    const after = normalizeDigits(t).slice(s.end, s.end + 16);
    const before = normalizeDigits(t).slice(Math.max(0, s.start - 4), s.start);
    if (s.kind === "phone") phone = s.text.replace(/\D/g, "").slice(-10);
    else if (YEAR_WORDS.test(after) && s.value > 0 && s.value < 100) years = years ?? s.value;
    else if (CURRENCY_NEAR.test(after) || CURRENCY_NEAR.test(before) || (s.value >= 100 && FROM_WORDS.test(t))) prices.push(s.value);
  }
  let price_range: ShopDraft["price_range"] = null;
  if (prices.length === 1) price_range = FROM_WORDS.test(t) ? { min: prices[0], max: null } : { min: prices[0], max: prices[0] };
  else if (prices.length > 1) price_range = { min: Math.min(...prices), max: Math.max(...prices) };

  const hits = CRAFTS.filter((c) => c.re.test(t));
  return {
    shop_name,
    owner_name,
    city,
    craft: hits[0]?.craft ?? null,
    years_of_experience: years,
    story: t || null, // her own words, in her own language
    // Drop generic items already covered by a more specific one ("Sarees" ⊂ "Kanchipuram silk sarees").
    specialties: hits.length
      ? [...new Set(hits.map((h) => h.specialty))]
          .filter((x, _i, all) => !all.some((y) => y !== x && y.toLowerCase().includes(x.toLowerCase())))
          .slice(0, 5)
      : null,
    price_range,
    phone,
  };
}

/** Fill gaps from the seller's onboarding profile (known facts, not invented). */
export function withProfileDefaults(d: ShopDraft, seller: Pick<Seller, "name" | "city" | "craft"> | null): ShopDraft {
  if (!seller) return d;
  return { ...d, owner_name: d.owner_name ?? seller.name, city: d.city ?? seller.city, craft: d.craft ?? seller.craft };
}

export function missingShopFields(d: ShopDraft): ShopField[] {
  return SHOP_FIELDS.filter((k) => {
    const v = d[k];
    return v == null || (Array.isArray(v) && v.length === 0);
  });
}

// ───────────────────────── Storefront copy ─────────────────────────

/** Deterministic, number-safe phrases (never machine-translated). */
function priceText(p: ShopDraft["price_range"], s: string): string | null {
  if (!p || (p.min == null && p.max == null)) return null;
  const min = p.min != null ? `₹${formatIndian(p.min)}` : null;
  const max = p.max != null ? `₹${formatIndian(p.max)}` : null;
  if (min && max && p.min !== p.max) return `${min} – ${max}`;
  const one = (min ?? max)!;
  if (p.max == null) return s === "hi" ? `${one} से शुरू` : s === "ta" ? `${one} முதல்` : `From ${one}`;
  if (p.min == null) return s === "hi" ? `${one} तक` : s === "ta" ? `${one} வரை` : `Up to ${one}`;
  return one;
}
function yearsText(y: number | null, s: string): string | null {
  if (y == null) return null;
  return s === "hi" ? `${y} साल का अनुभव` : s === "ta" ? `${y} ஆண்டு அனுபவம்` : `${y} years of craft`;
}

const CopySchema = z.object({
  tagline: z.string().min(1).max(140),
  story: z.string().min(1).max(900),
  craft: z.string().min(1).max(80),
  specialties: z.array(z.string()).max(6).default([]),
});

const COPY_SYSTEM = `You write a warm, short storefront for a small Indian artisan's online shop.
Use ONLY the facts given. Do not add facts (no invented awards, materials, places, years, prices or claims).
Write plainly and warmly, like the maker introducing herself to a neighbour: no superlatives, no marketing filler
("passion", "dedication", "warmth of tradition"), no repeated words. Keep names exactly as given.
Return ONLY JSON: {"tagline": string (max 70 chars), "story": string (2–3 sentences, third person, warm),
"craft": string (short), "specialties": string[] (from the facts only)}. Do not mention prices or phone numbers. English only.`;

async function englishCopy(d: ShopDraft): Promise<{ tagline: string; story: string; craft: string; specialties: string[] }> {
  if (sarvamAvailable()) {
    try {
      const raw = await chatCompletion(
        [
          { role: "system", content: COPY_SYSTEM },
          {
            role: "user",
            content: `Facts:\n${JSON.stringify({ ...d, phone: undefined, price_range: undefined }, null, 1)}`,
          },
        ],
        { json: true, maxTokens: 600, temperature: 0.3 }
      );
      return CopySchema.parse(parseJsonObject(raw));
    } catch (e) {
      console.warn("shop copy LLM failed, using template:", (e as Error).message);
    }
  }
  const who = nameIn(d.owner_name, "en") || "This maker";
  const craft = d.craft ?? "handmade crafts";
  const city = d.city ? nameIn(d.city, "en") : null;
  const isEnglish = (x: string | null) => Boolean(x && scriptOf(x) === "Latn");
  return {
    tagline: [craft, city].filter(Boolean).join(" · "),
    story: isEnglish(d.story)
      ? d.story!
      : `${who} practises ${craft}${city ? ` in ${city}` : ""}${d.years_of_experience ? ` and has ${d.years_of_experience} years of experience` : ""}.`,
    craft,
    specialties: d.specialties ?? [],
  };
}

/** Offline forms for the craft / specialty labels the rule-based extractor produces. */
const OFFLINE_TERMS: Record<string, { hi: string; ta: string }> = {
  "Kanchipuram silk weaving": { hi: "कांचीपुरम रेशम बुनाई", ta: "காஞ்சிபுரம் பட்டு நெசவு" },
  "Silk weaving": { hi: "रेशम बुनाई", ta: "பட்டு நெசவு" },
  "Saree weaving": { hi: "साड़ी बुनाई", ta: "புடவை நெசவு" },
  "Handloom weaving": { hi: "हथकरघा बुनाई", ta: "கைத்தறி நெசவு" },
  "Zari work": { hi: "ज़री का काम", ta: "ஜரிகை வேலை" },
  Pottery: { hi: "मिट्टी के बर्तन", ta: "மண்பாண்டம்" },
  "Homemade pickles": { hi: "घर का बना अचार", ta: "வீட்டு ஊறுகாய்" },
  Embroidery: { hi: "कढ़ाई", ta: "எம்பிராய்டரி" },
  "Jewellery making": { hi: "आभूषण बनाना", ta: "நகை செய்தல்" },
  Woodwork: { hi: "लकड़ी का काम", ta: "மரவேலை" },
  "Kanchipuram silk sarees": { hi: "कांचीपुरम रेशमी साड़ियाँ", ta: "காஞ்சிபுரம் பட்டுப் புடவைகள்" },
  "Silk sarees": { hi: "रेशमी साड़ियाँ", ta: "பட்டுப் புடவைகள்" },
  Sarees: { hi: "साड़ियाँ", ta: "புடவைகள்" },
  "Handloom textiles": { hi: "हथकरघा कपड़े", ta: "கைத்தறி துணிகள்" },
  "Terracotta pottery": { hi: "टेराकोटा बर्तन", ta: "டெரகோட்டா பாண்டங்கள்" },
  "Handmade jewellery": { hi: "हस्तनिर्मित आभूषण", ta: "கைவினை நகைகள்" },
  "Wooden crafts": { hi: "लकड़ी के शिल्प", ta: "மரக் கைவினைப் பொருட்கள்" },
};
const termIn = (x: string, s: string) => (s === "hi" || s === "ta" ? (OFFLINE_TERMS[x]?.[s] ?? x) : x);
/** Known person/place names in the target script (offline). */
function nameIn(x: string | null, s: string): string {
  if (!x) return "";
  const hit = NAMES.find((n) => Object.values(n).some((f) => f.toLowerCase() === x.toLowerCase()));
  return hit?.[s] ?? hit?.en ?? x;
}

/** Offline templates for hi / ta when there's no translation key. */
function templateText(d: ShopDraft, s: string, gender: "female" | "male"): Omit<ShopText, "shop_name" | "price_text" | "years_text"> | null {
  const who = nameIn(d.owner_name, s);
  const craft = d.craft ? termIn(d.craft, s) : "";
  d = { ...d, city: d.city ? nameIn(d.city, s) : null, specialties: d.specialties?.map((x) => termIn(x, s)) ?? null };
  const y = d.years_of_experience;
  if (s === "hi") {
    const does = gender === "male" ? "करते हैं" : "करती हैं";
    return {
      tagline: [craft, d.city].filter(Boolean).join(" · "),
      story: `${who}${d.city ? ` ${d.city} में` : ""}${y ? ` ${y} साल से` : ""} ${craft} का काम ${does}।`.trim(),
      craft,
      specialties: d.specialties ?? [],
    };
  }
  if (s === "ta") {
    return {
      tagline: [craft, d.city].filter(Boolean).join(" · "),
      story: `${who}${d.city ? ` (${d.city})` : ""}${y ? ` ${y} ஆண்டுகளாக` : ""} ${craft} செய்து வருகிறார்.`.trim(),
      craft,
      specialties: d.specialties ?? [],
    };
  }
  return null;
}

/**
 * Shop name in another script: transliterate, never translate (it's a proper noun —
 * "Meena Silks" must not become "मीना रेशम"). Sarvam transliterates Indic ⇄ English, so
 * Tamil → Hindi goes via English: மீனா சில்க்ஸ் → Meena Silks → मीना सिल्क्स.
 */
async function shopNameIn(name: string, from: string, target: string): Promise<string> {
  if (!sarvamAvailable()) return name;
  const latin = scriptOf(name) === "Latn";
  if (latin && target === "en-IN") return name;
  if (!latin && target === from) return name;
  try {
    const roman = latin ? name : titleCase(await transliterate(name, from, "en-IN"));
    if (target === "en-IN") return roman || name;
    return (await transliterate(roman, "en-IN", target)) || name;
  } catch (e) {
    console.warn("shop name transliteration failed:", (e as Error).message);
    return name;
  }
}

const titleCase = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());

export async function writeShop(
  draft: ShopDraft,
  sellerLang: LangCode,
  gender: "female" | "male",
  transcript: string | null
): Promise<ShopProfile> {
  const langs = Array.from(new Set(["en", "hi", "ta", shortOf(sellerLang)]));
  const en = await englishCopy(draft);
  const fallbackName = draft.owner_name ? `${draft.owner_name}'s Shop` : "My Shop";
  const nameSrc = draft.shop_name ?? fallbackName;
  const nameLang = scriptOf(nameSrc) === "Latn" ? "en-IN" : sellerLang;
  const protectedNames = [draft.owner_name ?? "", draft.shop_name ?? "", draft.city ?? ""].filter(Boolean);

  // The shop name inside translated sentences is protected verbatim; swap in each language's script form.
  const romanName = draft.shop_name ? await shopNameIn(draft.shop_name, nameLang, "en-IN") : null;
  const withLocalName = (x: string, local: string) => {
    let out = x;
    for (const n of [draft.shop_name, romanName]) if (n && n !== local) out = out.split(n).join(local);
    return out;
  };

  const i18n: Record<string, ShopText> = {};
  /** Keyless / slow-network version of one language (templates, her own words). */
  const offlineFor = (s: string, shop_name: string): ShopText => {
    const tpl = templateText(draft, s, gender);
    const ownWords = s === shortOf(sellerLang) && transcript ? transcript : null;
    return {
      shop_name,
      tagline: tpl?.tagline ?? en.tagline,
      story: ownWords ?? tpl?.story ?? en.story,
      craft: tpl?.craft ?? en.craft,
      specialties: tpl?.specialties ?? en.specialties,
      price_text: priceText(draft.price_range, s),
      years_text: yearsText(draft.years_of_experience, s),
    };
  };
  const LANG_BUDGET_MS = 20_000; // never let one slow language stall the launch (Vercel limit 60 s)
  await Promise.all(
    langs.map(async (s) => {
      const code = `${s}-IN`;
      const common = { price_text: priceText(draft.price_range, s), years_text: yearsText(draft.years_of_experience, s) };
      const shop_name = draft.shop_name ? await shopNameIn(draft.shop_name, nameLang, code) : nameSrc;
      if (s === "en") {
        i18n.en = { shop_name: draft.shop_name ? shop_name : fallbackName, ...en, ...common };
        return;
      }
      if (sarvamAvailable()) {
        const tr = (x: string) => translate(x, "en-IN", code, { gender, names: protectedNames }).then((r) => (r.ok ? r.text : x));
        const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), LANG_BUDGET_MS));
        const parts = Promise.all([
          tr(en.tagline),
          tr(en.story),
          tr(en.craft),
          en.specialties.length ? tr(en.specialties.join(", ")).then((x) => x.split(/[,،、]/).map((v) => v.trim()).filter(Boolean)) : [],
        ]);
        const res = await Promise.race([parts, timeout]);
        if (res === "timeout") {
          console.warn(`storefront ${s}: translation over ${LANG_BUDGET_MS} ms, using offline text`);
          i18n[s] = offlineFor(s, shop_name);
          return;
        }
        const [tagline, story, craft, specialties] = res;
        i18n[s] = {
          shop_name,
          tagline: withLocalName(tagline, shop_name),
          story: withLocalName(story, shop_name),
          craft,
          specialties,
          ...common,
        };
        return;
      }
      // No key: her own words for her own language; templates for hi/ta; English otherwise.
      i18n[s] = offlineFor(s, shop_name);
    })
  );

  return {
    ...draft,
    transcript,
    language: sellerLang,
    i18n,
    updated_at: new Date().toISOString(),
  };
}

/** "Your shop is live. Share it on WhatsApp?" in the seller's language. */
export async function liveReadback(sellerLang: LangCode, shopName: string): Promise<string> {
  const s = shortOf(normalizeLang(sellerLang));
  const T: Record<string, string> = {
    en: `${shopName} — your shop is live. Share it on WhatsApp?`,
    hi: `${shopName} — आपकी दुकान अब ऑनलाइन है। WhatsApp पर शेयर करें?`,
    ta: `${shopName} — உங்கள் கடை இப்போது ஆன்லைனில் உள்ளது. WhatsApp-ல் பகிரலாமா?`,
  };
  if (T[s]) return T[s];
  const r = await translate(T.en, "en-IN", sellerLang, { names: [shopName] });
  return r.ok ? r.text : T.en;
}
