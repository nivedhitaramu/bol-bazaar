import { NextRequest } from "next/server";
import { ApiError, fail, ok, ttsSafe, voiceInput } from "@/lib/api";
import { getStore } from "@/lib/store";
import { orderIntent, type OrderIntent } from "@/lib/llm";
import { INTENT_TO_STATUS, setOrderStatus } from "@/lib/orders";
import { normalizeLang } from "@/lib/languages";
import { translator } from "@/lib/i18n";
import { isUndo, orderConfirmPrompt } from "@/lib/recovery";
import { nameIn } from "@/lib/ask/rules";

export const maxDuration = 45;

/**
 * Seller voice command on orders: "confirm order", "ship tomorrow", "shipped" (any language).
 * multipart: sellerId, language, audio | text
 *
 * Two-step with confirmation (used by the dashboard):
 *   dryRun=1                      → action "confirm": spoken "Mark Priya's order as Confirmed? Say yes or no."
 *   apply=1 + orderId + intent    → applied after the seller said "yes"
 *   "No, wrong" / "illa, thappu"  → action "undo" (the client reverts its last change)
 * Without dryRun/apply it applies immediately (backwards compatible).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sellerId = String(form.get("sellerId") || "");
    if (!sellerId) throw new ApiError(400, "no_seller", "sellerId required");
    const lang = normalizeLang(form.get("language"));

    // Step 2: the seller said "yes" — apply exactly what was proposed.
    if (form.get("apply") === "1") {
      const orderId = String(form.get("orderId") || "");
      const intent = String(form.get("intent") || "") as Exclude<OrderIntent, "unknown">;
      if (!orderId || !(intent in INTENT_TO_STATUS)) throw new ApiError(400, "bad_apply", "orderId and intent required");
      const res = await setOrderStatus(orderId, sellerId, INTENT_TO_STATUS[intent], intent);
      return ok({ action: "applied", intent, ...res });
    }

    const [input, orders] = await Promise.all([voiceInput(form, lang), getStore().listOpenOrders(sellerId)]);
    if (isUndo(input.transcript)) return ok({ action: "undo", transcript: input.transcript });

    const r = await orderIntent(input.transcript, orders);
    if (r.intent === "unknown") return ok({ action: "none", transcript: input.transcript, intent: "unknown", order: null, message: null });
    if (!r.orderId) return ok({ action: "none", transcript: input.transcript, intent: r.intent, order: null, message: null, reason: "no_matching_order" });

    if (form.get("dryRun") === "1") {
      const o = orders.find((x) => x.id === r.orderId)!;
      const status = INTENT_TO_STATUS[r.intent];
      const label = translator(lang)(`status_${status}`);
      const prompt = orderConfirmPrompt(nameIn(o.buyer_name, lang.split("-")[0]), o.product_name, label, lang);
      const audio = await ttsSafe(prompt, lang);
      return ok({
        action: "confirm",
        transcript: input.transcript,
        intent: r.intent,
        orderId: r.orderId,
        fromStatus: o.status,
        toStatus: status,
        prompt,
        audio: audio?.base64 ?? null,
        mime: audio?.mime ?? null,
      });
    }

    const res = await setOrderStatus(r.orderId, sellerId, INTENT_TO_STATUS[r.intent], r.intent);
    return ok({ action: "applied", transcript: input.transcript, intent: r.intent, source: r.source, ...res });
  } catch (e) {
    return fail(e);
  }
}
