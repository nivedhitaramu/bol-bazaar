/**
 * Structured LLM tasks with strict JSON + zod validation, each with a
 * deterministic fallback so the app keeps working without Sarvam.
 */
import { z } from "zod";
import { chatCompletion, parseJsonObject, sarvamAvailable } from "./sarvam";
import { translate } from "./translate";
import { findCurrencyAmounts, findPriceNear, findQuantityNear, mentionsPrice, mentionsQuantity, normalizeDigits } from "./numbers";
import { CATEGORIES, langInfo, type LangCode, shortOf } from "./languages";
import type { Listing, ListingText, Order, OrderStatus, ProductDraft } from "./types";
import { translator } from "./i18n";

export type Source = "llm" | "heuristic";

// ───────────────────────── Schemas ─────────────────────────

const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() && !/^(null|none|n\/a|unknown)$/i.test(v.trim()) ? v.trim() : null));

const nullableInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(normalizeDigits(String(v)).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  });

export const DraftSchema = z.object({
  product_name: nullableStr,
  category: nullableStr,
  material: nullableStr,
  craft_story: nullableStr,
  price: nullableInt,
  quantity: nullableInt,
  size_options: z
    .union([z.array(z.string()), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const arr = (Array.isArray(v) ? v : v.split(/,|\/|\n/)).map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : null;
    }),
});

const ListingTextSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1200),
  tags: z
    .array(z.string())
    .transform((t) => t.map((x) => x.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5)),
});

export const DRAFT_FIELDS = ["product_name", "category", "material", "craft_story", "price", "quantity", "size_options"] as const;

export function missingFields(d: ProductDraft): (typeof DRAFT_FIELDS)[number][] {
  return DRAFT_FIELDS.filter((k) => d[k] == null || (Array.isArray(d[k]) && (d[k] as string[]).length === 0));
}

function normalizeCategory(c: string | null): string | null {
  if (!c) return null;
  const hit = CATEGORIES.find((x) => x.toLowerCase() === c.toLowerCase());
  if (hit) return hit;
  const loose = CATEGORIES.find((x) => x.toLowerCase().split(/[ &]+/).some((w) => w.length > 3 && c.toLowerCase().includes(w)));
  return loose ?? "Other";
}

/** The exact-number guard: if the transcript states one explicit currency amount, that wins. */
function guardNumbers(draft: ProductDraft, transcript: string): ProductDraft {
  const amounts = findCurrencyAmounts(transcript);
  const out = { ...draft };
  if (amounts.length === 1 && out.price !== amounts[0]) out.price = amounts[0];
  if (out.quantity == null) out.quantity = findQuantityNear(transcript);
  return out;
}

async function llmJson<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens = 1200): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatCompletion(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: attempt === 0 ? user : `${user}\n\nIMPORTANT: Reply with ONE valid JSON object only. No prose, no markdown.`,
        },
      ],
      { json: true, maxTokens, temperature: attempt === 0 ? 0.1 : 0 }
    );
    try {
      return schema.parse(parseJsonObject(raw));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM returned invalid JSON");
}

// ───────────────────────── 1. Extraction ─────────────────────────

const NUMBER_RULES = `NUMBER RULES (critical):
- Prices are in Indian rupees. Convert spoken number words from ANY Indian language to an integer, using Indian numbering.
  Examples: "எட்டாயிரத்து ஐநூறு" = 8500, "साढ़े आठ हज़ार" = 8500, "आठ हजार पांच सौ" = 8500, "one lakh twenty thousand" = 120000,
  "1.2 lakh" = 120000, "8.5k" = 8500, "ಸಾವಿರದ ಇನ್ನೂರು" = 1200, "পনেরোশো" = 1500.
- Preserve the EXACT amount and quantity the seller said. Never round, never estimate, never add tax or discounts.`;

const EXTRACT_SYSTEM = `You extract product details from a small Indian seller's spoken description. The transcript may be in any Indian language, English, or code-mixed.

Return ONLY a JSON object with exactly these keys:
{"product_name": string|null, "category": string|null, "material": string|null, "craft_story": string|null, "price": integer|null, "quantity": integer|null, "size_options": string[]|null}

STRICT RULES:
- Extract ONLY what the seller actually said. NEVER invent, guess, assume, or embellish anything.
- If a field was not mentioned, it MUST be null. An empty field is far better than an invented one.
- product_name: the product's name exactly as the seller said it (keep their words and proper nouns, e.g. "Kanchipuram silk saree").
- category: choose one of ${JSON.stringify(CATEGORIES)} only if the product type makes it obvious, else null.
- material: translated to plain English (e.g. "பட்டு" → "silk", "मिट्टी" → "clay"), only if stated.
- craft_story: 1–2 English sentences using ONLY what they said about who made it, how, how long, tradition, place. null if nothing said.
- price: integer rupees per unit. quantity: integer units available.
- size_options: sizes/variants/colours the seller said are available, translated to English, else null.

${NUMBER_RULES}`;

export async function extractProduct(transcript: string, lang: LangCode): Promise<{ draft: ProductDraft; source: Source }> {
  if (sarvamAvailable()) {
    try {
      const draft = await llmJson(
        EXTRACT_SYSTEM,
        `Seller's language: ${langInfo(lang).name}\nTranscript:\n"""${transcript}"""`,
        DraftSchema,
        700
      );
      draft.category = normalizeCategory(draft.category);
      return { draft: guardNumbers(draft, transcript), source: "llm" };
    } catch (e) {
      console.warn("extractProduct LLM failed, using heuristic:", (e as Error).message);
    }
  }
  return { draft: heuristicExtract(transcript), source: "heuristic" };
}

export function heuristicExtract(transcript: string): ProductDraft {
  return guardNumbers(
    {
      product_name: null,
      category: null,
      material: null,
      craft_story: transcript.trim() || null,
      price: findPriceNear(transcript),
      quantity: findQuantityNear(transcript),
      size_options: null,
    },
    transcript
  );
}

// ───────────────────────── 2. Listing generation ─────────────────────────

const LISTING_SYSTEM = `You write short, warm product listings for Indian artisans on a marketplace.

STRICT RULES:
- Use ONLY the facts provided. Do NOT add any fact that is not in the input (no invented sizes, dimensions, weights, colours, origins, care instructions, certifications or claims).
- Keep proper nouns (people, places, crafts) and all numbers exactly as given.
- Do not mention the price in the text.
- title: max 70 characters.
- description: exactly 3 short lines separated by "\\n". The craft story must appear if provided.
- tags: exactly 5 short search tags.
- Write each language block natively in that language's script (Hindi in Devanagari, Tamil in Tamil script, etc.). English block in English.

Return ONLY a JSON object whose keys are the requested language codes, each value {"title": string, "description": string, "tags": string[]}.`;

export async function generateListing(
  draft: ProductDraft,
  sellerLang: LangCode,
  seller?: { name?: string | null; city?: string | null; craft?: string | null }
): Promise<{ listing: Listing; source: Source }> {
  const codes = Array.from(new Set(["en", "hi", shortOf(sellerLang)]));
  const facts = {
    product_name: draft.product_name,
    category: draft.category,
    material: draft.material,
    craft_story: draft.craft_story,
    quantity_available: draft.quantity,
    size_options: draft.size_options,
    maker: seller?.name ?? null,
    maker_city: seller?.city ?? null,
  };

  if (sarvamAvailable()) {
    try {
      const schema = z.object(Object.fromEntries(codes.map((c) => [c, ListingTextSchema])) as Record<string, typeof ListingTextSchema>);
      const names = codes.map((c) => `${c} (${langInfo(`${c}-IN`).name})`).join(", ");
      const listing = (await llmJson(
        LISTING_SYSTEM,
        `Languages to write: ${names}\nFacts (JSON):\n${JSON.stringify(facts, null, 1)}`,
        schema,
        1800
      )) as Listing;
      return { listing, source: "llm" };
    } catch (e) {
      console.warn("generateListing LLM failed, using template:", (e as Error).message);
    }
  }
  return { listing: await templateListing(draft, codes, seller), source: "heuristic" };
}

async function templateListing(
  draft: ProductDraft,
  codes: string[],
  seller?: { name?: string | null; city?: string | null }
): Promise<Listing> {
  const name = draft.product_name || "Handmade product";
  const lines = [
    draft.material ? `Made with ${draft.material}.` : "Handmade with care.",
    draft.craft_story || (seller?.name ? `Made by ${seller.name}${seller.city ? ` in ${seller.city}` : ""}.` : "Made by a local artisan."),
    draft.size_options?.length ? `Available: ${draft.size_options.join(", ")}.` : draft.quantity ? `${draft.quantity} available.` : "Order directly from the maker.",
  ];
  const en: ListingText = {
    title: name.slice(0, 70),
    description: lines.join("\n"),
    tags: [draft.category, draft.material, "handmade", seller?.city, "made in india"]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase())
      .slice(0, 5),
  };
  const listing: Listing = { en };
  for (const c of codes.filter((c) => c !== "en")) {
    listing[c] = await translateListing(en, `${c}-IN`).catch(() => en);
  }
  return listing;
}

export async function translateListing(en: ListingText, target: string): Promise<ListingText> {
  if (!sarvamAvailable()) return en;
  const [title, description, tags] = await Promise.all([
    translate(en.title, "en-IN", target).then((r) => r.text),
    translate(en.description.replace(/\n/g, " || "), "en-IN", target).then((r) => r.text),
    translate(en.tags.join(", "), "en-IN", target).then((r) => r.text),
  ]);
  return {
    title,
    description: description.split(/\s*\|\|\s*/).join("\n"),
    tags: tags.split(/[,،、]/).map((t) => t.trim()).filter(Boolean).slice(0, 5),
  };
}

// ───────────────────────── 3. Voice edit ─────────────────────────

const EDIT_SYSTEM = `You update a product's details based on the seller's spoken edit instruction (any Indian language, English, or code-mixed).

Input: the current product JSON and the instruction.
Return ONLY a JSON object: {"product": <the FULL updated product JSON with the same keys>, "change": "<short English summary of what changed>"}

STRICT RULES:
- Change ONLY what the instruction asks. Copy every other field unchanged, byte for byte.
- "add: X" style instructions add information to the most appropriate field (colours/sizes/variants → size_options; materials → material; story/making details → craft_story; name → product_name).
- Never invent information that was not said.
- If the instruction is unclear, return the product unchanged and change = "no change".

${NUMBER_RULES}`;

const EditSchema = z.object({ product: DraftSchema, change: z.string().optional().default("") });

export async function applyEdit(
  draft: ProductDraft,
  instruction: string,
  lang: LangCode
): Promise<{ draft: ProductDraft; change: string; source: Source }> {
  if (sarvamAvailable()) {
    try {
      const res = await llmJson(
        EDIT_SYSTEM,
        `Seller's language: ${langInfo(lang).name}\nCurrent product:\n${JSON.stringify(draft)}\nInstruction:\n"""${instruction}"""`,
        EditSchema,
        900
      );
      const next = { ...res.product, category: normalizeCategory(res.product.category) };
      // Exactness guard: an explicit currency amount / price phrase in the instruction is authoritative.
      if (mentionsPrice(instruction)) {
        const p = findPriceNear(instruction);
        if (p != null) next.price = p;
      }
      if (mentionsQuantity(instruction)) {
        const q = findQuantityNear(instruction);
        if (q != null) next.quantity = q;
      }
      return { draft: next, change: res.change, source: "llm" };
    } catch (e) {
      console.warn("applyEdit LLM failed, using heuristic:", (e as Error).message);
    }
  }
  return { ...heuristicEdit(draft, instruction), source: "heuristic" };
}

export function heuristicEdit(draft: ProductDraft, instruction: string): { draft: ProductDraft; change: string } {
  const next = { ...draft };
  const changes: string[] = [];
  if (mentionsPrice(instruction)) {
    const p = findPriceNear(instruction);
    if (p != null) {
      next.price = p;
      changes.push(`price → ₹${p}`);
    }
  }
  if (mentionsQuantity(instruction)) {
    const q = findQuantityNear(instruction);
    if (q != null) {
      next.quantity = q;
      changes.push(`quantity → ${q}`);
    }
  }
  const add = instruction.match(/^\s*(?:add|also|जोड़ो|जोड़ें|சேர்)\s*[:,-]?\s*(.+)$/iu);
  if (!changes.length && add) {
    const extra = add[1].trim();
    next.size_options = [...(next.size_options ?? []), extra];
    changes.push(`added “${extra}”`);
  }
  return { draft: next, change: changes.join(", ") || "no change" };
}

// ───────────────────────── 4. Order voice commands ─────────────────────────

export type OrderIntent = "confirm" | "ship_tomorrow" | "shipped" | "delivered" | "unknown";

export const INTENT_TO_STATUS: Record<Exclude<OrderIntent, "unknown">, OrderStatus> = {
  confirm: "confirmed",
  ship_tomorrow: "confirmed",
  shipped: "shipped",
  delivered: "delivered",
};

const ALLOWED_FROM: Record<Exclude<OrderIntent, "unknown">, OrderStatus[]> = {
  confirm: ["placed"],
  ship_tomorrow: ["placed", "confirmed"],
  shipped: ["placed", "confirmed"],
  delivered: ["shipped", "confirmed"],
};

const INTENT_SYSTEM = `A small Indian seller speaks a short command about their orders (any Indian language, English, or code-mixed).
Map it to ONE intent:
- "confirm": confirm/accept the order (e.g. "confirm order", "ऑर्डर पक्का करो", "ஆர்டரை உறுதி செய்").
- "ship_tomorrow": will ship/send tomorrow or later (e.g. "ship tomorrow", "कल भेज दूँगा", "நாளை அனுப்புகிறேன்").
- "shipped": already sent/dispatched (e.g. "shipped", "भेज दिया", "அனுப்பிவிட்டேன்").
- "delivered": reached the buyer.
- "unknown": anything else.
Pick the order the seller refers to (by buyer name, product, or position). If not specified, use null.
Return ONLY JSON: {"intent": "...", "order_id": string|null}`;

const IntentSchema = z.object({
  intent: z.enum(["confirm", "ship_tomorrow", "shipped", "delivered", "unknown"]).catch("unknown"),
  order_id: z.union([z.string(), z.null()]).optional().transform((v) => v ?? null),
});

export type OrderBrief = Pick<Order, "id" | "buyer_name" | "status" | "created_at" | "quantity"> & { product_name: string };

export async function orderIntent(
  command: string,
  orders: OrderBrief[]
): Promise<{ intent: OrderIntent; orderId: string | null; source: Source }> {
  let intent: OrderIntent = "unknown";
  let orderId: string | null = null;
  let source: Source = "heuristic";
  if (sarvamAvailable()) {
    try {
      const res = await llmJson(
        INTENT_SYSTEM,
        `Orders (newest first):\n${JSON.stringify(orders.map((o) => ({ id: o.id, buyer: o.buyer_name, product: o.product_name, status: o.status })))}\nCommand:\n"""${command}"""`,
        IntentSchema,
        200
      );
      intent = res.intent;
      orderId = res.order_id;
      source = "llm";
    } catch (e) {
      console.warn("orderIntent LLM failed, using heuristic:", (e as Error).message);
    }
  }
  if (intent === "unknown") intent = heuristicIntent(command);
  if (intent === "unknown") return { intent, orderId: null, source };

  const allowed = ALLOWED_FROM[intent];
  const named = orders.find((o) => o.id === orderId);
  if (!named || !allowed.includes(named.status)) {
    const lc = command.toLowerCase();
    const byName = orders.find((o) => allowed.includes(o.status) && lc.includes(o.buyer_name.toLowerCase()));
    orderId = (byName ?? orders.find((o) => allowed.includes(o.status)))?.id ?? null;
  }
  return { intent, orderId, source };
}

export function heuristicIntent(command: string): OrderIntent {
  const c = command.toLowerCase();
  if (/(deliver|पहुँच|पहुंच|डिलीवर|சேர்ந்த|டெலிவரி ஆன)/u.test(c)) return "delivered";
  if (/(tomorrow|kal\b|कल|நாளை|రేపు|ನಾಳೆ|നാളെ|আগামীকাল|उद्या|આવતીકાલે)/u.test(c)) return "ship_tomorrow";
  if (/(shipped|dispatched|sent|bhej diya|भेज दिया|भेजा|அனுப்பிவிட்ட|அனுப்பியாச்சு|அனுப்பிட்ட|పంపించాను|ಕಳುಹಿಸಿದೆ)/u.test(c)) return "shipped";
  if (/(confirm|accept|pakka|पक्का|कन्फ़र्म|कन्फर्म|स्वीकार|உறுதி|கன்ஃபர்ம்|ok order)/u.test(c)) return "confirm";
  if (/(ship|send|भेज|அனுப்பு)/u.test(c)) return "shipped";
  return "unknown";
}

/** English template for the buyer-facing update; translated on the server. */
export function statusUpdateText(intent: Exclude<OrderIntent, "unknown">, productName: string, lang: LangCode): string {
  const s = shortOf(lang);
  const T: Record<string, Record<Exclude<OrderIntent, "unknown">, string>> = {
    en: {
      confirm: `✅ Your order for ${productName} is confirmed. Thank you!`,
      ship_tomorrow: `📦 Your order for ${productName} is confirmed and will be shipped tomorrow.`,
      shipped: `🚚 Your order for ${productName} has been shipped!`,
      delivered: `🎉 Your order for ${productName} has been delivered. Thank you!`,
    },
    hi: {
      confirm: `✅ आपका ${productName} का ऑर्डर पक्का हो गया है। धन्यवाद!`,
      ship_tomorrow: `📦 आपका ${productName} का ऑर्डर पक्का है और कल भेजा जाएगा।`,
      shipped: `🚚 आपका ${productName} का ऑर्डर भेज दिया गया है!`,
      delivered: `🎉 आपका ${productName} का ऑर्डर पहुँच गया है। धन्यवाद!`,
    },
    ta: {
      confirm: `✅ உங்கள் ${productName} ஆர்டர் உறுதி செய்யப்பட்டது. நன்றி!`,
      ship_tomorrow: `📦 உங்கள் ${productName} ஆர்டர் உறுதி, நாளை அனுப்பப்படும்.`,
      shipped: `🚚 உங்கள் ${productName} ஆர்டர் அனுப்பப்பட்டது!`,
      delivered: `🎉 உங்கள் ${productName} ஆர்டர் வந்து சேர்ந்தது. நன்றி!`,
    },
  };
  return (T[s] ?? T.en)[intent];
}

// ───────────────────────── Read-back text ─────────────────────────

export function readbackText(listing: Listing, draft: ProductDraft, lang: LangCode): string {
  const t = translator(lang);
  const s = shortOf(lang);
  const l = listing[s] ?? listing.en;
  const parts: string[] = [];
  if (l) parts.push(l.title + ".");
  if (draft.price != null) parts.push(`${t("price")}: ${draft.price} ₹.`);
  if (draft.quantity != null) parts.push(`${t("quantity")}: ${draft.quantity}.`);
  if (l) parts.push(l.description.replace(/\n/g, " "));
  const missing = missingFields(draft);
  const labels: Record<string, Parameters<typeof t>[0]> = {
    product_name: "productName",
    category: "category",
    material: "material",
    craft_story: "story",
    price: "price",
    quantity: "quantity",
    size_options: "sizes",
  };
  const important = missing.filter((m) => ["product_name", "price", "quantity"].includes(m));
  if (important.length) parts.push(`${t("missing")}: ${important.map((m) => t(labels[m])).join(", ")}.`);
  return parts.join(" ");
}
