import { NextRequest } from "next/server";
import { ApiError, fail, ok, voiceInput } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/server";
import { type OrderBrief, orderIntent } from "@/lib/llm";
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

    const [input, ordersRes] = await Promise.all([
      voiceInput(form, lang),
      getAdminSupabase()
        .from("orders")
        .select("id, buyer_name, status, created_at, quantity, product:products!inner(name, seller_id)")
        .eq("product.seller_id", sellerId)
        .neq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (ordersRes.error) throw new ApiError(500, "db_error", ordersRes.error.message);
    const orders: OrderBrief[] = (ordersRes.data as unknown as Array<OrderBrief & { product: { name: string } }>).map((o) => ({
      id: o.id,
      buyer_name: o.buyer_name,
      status: o.status,
      created_at: o.created_at,
      quantity: o.quantity,
      product_name: o.product.name,
    }));

    const r = await orderIntent(input.transcript, orders);
    if (r.intent === "unknown") return ok({ transcript: input.transcript, intent: "unknown", order: null, message: null });
    if (!r.orderId) return ok({ transcript: input.transcript, intent: r.intent, order: null, message: null, reason: "no_matching_order" });

    const res = await setOrderStatus(r.orderId, sellerId, INTENT_TO_STATUS[r.intent], r.intent);
    return ok({ transcript: input.transcript, intent: r.intent, source: r.source, ...res });
  } catch (e) {
    return fail(e);
  }
}
