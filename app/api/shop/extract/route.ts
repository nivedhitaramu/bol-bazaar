import { NextRequest } from "next/server";
import { ApiError, fail, ok, voiceInputLong } from "@/lib/api";
import { getSeller } from "@/lib/data";
import { normalizeLang } from "@/lib/languages";
import { extractShop, missingShopFields, withProfileDefaults } from "@/lib/shop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Speak your shop online" — step 1: up to 60 s of speech (or text) → structured shop draft.
 * multipart: sellerId, language, audio | text
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sellerId = String(form.get("sellerId") || "");
    if (!sellerId) throw new ApiError(400, "no_seller", "sellerId required");
    const lang = normalizeLang(form.get("language"));
    const [input, seller] = await Promise.all([voiceInputLong(form, lang), getSeller(sellerId)]);
    if (!seller) throw new ApiError(404, "not_found", "Seller not found");

    const { draft, source } = await extractShop(input.transcript, lang);
    const merged = withProfileDefaults(draft, seller);
    return ok({
      transcript: input.transcript,
      draft: merged,
      /** Not said AND not known from onboarding → highlighted yellow, fill by voice. */
      missing: missingShopFields(merged),
      /** Filled from onboarding rather than speech (shown differently). */
      fromProfile: (["owner_name", "city", "craft"] as const).filter((k) => draft[k] == null && merged[k] != null),
      source,
    });
  } catch (e) {
    return fail(e);
  }
}
