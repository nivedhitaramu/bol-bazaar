import type { Conversation, Listing, Message, Order, OrderStatus, Product, Seller, ShopProfile } from "../types";
import type { SeedResult, SeedTts } from "../seed";

export type ProductWithSeller = Product & { seller: Pick<Seller, "id" | "name" | "city" | "state" | "language"> };

export type ConversationFull = Conversation & {
  seller: Seller;
  product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> | null;
};

export type OrderWithProduct = Order & { product: Pick<Product, "id" | "name" | "listing" | "seller_id"> };

export type OpenOrder = Pick<Order, "id" | "buyer_name" | "status" | "created_at" | "quantity"> & { product_name: string };

export type DashboardData = {
  seller: Seller;
  products: Product[];
  conversations: Array<
    Conversation & { product: Pick<Product, "id" | "name" | "photo_url"> | null; last: Message | null; buyerTimes: string[] }
  >;
  orders: Array<Order & { product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> }>;
};

export type NewSeller = Omit<Seller, "id" | "created_at">;
export type ProductInput = Omit<Product, "id" | "created_at">;
export type NewMessage = Omit<Message, "id" | "created_at">;

/**
 * Everything the app needs from persistence. Two implementations:
 *  - SupabaseStore (Postgres + Storage + Realtime) when keys are set
 *  - MemoryStore (seeded, in-process) for keyless demo mode / Docker
 */
export interface Store {
  readonly mode: "supabase" | "memory";

  getSeller(id: string): Promise<Seller | null>;
  insertSeller(row: NewSeller): Promise<Seller>;
  /** Save the "Speak your shop online" profile. */
  saveShop(sellerId: string, shop: ShopProfile): Promise<Seller>;
  /** False when the database predates migration 0002 (no sellers.shop column). */
  supportsShops(): Promise<boolean>;
  /** The language the seller SPEAKS (chat translation, STT, read-back). */
  updateSellerLanguage(sellerId: string, language: string): Promise<Seller>;

  getProduct(id: string): Promise<(Product & { seller: Seller }) | null>;
  listPublished(filters?: { category?: string; state?: string; sellerId?: string }): Promise<ProductWithSeller[]>;
  listFacets(): Promise<{ categories: string[]; states: string[] }>;
  /** Insert (no productId) or update a product owned by row.seller_id. Returns its id. */
  saveProduct(row: ProductInput, productId?: string): Promise<string>;
  setProductStatus(id: string, sellerId: string, status: Product["status"]): Promise<void>;
  setProductListing(id: string, listing: Listing): Promise<void>;

  getConversation(id: string): Promise<ConversationFull | null>;
  findOrCreateConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string): Promise<string>;
  getMessages(conversationId: string): Promise<Message[]>;
  insertMessage(row: NewMessage): Promise<Message>;
  getMessage(id: string): Promise<Message | null>;
  /** Fill in a translation that failed earlier ("translation pending" → retried). */
  updateMessage(id: string, patch: Partial<Pick<Message, "translated_text" | "audio_url">>): Promise<Message>;
  /** "illa, thappu" — the sender takes back their last message. */
  deleteMessage(id: string): Promise<void>;

  getConversationOrders(conversationId: string): Promise<Order[]>;
  insertOrder(row: Pick<Order, "product_id" | "conversation_id" | "buyer_name" | "quantity">): Promise<Order>;
  getOrder(id: string): Promise<OrderWithProduct | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;
  listOpenOrders(sellerId: string): Promise<OpenOrder[]>;

  getDashboard(sellerId: string): Promise<DashboardData | null>;

  /** Store a public file and return its URL. */
  upload(bucket: string, path: string, data: Blob | Buffer, contentType: string): Promise<string>;

  /** Re-create the demo data. */
  reset(opts?: { tts?: SeedTts; log?: (s: string) => void }): Promise<SeedResult>;

  /** For /api/health. */
  check(): Promise<{ db: string; storage: string }>;
}
