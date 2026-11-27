import type { Conversation, Message, Product, Seller } from "../types";
import type { DashboardData } from "./types";

/** Shared by both stores: last message, buyer message times (for unread badges), sorted by activity. */
export function assembleDashboard(
  seller: Seller,
  products: Product[],
  convs: Array<Conversation & { product: Pick<Product, "id" | "name" | "photo_url"> | null }>,
  orders: DashboardData["orders"],
  messagesNewestFirst: Message[]
): DashboardData {
  const lastByConv = new Map<string, Message>();
  const buyerTimes = new Map<string, string[]>();
  for (const m of messagesNewestFirst) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    if (m.sender === "buyer") buyerTimes.set(m.conversation_id, [...(buyerTimes.get(m.conversation_id) ?? []), m.created_at]);
  }
  const conversations = convs
    .map((c) => ({ ...c, last: lastByConv.get(c.id) ?? null, buyerTimes: buyerTimes.get(c.id) ?? [] }))
    .sort((a, b) => ((b.last?.created_at ?? b.created_at) > (a.last?.created_at ?? a.created_at) ? 1 : -1));
  return { seller, products, conversations, orders };
}
