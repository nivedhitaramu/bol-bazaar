import "server-only";
import { getAdminSupabase } from "./supabase/server";
import { ApiError, rid, translateSafe, ttsSafe, uploadPublic } from "./api";
import type { Conversation, Message, Seller } from "./types";

export type ConvCtx = Conversation & { seller: Seller };

export async function loadConversation(id: string): Promise<ConvCtx> {
  const { data, error } = await getAdminSupabase().from("conversations").select("*, seller:sellers(*)").eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, "db_error", error.message);
  if (!data) throw new ApiError(404, "not_found", "Conversation not found");
  return data as ConvCtx;
}

export function sideLanguages(conv: ConvCtx, sender: "buyer" | "seller") {
  const buyer = conv.buyer_language;
  const seller = conv.seller.language;
  return sender === "buyer" ? { from: buyer, to: seller } : { from: seller, to: buyer };
}

/** Voice used when the RECEIVER hears this sender. */
function voiceFor(conv: ConvCtx, sender: "buyer" | "seller") {
  if (sender === "seller") return { gender: conv.seller.gender ?? "female", role: "seller" as const };
  return { gender: "female" as const, role: "buyer" as const };
}

export type Timings = { stt_ms?: number; translate_ms: number; tts_ms: number; store_ms: number; total_ms?: number };

/**
 * Translate → TTS (receiver's language) → store audio → insert message.
 * Inserting triggers Supabase Realtime on the other device, which auto-plays audio_url.
 */
export async function postMessage(opts: {
  conv: ConvCtx;
  sender: "buyer" | "seller";
  text: string;
  translated?: string; // pre-translated (templates)
}): Promise<{ message: Message; timings: Timings; translatedOk: boolean; ttsOk: boolean }> {
  const { conv, sender, text } = opts;
  const { from, to } = sideLanguages(conv, sender);

  let t0 = Date.now();
  const tr = opts.translated != null ? { text: opts.translated, ok: true } : await translateSafe(text, from, to, "formal");
  const translate_ms = Date.now() - t0;

  t0 = Date.now();
  const v = voiceFor(conv, sender);
  const audio = await ttsSafe(tr.text, to, v.gender, v.role);
  const tts_ms = Date.now() - t0;

  t0 = Date.now();
  let audio_url: string | null = null;
  if (audio) {
    try {
      audio_url = await uploadPublic("chat-audio", `${conv.id}/${rid()}.mp3`, Buffer.from(audio.base64, "base64"), audio.mime);
    } catch (e) {
      console.warn("chat audio upload failed:", (e as Error).message);
    }
  }
  const { data, error } = await getAdminSupabase()
    .from("messages")
    .insert({
      conversation_id: conv.id,
      sender,
      original_text: text,
      original_language: from,
      translated_text: tr.text,
      translated_language: to,
      audio_url,
    })
    .select("*")
    .single();
  if (error) throw new ApiError(500, "db_error", error.message);
  const store_ms = Date.now() - t0;

  return { message: data as Message, timings: { translate_ms, tts_ms, store_ms }, translatedOk: tr.ok, ttsOk: Boolean(audio) };
}

/** Find-or-create a conversation for (product, buyer name, buyer language). */
export async function ensureConversation(productId: string, sellerId: string, buyerName: string, buyerLanguage: string) {
  const sb = getAdminSupabase();
  const { data: existing } = await sb
    .from("conversations")
    .select("id")
    .eq("product_id", productId)
    .eq("buyer_name", buyerName)
    .eq("buyer_language", buyerLanguage)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await sb
    .from("conversations")
    .insert({ product_id: productId, seller_id: sellerId, buyer_name: buyerName, buyer_language: buyerLanguage })
    .select("id")
    .single();
  if (error) throw new ApiError(500, "db_error", error.message);
  return data.id as string;
}
