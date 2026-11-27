import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "../supabase/server";
import { seedDemo } from "../seed";
import type { Conversation, Listing, Message, Order, OrderStatus, Product, Seller } from "../types";
import type { ConversationFull, DashboardData, OpenOrder, OrderWithProduct, ProductWithSeller, Store } from "./types";
import { assembleDashboard } from "./shared";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseStore implements Store {
  readonly mode = "supabase" as const;
  private get sb(): SupabaseClient {
    return getAdminSupabase();
  }

  async getSeller(id: string) {
    return check(await this.sb.from("sellers").select("*").eq("id", id).maybeSingle()) as Seller | null;
  }

  async insertSeller(row: Omit<Seller, "id" | "created_at">) {
    return check(await this.sb.from("sellers").insert(row).select("*").single()) as Seller;
  }

  async getProduct(id: string) {
    return check(await this.sb.from("products").select("*, seller:sellers(*)").eq("id", id).maybeSingle()) as
      | (Product & { seller: Seller })
      | null;
  }

  async listPublished(filters: { category?: string; state?: string; sellerId?: string } = {}) {
    let q = this.sb
      .from("products")
      .select("*, seller:sellers!inner(id, name, city, state, language)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.state) q = q.eq("seller.state", filters.state);
    if (filters.sellerId) q = q.eq("seller_id", filters.sellerId);
    return (check(await q) ?? []) as ProductWithSeller[];
  }

  async listFacets() {
    const rows = (check(
      await this.sb.from("products").select("category, seller:sellers!inner(state)").eq("status", "published")
    ) ?? []) as unknown as Array<{ category: string | null; seller: { state: string | null } }>;
    return {
      categories: [...new Set(rows.map((r) => r.category).filter((x): x is string => Boolean(x)))].sort(),
      states: [...new Set(rows.map((r) => r.seller?.state).filter((x): x is string => Boolean(x)))].sort(),
    };
  }

  async saveProduct(row: Omit<Product, "id" | "created_at">, productId?: string) {
    const q = productId
      ? this.sb.from("products").update(row).eq("id", productId).eq("seller_id", row.seller_id).select("id").single()
      : this.sb.from("products").insert(row).select("id").single();
    return (check(await q) as { id: string }).id;
  }

  async setProductStatus(id: string, sellerId: string, status: Product["status"]) {
    check(await this.sb.from("products").update({ status }).eq("id", id).eq("seller_id", sellerId));
  }

  async setProductListing(id: string, listing: Listing) {
    check(await this.sb.from("products").update({ listing }).eq("id", id));
  }

  async getConversation(id: string) {
    return check(
      await this.sb
        .from("conversations")
        .select("*, seller:sellers(*), product:products(id, name, photo_url, price, listing)")
        .eq("id", id)
        .maybeSingle()
    ) as ConversationFull | null;
  }

  async findOrCreateConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string) {
    const existing = check(
      await this.sb
        .from("conversations")
        .select("id")
        .eq("product_id", productId)
        .eq("buyer_name", buyerName)
        .eq("buyer_language", buyerLanguage)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ) as { id: string } | null;
    if (existing) return existing.id;
    const created = check(
      await this.sb
        .from("conversations")
        .insert({ product_id: productId, seller_id: sellerId, buyer_name: buyerName, buyer_language: buyerLanguage })
        .select("id")
        .single()
    ) as { id: string };
    return created.id;
  }

  async getMessages(conversationId: string) {
    return (check(
      await this.sb.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500)
    ) ?? []) as Message[];
  }

  async insertMessage(row: Omit<Message, "id" | "created_at">) {
    return check(await this.sb.from("messages").insert(row).select("*").single()) as Message;
  }

  async getConversationOrders(conversationId: string) {
    return (check(
      await this.sb.from("orders").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false })
    ) ?? []) as Order[];
  }

  async insertOrder(row: Pick<Order, "product_id" | "conversation_id" | "buyer_name" | "quantity">) {
    return check(await this.sb.from("orders").insert(row).select("*").single()) as Order;
  }

  async getOrder(id: string) {
    return check(
      await this.sb.from("orders").select("*, product:products(id, name, listing, seller_id)").eq("id", id).maybeSingle()
    ) as OrderWithProduct | null;
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    return check(await this.sb.from("orders").update({ status }).eq("id", id).select("*").single()) as Order;
  }

  async listOpenOrders(sellerId: string): Promise<OpenOrder[]> {
    const rows = (check(
      await this.sb
        .from("orders")
        .select("id, buyer_name, status, created_at, quantity, product:products!inner(name, seller_id)")
        .eq("product.seller_id", sellerId)
        .neq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(20)
    ) ?? []) as unknown as Array<Omit<OpenOrder, "product_name"> & { product: { name: string } }>;
    return rows.map(({ product, ...o }) => ({ ...o, product_name: product.name }));
  }

  async getDashboard(sellerId: string): Promise<DashboardData | null> {
    const seller = await this.getSeller(sellerId);
    if (!seller) return null;
    const [products, convs] = await Promise.all([
      this.sb.from("products").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }),
      this.sb
        .from("conversations")
        .select("*, product:products(id, name, photo_url)")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const productRows = (check(products) ?? []) as Product[];
    const convRows = (check(convs) ?? []) as Array<Conversation & { product: Pick<Product, "id" | "name" | "photo_url"> | null }>;
    const productIds = productRows.map((p) => p.id);
    const convIds = convRows.map((c) => c.id);

    const [orders, msgs] = await Promise.all([
      productIds.length
        ? this.sb
            .from("orders")
            .select("*, product:products(id, name, photo_url, price, listing)")
            .in("product_id", productIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      convIds.length
        ? this.sb.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(300)
        : Promise.resolve({ data: [], error: null }),
    ]);
    return assembleDashboard(seller, productRows, convRows, (check(orders) ?? []) as DashboardData["orders"], (check(msgs) ?? []) as Message[]);
  }

  async upload(bucket: string, path: string, data: Blob | Buffer, contentType: string) {
    const { error } = await this.sb.storage.from(bucket).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return this.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  reset(opts?: Parameters<Store["reset"]>[0]) {
    return seedDemo(this.sb, opts);
  }

  async check() {
    const { count, error } = await this.sb.from("products").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    const buckets = await this.sb.storage.listBuckets();
    if (buckets.error) throw new Error(`storage: ${buckets.error.message}`);
    const names = buckets.data.map((b) => b.name);
    const missing = ["product-photos", "voice-intros", "chat-audio"].filter((b) => !names.includes(b));
    if (missing.length) throw new Error(`missing buckets: ${missing.join(", ")}`);
    return { db: `${count ?? 0} products`, storage: names.join(", ") };
  }
}
