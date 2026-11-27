import "server-only";
/**
 * "Ask your shop": spoken question → intent → facts from the store → short answer in the
 * seller's language. LLM intent when a key is set (validated), rule-based otherwise.
 */
import { z } from "zod";
import { getStore } from "../store";
import { chatCompletion, parseJsonObject, sarvamAvailable } from "../sarvam";
import { translateSafe } from "../api";
import { shortOf, normalizeLang } from "../languages";
import { canonicalName, composeAnswer, detectIntentRules, type AskFacts, type AskIntent } from "./rules";

const IntentSchema = z.object({
  intent: z.enum(["today_summary", "pending_replies", "orders", "last_message_from", "help"]).catch("today_summary"),
  person: z.union([z.string(), z.null()]).optional().transform((v) => v ?? null),
});

const SYSTEM = `A small Indian seller (who may not read) asks her shop assistant a short spoken question,
in any Indian language, English, romanised or code-mixed (e.g. "Indru enna aachu?" = "what happened today?").
Pick ONE intent:
- "today_summary": what happened today / any news / how was today
- "pending_replies": who is waiting for my reply / whom should I answer
- "orders": how many orders / which orders to confirm or ship
- "last_message_from": what did <buyer> say or ask / latest message
- "help": not about the shop
If a buyer is named, set "person" to that name exactly as it appears in the buyer list, else null.
Return ONLY JSON: {"intent": "...", "person": string|null}`;

async function detectIntent(question: string, buyers: string[]): Promise<{ intent: AskIntent; person: string | null; source: "llm" | "rules" }> {
  const rules = detectIntentRules(question, buyers);
  if (!sarvamAvailable()) return { ...rules, source: "rules" };
  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Buyers: ${JSON.stringify(buyers)}\nQuestion: """${question}"""` },
      ],
      { json: true, maxTokens: 80, temperature: 0, timeoutMs: 10_000 }
    );
    const r = IntentSchema.parse(parseJsonObject(raw));
    // Only accept a person who is actually one of her buyers (any script).
    const person = r.person ? (buyers.find((b) => canonicalName(b) === canonicalName(r.person!)) ?? rules.person) : rules.person;
    return { intent: r.intent, person: r.intent === "last_message_from" ? person : null, source: "llm" };
  } catch (e) {
    console.warn("ask intent LLM failed, using rules:", (e as Error).message);
    return { ...rules, source: "rules" };
  }
}

/** Midnight today in India (IST, UTC+5:30), as an ISO string. */
function istMidnightISO(now = Date.now()) {
  const offset = 5.5 * 3600_000;
  const ist = new Date(now + offset);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - offset).toISOString();
}

export async function askShop(sellerId: string, question: string, langIn?: string | null) {
  const store = getStore();
  const dash = await store.getDashboard(sellerId);
  if (!dash) throw new Error("Seller not found");
  const lang = normalizeLang(langIn || dash.seller.language);
  const buyers = [...new Set(dash.conversations.map((c) => c.buyer_name))];
  const { intent, person, source } = await detectIntent(question, buyers);

  const since = istMidnightISO();
  const todayOrders = dash.orders.filter((o) => o.created_at >= since);
  const open = dash.orders.filter((o) => o.status !== "delivered");
  const worth = (os: typeof dash.orders) => os.reduce((n, o) => n + (o.product.price ?? 0) * o.quantity, 0);

  const facts: AskFacts = {
    todayEnquiries: dash.conversations.filter((c) => c.buyerTimes.some((t) => t >= since)).length,
    todayOrders: todayOrders.length,
    todayOrdersWorth: worth(todayOrders),
    // last message in the conversation is from the buyer → she hasn't replied yet (newest first)
    waiting: dash.conversations.filter((c) => c.last?.sender === "buyer").map((c) => c.buyer_name),
    openOrders: {
      total: open.length,
      toConfirm: open.filter((o) => o.status === "placed").length,
      toShip: open.filter((o) => o.status === "confirmed").length,
      worth: worth(open),
    },
    lastMessage: null,
    person,
  };

  if (intent === "last_message_from") {
    const convs = person
      ? dash.conversations.filter((c) => canonicalName(c.buyer_name) === canonicalName(person))
      : dash.conversations.filter((c) => c.buyerTimes.length);
    // newest conversation activity first (dashboard is already sorted that way)
    for (const c of convs) {
      const msgs = await store.getMessages(c.id);
      const m = [...msgs].reverse().find((x) => x.sender === "buyer");
      if (!m) continue;
      let text: string;
      if (m.translated_text && normalizeLang(m.translated_language ?? "") === lang) text = m.translated_text;
      else if (normalizeLang(m.original_language) === lang) text = m.original_text;
      else text = (await translateSafe(m.original_text, m.original_language, lang, { names: [c.buyer_name] })).text;
      facts.lastMessage = { from: c.buyer_name, text };
      break;
    }
  }

  // Answers are written natively for ta / hi / en; other languages get the protected translation.
  const s = shortOf(lang);
  let answer = composeAnswer(intent, facts, ["ta", "hi", "en"].includes(s) ? lang : "en-IN");
  if (!["ta", "hi", "en"].includes(s)) {
    const tr = await translateSafe(answer, "en-IN", lang, { names: buyers });
    if (tr.ok) answer = tr.text;
  }
  return { intent, person, source, answer, lang, facts };
}
