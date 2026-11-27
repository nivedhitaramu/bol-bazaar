import { NextRequest } from "next/server";
import { ApiError, fail, ok, voiceInput } from "@/lib/api";
import { getStore } from "@/lib/store";
import { orderIntent } from "@/lib/llm";
import { INTENT_TO_STATUS, setOrderStatus } from "@/lib/orders";
import { normalizeLang } from "@/lib/languages";

export const maxDuration = 45;

/**
 * Seller voice command on orders: "confirm order", "ship tomorrow", "shipped" (any language).
 * multipart: sellerId, language, audio | text
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sellerId = String(form.get("sellerId") || "");
    if (!sellerId) throw new ApiError(400, "no_seller", "sellerId required");
    const lang = normalizeLang(form.get("language"));

    const [input, orders] = await Promise.all([voiceInput(form, lang), getStore().listOpenOrders(sellerId)]);

    const r = await orderIntent(input.transcript, orders);
    if (r.intent === "unknown") return ok({ transcript: input.transcript, intent: "unknown", order: null, message: null });
    if (!r.orderId) return ok({ transcript: input.transcript, intent: r.intent, order: null, message: null, reason: "no_matching_order" });

    const res = await setOrderStatus(r.orderId, sellerId, INTENT_TO_STATUS[r.intent], r.intent);
    return ok({ transcript: input.transcript, intent: r.intent, source: r.source, ...res });
  } catch (e) {
    return fail(e);
  }
}
