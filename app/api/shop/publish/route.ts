import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok, ttsSafe } from "@/lib/api";
import { getStore } from "@/lib/store";
import { normalizeLang, shortOf } from "@/lib/languages";
import { liveReadback, missingShopFields, ShopDraftSchema, writeShop } from "@/lib/shop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  sellerId: z.string().min(1),
  draft: ShopDraftSchema,
  transcript: z.string().nullable().optional(),
  language: z.string(),
});

/**
 * "Speak your shop online" — step 2: draft → storefront copy in en/hi/ta (+ seller language)
 * → saved → spoken read-back "Your shop is live. Share it on WhatsApp?".
 */
export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json());
    const store = getStore();
    const seller = await store.getSeller(b.sellerId);
    if (!seller) throw new ApiError(404, "not_found", "Seller not found");
    const lang = normalizeLang(b.language || seller.language);
    // Fail fast (before any AI work) if the database predates migration 0002.
    if (!(await store.supportsShops()))
      throw new ApiError(503, "migration_needed", "run supabase/migrations/0002_shop_profile.sql in the Supabase SQL Editor");

    const shop = await writeShop(b.draft, lang, seller.gender, b.transcript ?? null);
    try {
      await store.saveShop(seller.id, shop);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("MIGRATION_NEEDED")) throw new ApiError(503, "migration_needed", msg.replace("MIGRATION_NEEDED: ", ""));
      throw e;
    }

    const name = shop.i18n[shortOf(lang)]?.shop_name ?? shop.i18n.en.shop_name;
    const readback = await liveReadback(lang, name);
    const audio = await ttsSafe(readback, lang, seller.gender);
    return ok({
      shop,
      path: `/shop/${seller.id}`,
      readback,
      audio: audio?.base64 ?? null,
      mime: audio?.mime ?? null,
      missing: missingShopFields(b.draft),
    });
  } catch (e) {
    return fail(e);
  }
}
