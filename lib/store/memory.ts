import "server-only";
import { randomUUID } from "crypto";
import { buildSeedRows, type SeedResult } from "../seed";
import type { Conversation, Listing, Message, Order, OrderStatus, Product, Seller, ShopProfile } from "../types";
import { assembleDashboard } from "./shared";
import type { ConversationFull, DashboardData, NewMessage, OpenOrder, ProductInput, ProductWithSeller, Store } from "./types";

type Db = {
  sellers: Seller[];
  products: Product[];
  conversations: Conversation[];
  messages: Message[];
  orders: Order[];
  files: Map<string, { data: Buffer; type: string }>;
};

const MAX_FILES = 300;

/** One process-wide store that survives Next.js dev hot reloads. */
const g = globalThis as unknown as { __bolBazaarMemoryDb?: Db };

function fresh(): Db {
  const rows = buildSeedRows();
  return {
    sellers: rows.sellers,
    products: rows.products,
    conversations: [rows.conversation],
    messages: rows.messages,
    orders: [rows.order],
    files: g.__bolBazaarMemoryDb?.files ?? new Map(),
  };
}

function db(): Db {
  if (!g.__bolBazaarMemoryDb) g.__bolBazaarMemoryDb = fresh();
  return g.__bolBazaarMemoryDb;
}

const now = () => new Date().toISOString();
const clone = <T>(x: T): T => structuredClone(x);
const byNewest = <T extends { created_at: string }>(a: T, b: T) => (a.created_at < b.created_at ? 1 : -1);

/** In-memory files are served by /api/files/[...path]. */
export function readMemoryFile(key: string) {
  return db().files.get(key) ?? null;
}

export class MemoryStore implements Store {
  readonly mode = "memory" as const;

  async getSeller(id: string) {
    const s = db().sellers.find((x) => x.id === id);
    return s ? clone(s) : null;
  }

  async insertSeller(row: Omit<Seller, "id" | "created_at">) {
    const s: Seller = { ...row, id: randomUUID(), created_at: now() };
    db().sellers.push(s);
    return clone(s);
  }

  async supportsShops() {
    return true;
  }

  async saveShop(sellerId: string, shop: ShopProfile) {
    const s = db().sellers.find((x) => x.id === sellerId);
    if (!s) throw new Error("Seller not found");
    s.shop = clone(shop);
    return clone(s);
  }

  async getProduct(id: string) {
    const d = db();
    const p = d.products.find((x) => x.id === id);
    const seller = p && d.sellers.find((s) => s.id === p.seller_id);
    return p && seller ? clone({ ...p, seller }) : null;
  }

  async listPublished(filters: { category?: string; state?: string; sellerId?: string } = {}): Promise<ProductWithSeller[]> {
    const d = db();
    return d.products
      .filter((p) => p.status === "published")
      .filter((p) => !filters.category || p.category === filters.category)
      .filter((p) => !filters.sellerId || p.seller_id === filters.sellerId)
      .map((p) => ({ p, s: d.sellers.find((s) => s.id === p.seller_id) }))
      .filter(({ s }) => s && (!filters.state || s.state === filters.state))
      .sort((a, b) => byNewest(a.p, b.p))
      .slice(0, 100)
      .map(({ p, s }) => clone({ ...p, seller: { id: s!.id, name: s!.name, city: s!.city, state: s!.state, language: s!.language } }));
  }

  async listFacets() {
    const published = await this.listPublished();
    return {
      categories: [...new Set(published.map((p) => p.category).filter((x): x is string => Boolean(x)))].sort(),
      states: [...new Set(published.map((p) => p.seller.state).filter((x): x is string => Boolean(x)))].sort(),
    };
  }

  async saveProduct(row: ProductInput, productId?: string) {
    const d = db();
    if (productId) {
      const i = d.products.findIndex((p) => p.id === productId && p.seller_id === row.seller_id);
      if (i < 0) throw new Error("Product not found");
      d.products[i] = { ...d.products[i], ...clone(row) };
      return productId;
    }
    const p: Product = { ...clone(row), id: randomUUID(), created_at: now() };
    d.products.push(p);
    return p.id;
  }

  async setProductStatus(id: string, sellerId: string, status: Product["status"]) {
    const p = db().products.find((x) => x.id === id && x.seller_id === sellerId);
    if (p) p.status = status;
  }

  async setProductListing(id: string, listing: Listing) {
    const p = db().products.find((x) => x.id === id);
    if (p) p.listing = clone(listing);
  }

  async getConversation(id: string): Promise<ConversationFull | null> {
    const d = db();
    const c = d.conversations.find((x) => x.id === id);
    const seller = c && d.sellers.find((s) => s.id === c.seller_id);
    if (!c || !seller) return null;
    const p = c.product_id ? d.products.find((x) => x.id === c.product_id) : undefined;
    return clone({
      ...c,
      seller,
      product: p ? { id: p.id, name: p.name, photo_url: p.photo_url, price: p.price, listing: p.listing } : null,
    });
  }

  async findOrCreateConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string) {
    const d = db();
    const existing = d.conversations
      .filter((c) => c.product_id === productId && c.buyer_name === buyerName && c.buyer_language === buyerLanguage)
      .sort(byNewest)[0];
    if (existing) return existing.id;
    const c: Conversation = {
      id: randomUUID(),
      product_id: productId,
      seller_id: sellerId,
      buyer_name: buyerName,
      buyer_language: buyerLanguage,
      created_at: now(),
    };
    d.conversations.push(c);
    return c.id;
  }

  async getMessages(conversationId: string) {
    return clone(
      db()
        .messages.filter((m) => m.conversation_id === conversationId)
        .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
        .slice(-500)
    );
  }

  async insertMessage(row: NewMessage) {
    const m: Message = { ...row, id: randomUUID(), created_at: now() };
    db().messages.push(m);
    return clone(m);
  }

  async getConversationOrders(conversationId: string) {
    return clone(db().orders.filter((o) => o.conversation_id === conversationId).sort(byNewest));
  }

  async insertOrder(row: Pick<Order, "product_id" | "conversation_id" | "buyer_name" | "quantity">) {
    const o: Order = { ...row, id: randomUUID(), status: "placed", created_at: now(), updated_at: now() };
    db().orders.push(o);
    return clone(o);
  }

  async getOrder(id: string) {
    const d = db();
    const o = d.orders.find((x) => x.id === id);
    const p = o && d.products.find((x) => x.id === o.product_id);
    return o && p ? clone({ ...o, product: { id: p.id, name: p.name, listing: p.listing, seller_id: p.seller_id } }) : null;
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    const o = db().orders.find((x) => x.id === id);
    if (!o) throw new Error("Order not found");
    o.status = status;
    o.updated_at = now();
    return clone(o);
  }

  async listOpenOrders(sellerId: string): Promise<OpenOrder[]> {
    const d = db();
    return d.orders
      .map((o) => ({ o, p: d.products.find((p) => p.id === o.product_id) }))
      .filter(({ o, p }) => p?.seller_id === sellerId && o.status !== "delivered")
      .sort((a, b) => byNewest(a.o, b.o))
      .slice(0, 20)
      .map(({ o, p }) => ({
        id: o.id,
        buyer_name: o.buyer_name,
        status: o.status,
        created_at: o.created_at,
        quantity: o.quantity,
        product_name: p!.name,
      }));
  }

  async getDashboard(sellerId: string): Promise<DashboardData | null> {
    const d = db();
    const seller = d.sellers.find((s) => s.id === sellerId);
    if (!seller) return null;
    const products = d.products.filter((p) => p.seller_id === sellerId).sort(byNewest);
    const pById = new Map(d.products.map((p) => [p.id, p]));
    const convs = d.conversations
      .filter((c) => c.seller_id === sellerId)
      .sort(byNewest)
      .slice(0, 50)
      .map((c) => {
        const p = c.product_id ? pById.get(c.product_id) : undefined;
        return { ...c, product: p ? { id: p.id, name: p.name, photo_url: p.photo_url } : null };
      });
    const productIds = new Set(products.map((p) => p.id));
    const orders = d.orders
      .filter((o) => productIds.has(o.product_id))
      .sort(byNewest)
      .map((o) => {
        const p = pById.get(o.product_id)!;
        return { ...o, product: { id: p.id, name: p.name, photo_url: p.photo_url, price: p.price, listing: p.listing } };
      });
    const convIds = new Set(convs.map((c) => c.id));
    const msgs = d.messages.filter((m) => convIds.has(m.conversation_id)).sort(byNewest).slice(0, 300);
    return clone(assembleDashboard(seller, products, convs, orders, msgs));
  }

  async upload(bucket: string, path: string, data: Blob | Buffer, contentType: string) {
    const files = db().files;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
    const key = `${bucket}/${path}`;
    files.set(key, { data: buf, type: contentType });
    while (files.size > MAX_FILES) files.delete(files.keys().next().value as string);
    return `/api/files/${key}`;
  }

  async reset(): Promise<SeedResult> {
    g.__bolBazaarMemoryDb = fresh();
    const d = db();
    return { sellers: d.sellers.length, products: d.products.length, messages: d.messages.length, introAudio: 0 };
  }

  async check() {
    const d = db();
    return { db: `in-memory demo store · ${d.products.length} products`, storage: `in-memory · ${d.files.size} files` };
  }
}
