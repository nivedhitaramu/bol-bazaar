import { NextRequest } from "next/server";
import { ApiError, fail, ok, ttsSafe, voiceInput } from "@/lib/api";
import { getSeller } from "@/lib/data";
import { normalizeLang } from "@/lib/languages";
import { askShop } from "@/lib/ask";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * "Ask your shop" — spoken daily summary for sellers who can't read.
 * multipart: sellerId, language (her speaking language), audio | text
 * → { question, intent, answer, audio }
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sellerId = String(form.get("sellerId") || "");
    if (!sellerId) throw new ApiError(400, "no_seller", "sellerId required");
    const seller = await getSeller(sellerId);
    if (!seller) throw new ApiError(404, "not_found", "Seller not found");
    const lang = normalizeLang(form.get("language") || seller.language);

    const { transcript } = await voiceInput(form, lang);
    const r = await askShop(sellerId, transcript, lang);
    const audio = await ttsSafe(r.answer, r.lang, seller.gender);
    return ok({
      question: transcript,
      intent: r.intent,
      person: r.person,
      source: r.source,
      answer: r.answer,
      lang: r.lang,
      audio: audio?.base64 ?? null,
      mime: audio?.mime ?? null,
    });
  } catch (e) {
    return fail(e);
  }
}
