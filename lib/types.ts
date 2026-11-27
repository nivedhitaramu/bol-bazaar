export type ListingText = { title: string; description: string; tags: string[] };
/** Keyed by short language code: en, hi, ta, ... */
export type Listing = Record<string, ListingText>;

export type Seller = {
  id: string;
  name: string;
  language: string;
  city: string | null;
  state: string | null;
  craft: string | null;
  gender: "female" | "male";
  voice_intro_url: string | null;
  voice_intro_transcript: string | null;
  /** "Speak your shop online" profile (migration 0002). null/absent = not set up yet. */
  shop?: ShopProfile | null;
  created_at: string;
};

/** Storefront copy in one language. */
export type ShopText = {
  shop_name: string;
  tagline: string;
  story: string;
  craft: string;
  specialties: string[];
  price_text: string | null;
  years_text: string | null;
};

/** What the seller SAID about her shop (null = not said). */
export type ShopDraft = {
  shop_name: string | null;
  owner_name: string | null;
  city: string | null;
  craft: string | null;
  years_of_experience: number | null;
  story: string | null;
  specialties: string[] | null;
  price_range: { min: number | null; max: number | null } | null;
  phone: string | null;
};

export type ShopProfile = ShopDraft & {
  transcript: string | null;
  language: string;
  /** Storefront text per short language code (en, hi, ta, + seller's language). */
  i18n: Record<string, ShopText>;
  updated_at: string;
};

export type Product = {
  id: string;
  seller_id: string;
  name: string;
  category: string | null;
  material: string | null;
  craft_story: string | null;
  price: number | null;
  quantity: number | null;
  size_options: string[];
  photo_url: string | null;
  listing: Listing;
  status: "draft" | "published";
  created_at: string;
};

export type Conversation = {
  id: string;
  product_id: string | null;
  seller_id: string;
  buyer_name: string;
  buyer_language: string;
  /** Set when the buyer has a lightweight identity (migration 0004). */
  buyer_id?: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender: "buyer" | "seller";
  original_text: string;
  original_language: string;
  translated_text: string | null;
  translated_language: string | null;
  audio_url: string | null;
  created_at: string;
};

export type OrderStatus = "placed" | "confirmed" | "shipped" | "delivered";
export const ORDER_STATUSES: OrderStatus[] = ["placed", "confirmed", "shipped", "delivered"];

export type Order = {
  id: string;
  product_id: string;
  conversation_id: string | null;
  buyer_name: string;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
};

/** Fields extracted from speech. null = not said. */
export type ProductDraft = {
  product_name: string | null;
  category: string | null;
  material: string | null;
  craft_story: string | null;
  price: number | null;
  quantity: number | null;
  size_options: string[] | null;
};

export function listingFor(listing: Listing | null | undefined, langShort: string): ListingText | null {
  if (!listing) return null;
  return listing[langShort] ?? listing.en ?? Object.values(listing)[0] ?? null;
}

export function formatINR(n: number | null | undefined): string {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

/** Lightweight buyer identity — name + language; "Save my chats" link (hash only). */
export type Buyer = { id: string; name: string; language: string; key_hash: string | null; created_at: string };

export type BuyerActivity = {
  conversations: Array<
    Conversation & {
      seller: Pick<Seller, "id" | "name" | "city">;
      product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> | null;
      last: Message | null;
    }
  >;
  orders: Array<Order & { product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> }>;
};
