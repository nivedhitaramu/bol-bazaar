import "server-only";
import { getAdminSupabase } from "./supabase/server";
import { ApiError, translateSafe } from "./api";
import { loadConversation, postMessage } from "./chat";
import { INTENT_TO_STATUS, type OrderIntent, statusUpdateText } from "./llm";
import { normalizeLang, shortOf } from "./languages";
import type { Listing, Message, Order, OrderStatus } from "./types";

const TEMPLATE_LANGS = new Set(["en", "hi", "ta"]);

function titleIn(listing: Listing | null, fallback: string, lang: string) {
  const s = shortOf(normalizeLang(lang));
  return listing?.[s]?.title ?? listing?.en?.title ?? fallback;
}

export function orderPlacedText(qty: number, name: string, lang: string) {
  const s = shortOf(normalizeLang(lang));
  if (s === "hi") return `🛒 मैंने ${name} के ${qty} नग का ऑर्डर दिया है।`;
  if (s === "ta") return `🛒 நான் ${name} ${qty} ஆர்டர் செய்துள்ளேன்.`;
  return `🛒 I have placed an order for ${qty} × ${name}.`;
}

export const STATUS_TO_INTENT: Record<OrderStatus, Exclude<OrderIntent, "unknown"> | null> = {
  placed: null,
  confirmed: "confirm",
  shipped: "shipped",
  delivered: "delivered",
};

type OrderRow = Order & { product: { id: string; name: string; listing: Listing; seller_id: string } };

export async function loadOrder(orderId: string): Promise<OrderRow> {
  const { data, error } = await getAdminSupabase()
    .from("orders")
    .select("*, product:products(id, name, listing, seller_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new ApiError(500, "db_error", error.message);
  if (!data) throw new ApiError(404, "not_found", "Order not found");
  return data as OrderRow;
}

/** Update status and send the buyer a translated, spoken update in the chat. */
export async function setOrderStatus(
  orderId: string,
  sellerId: string,
  status: OrderStatus,
  intent?: Exclude<OrderIntent, "unknown">
): Promise<{ order: Order; message: Message | null }> {
  const order = await loadOrder(orderId);
  if (order.product.seller_id !== sellerId) throw new ApiError(403, "forbidden", "Not your order");

  const { data, error } = await getAdminSupabase().from("orders").update({ status }).eq("id", orderId).select("*").single();
  if (error) throw new ApiError(500, "db_error", error.message);

  let message: Message | null = null;
  const it = intent ?? STATUS_TO_INTENT[status];
  if (order.conversation_id && it) {
    const conv = await loadConversation(order.conversation_id);
    const sellerLang = conv.seller.language;
    const buyerLang = conv.buyer_language;
    const original = statusUpdateText(it, titleIn(order.product.listing, order.product.name, sellerLang), normalizeLang(sellerLang));
    let translated: string;
    if (TEMPLATE_LANGS.has(shortOf(normalizeLang(buyerLang)))) {
      translated = statusUpdateText(it, titleIn(order.product.listing, order.product.name, buyerLang), normalizeLang(buyerLang));
    } else {
      translated = (await translateSafe(original, sellerLang, buyerLang, "formal")).text;
    }
    message = (await postMessage({ conv, sender: "seller", text: original, translated })).message;
  }
  return { order: data as Order, message };
}

export { INTENT_TO_STATUS };
