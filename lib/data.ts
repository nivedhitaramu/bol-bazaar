import "server-only";
import { getAdminSupabase } from "./supabase/server";
import { isSupabaseConfigured } from "./env";
import type { Conversation, Message, Order, Product, Seller } from "./types";

export { isSupabaseConfigured };

export async function getSeller(id: string): Promise<Seller | null> {
  const { data, error } = await getAdminSupabase().from("sellers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Seller | null;
}

export async function getProduct(id: string): Promise<(Product & { seller: Seller }) | null> {
  const { data, error } = await getAdminSupabase().from("products").select("*, seller:sellers(*)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Product & { seller: Seller }) | null;
}

export type ProductWithSeller = Product & { seller: Pick<Seller, "id" | "name" | "city" | "state" | "language"> };

export async function listPublished(filters: { category?: string; state?: string; sellerId?: string } = {}) {
  let q = getAdminSupabase()
    .from("products")
    .select("*, seller:sellers!inner(id, name, city, state, language)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.state) q = q.eq("seller.state", filters.state);
  if (filters.sellerId) q = q.eq("seller_id", filters.sellerId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductWithSeller[];
}

export async function listFacets() {
  const { data, error } = await getAdminSupabase()
    .from("products")
    .select("category, seller:sellers!inner(state)")
    .eq("status", "published");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<{ category: string | null; seller: { state: string | null } }>;
  const categories = [...new Set(rows.map((r) => r.category).filter((x): x is string => Boolean(x)))].sort();
  const states = [...new Set(rows.map((r) => r.seller?.state).filter((x): x is string => Boolean(x)))].sort();
  return { categories, states };
}

export async function getConversation(id: string) {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("conversations")
    .select("*, seller:sellers(*), product:products(id, name, photo_url, price, listing)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | (Conversation & { seller: Seller; product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> | null })
    | null;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await getAdminSupabase()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function getConversationOrders(conversationId: string): Promise<Order[]> {
  const { data, error } = await getAdminSupabase()
    .from("orders")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export type DashboardData = {
  seller: Seller;
  products: Product[];
  conversations: Array<Conversation & { product: Pick<Product, "id" | "name" | "photo_url"> | null; last: Message | null }>;
  orders: Array<Order & { product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> }>;
};

export async function getDashboard(sellerId: string): Promise<DashboardData | null> {
  const sb = getAdminSupabase();
  const seller = await getSeller(sellerId);
  if (!seller) return null;
  const [products, convs] = await Promise.all([
    sb.from("products").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
    sb
      .from("conversations")
      .select("*, product:products(id, name, photo_url)")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (products.error) throw new Error(products.error.message);
  if (convs.error) throw new Error(convs.error.message);
  const productIds = (products.data ?? []).map((p) => p.id);
  const convIds = (convs.data ?? []).map((c) => c.id);

  const [orders, msgs] = await Promise.all([
    productIds.length
      ? sb
          .from("orders")
          .select("*, product:products(id, name, photo_url, price, listing)")
          .in("product_id", productIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    convIds.length
      ? sb.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orders.error) throw new Error(orders.error.message);
  if (msgs.error) throw new Error(msgs.error.message);

  const lastByConv = new Map<string, Message>();
  for (const m of (msgs.data ?? []) as Message[]) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);

  const conversations = ((convs.data ?? []) as DashboardData["conversations"])
    .map((c) => ({ ...c, last: lastByConv.get(c.id) ?? null }))
    .sort((a, b) => ((b.last?.created_at ?? b.created_at) > (a.last?.created_at ?? a.created_at) ? 1 : -1));

  return {
    seller,
    products: (products.data ?? []) as Product[],
    conversations,
    orders: (orders.data ?? []) as DashboardData["orders"],
  };
}
