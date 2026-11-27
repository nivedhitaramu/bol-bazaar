import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { normalizeLang } from "@/lib/languages";
import { ensureConversation } from "@/lib/chat";
import { verifyBuyerSession } from "@/lib/authServer";

const Body = z.object({
  productId: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(60),
  buyerLanguage: z.string(),
  buyerToken: z.string().optional(),
});

/** Find-or-create the conversation for (product, buyer name, buyer language). */
export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json());
    const lang = normalizeLang(b.buyerLanguage);
    const product = await getStore().getProduct(b.productId);
    if (!product) throw new ApiError(404, "not_found", "Product not found");

    const id = await ensureConversation(product.id, product.seller_id, b.buyerName, lang);

    // Lightweight buyer identity: remember this conversation for "My chats & orders".
    const buyerId = verifyBuyerSession(b.buyerToken);
    if (buyerId) await getStore().attachBuyer(id, buyerId).catch((e) => console.warn("attachBuyer:", (e as Error).message));
    return ok({ id });
  } catch (e) {
    return fail(e);
  }
}
