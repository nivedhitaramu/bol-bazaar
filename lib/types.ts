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
  created_at: string;
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
