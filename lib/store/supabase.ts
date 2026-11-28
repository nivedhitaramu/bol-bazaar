import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "../supabase/server";
import { seedDemo } from "../seed";
import type { Buyer, BuyerActivity, Conversation, Listing, Message, Order, OrderStatus, Product, Seller, ShopProfile } from "../types";

/** buyers / conversations.buyer_id come from migration 0004. */
function buyerCheck<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (/buyers|buyer_id/i.test(res.error.message) || res.error.code === "42P01" || res.error.code === "42703" || res.error.code === "PGRST205" || res.error.code === "PGRST204")
      throw new Error("MIGRATION_NEEDED: run supabase/migrations/0004_buyers.sql in the Supabase SQL Editor");
    throw new Error(res.error.message);
  }
  return res.data;
}
import type { AuthRecord } from "../authCore";

/** seller_auth comes from migration 0003 — say so clearly instead of a cryptic DB error. */
function authCheck<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (/seller_auth/i.test(res.error.message) || res.error.code === "42P01" || res.error.code === "PGRST205")
      throw new Error("MIGRATION_NEEDED: run supabase/migrations/0003_seller_auth.sql in the Supabase SQL Editor");
    throw new Error(res.error.message);
  }
  return res.data;
}
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

  async updateSellerLanguage(sellerId: string, language: string) {
    return check(await this.sb.from("sellers").update({ language }).eq("id", sellerId).select("*").single()) as Seller;
  }

  async getAuth(sellerId: string) {
    return authCheck(await this.sb.from("seller_auth").select("*").eq("seller_id", sellerId).maybeSingle()) as AuthRecord | null;
  }

  async saveAuth(rec: AuthRecord) {
    authCheck(await this.sb.from("seller_auth").upsert({ ...rec, updated_at: new Date().toISOString() }));
  }

  async findAuthByKeyHash(keyHash: string) {
    return authCheck(await this.sb.from("seller_auth").select("*").eq("key_hash", keyHash).maybeSingle()) as AuthRecord | null;
  }

  async listLoginSellers() {
    const ids = ((authCheck(await this.sb.from("seller_auth").select("seller_id").not("pin_hash", "is", null)) ?? []) as Array<{ seller_id: string }>).map((r) => r.seller_id);
    if (!ids.length) return [];
    const rows = (check(await this.sb.from("sellers").select("*").in("id", ids)) ?? []) as Seller[];
    return rows.map((s) => ({ id: s.id, name: s.name, city: s.city, shop: s.shop ?? null }));
  }

  async createBuyer(name: string, language: string) {
    return buyerCheck(await this.sb.from("buyers").insert({ name, language }).select("*").single()) as Buyer;
  }

  async getBuyer(id: string) {
    return buyerCheck(await this.sb.from("buyers").select("*").eq("id", id).maybeSingle()) as Buyer | null;
  }

  async setBuyerKeyHash(id: string, keyHash: string) {
    buyerCheck(await this.sb.from("buyers").update({ key_hash: keyHash }).eq("id", id));
  }

  async findBuyerByKeyHash(keyHash: string) {
    return buyerCheck(await this.sb.from("buyers").select("*").eq("key_hash", keyHash).maybeSingle()) as Buyer | null;
  }

  async getBuyerActivity(buyerId: string): Promise<BuyerActivity> {
    const convs = (buyerCheck(
      await this.sb
        .from("conversations")
        .select("*, seller:sellers(id, name, city), product:products(id, name, photo_url, price, listing)")
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false })
        .limit(50)
    ) ?? []) as Array<Omit<BuyerActivity["conversations"][number], "last">>;
    const ids = convs.map((c) => c.id);
    if (!ids.length) return { conversations: [], orders: [] };
    const [msgs, orders] = await Promise.all([
      this.sb.from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: false }).limit(300),
      this.sb.from("orders").select("*, product:products(id, name, photo_url, price, listing)").in("conversation_id", ids).order("created_at", { ascending: false }),
    ]);
    const last = new Map<string, Message>();
    for (const m of (check(msgs) ?? []) as Message[]) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
    const conversations = convs
      .map((c) => ({ ...c, last: last.get(c.id) ?? null }))
      .sort((a, b) => ((b.last?.created_at ?? b.created_at) > (a.last?.created_at ?? a.created_at) ? 1 : -1));
    return { conversations, orders: (check(orders) ?? []) as BuyerActivity["orders"] };
  }

  async supportsShops() {
    const { error } = await this.sb.from("sellers").select("shop").limit(1);
    return !error;
  }

  async saveShop(sellerId: string, shop: ShopProfile) {
    const { data, error } = await this.sb.from("sellers").update({ shop }).eq("id", sellerId).select("*").single();
    if (error) {
      if (/shop/i.test(error.message) && /column|schema/i.test(error.message)) {
        throw new Error("MIGRATION_NEEDED: run supabase/migrations/0002_shop_profile.sql in the Supabase SQL Editor");
      }
      throw new Error(error.message);
    }
    return data as Seller;
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

  async findOrCreateConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string, buyerId?: string | null) {
    if (buyerId) {
      // Identified buyer (migration 0004): their own conversation, never matched by name.
      const mine = buyerCheck(
        await this.sb.from("conversations").select("id").eq("product_id", productId).eq("buyer_id", buyerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      ) as { id: string } | null;
      if (mine) return mine.id;
      const made = buyerCheck(
        await this.sb
          .from("conversations")
          .insert({ product_id: productId, seller_id: sellerId, buyer_name: buyerName, buyer_language: buyerLanguage, buyer_id: buyerId })
          .select("id")
          .single()
      ) as { id: string };
      return made.id;
    }
    // Anonymous: match by name + language, but never join a conversation that belongs to an identified buyer.
    const anon = await this.sb
      .from("conversations")
      .select("id")
      .eq("product_id", productId)
      .eq("buyer_name", buyerName)
      .eq("buyer_language", buyerLanguage)
      .is("buyer_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!anon.error || !/buyer_id/.test(anon.error.message)) {
      const row = check(anon) as { id: string } | null;
      if (row) return row.id;
      return this.createConversation(productId, sellerId, buyerName, buyerLanguage);
    }
    // Before migration 0004 there's no buyer_id column: match by name + language as before.
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
    return this.createConversation(productId, sellerId, buyerName, buyerLanguage);
  }

  private async createConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string) {
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

  async getMessage(id: string) {
    return check(await this.sb.from("messages").select("*").eq("id", id).maybeSingle()) as Message | null;
  }

  async updateMessage(id: string, patch: Partial<Pick<Message, "translated_text" | "audio_url">>) {
    return check(await this.sb.from("messages").update(patch).eq("id", id).select("*").single()) as Message;
  }

  async deleteMessage(id: string) {
    check(await this.sb.from("messages").delete().eq("id", id));
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
