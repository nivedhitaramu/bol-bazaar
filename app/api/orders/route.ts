import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/server";
import { ensureConversation, loadConversation, postMessage } from "@/lib/chat";
import { normalizeLang, shortOf } from "@/lib/languages";
import { orderPlacedText } from "@/lib/orders";
import type { Listing } from "@/lib/types";

const Body = z.object({
  productId: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(60),
  buyerLanguage: z.string(),
  quantity: z.number().int().min(1).max(99),
});

/** Buyer places an order → conversation (find-or-create) + order + translated chat notice to the seller. */
export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json());
    const buyerLang = normalizeLang(b.buyerLanguage);
    const sb = getAdminSupabase();
    const { data: product, error: pe } = await sb
      .from("products")
      .select("id, seller_id, name, listing, status")
      .eq("id", b.productId)
      .maybeSingle();
    if (pe) throw new ApiError(500, "db_error", pe.message);
    if (!product || product.status !== "published") throw new ApiError(404, "not_found", "Product not available");

    const conversationId = await ensureConversation(product.id, product.seller_id, b.buyerName, buyerLang);
    const { data: order, error } = await sb
      .from("orders")
      .insert({ product_id: product.id, conversation_id: conversationId, buyer_name: b.buyerName, quantity: b.quantity })
      .select("*")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    // Notify the seller in their language (best-effort).
    try {
      const conv = await loadConversation(conversationId);
      const listing = product.listing as Listing;
      const t = (lang: string) => listing?.[shortOf(normalizeLang(lang))]?.title ?? listing?.en?.title ?? product.name;
      const sellerLang = conv.seller.language;
      const known = ["en", "hi", "ta"].includes(shortOf(normalizeLang(sellerLang)));
      await postMessage({
        conv,
        sender: "buyer",
        text: orderPlacedText(b.quantity, t(buyerLang), buyerLang),
        translated: known ? orderPlacedText(b.quantity, t(sellerLang), sellerLang) : undefined,
      });
    } catch (e) {
      console.warn("order notice failed:", (e as Error).message);
    }

    return ok({ orderId: order.id, conversationId });
  } catch (e) {
    return fail(e);
  }
}
