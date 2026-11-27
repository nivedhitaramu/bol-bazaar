import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { hashKey, newSellerKey } from "@/lib/authCore";
import { signBuyerSession, verifyBuyerSession } from "@/lib/authServer";
import { normalizeLang } from "@/lib/languages";
import type { Buyer } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Lightweight buyer identity — no login, no PIN (prototype).
 *   POST /api/buyer/register { name, language }   → { buyer, token }
 *   POST /api/buyer/link     { token }            → { key }   "Save my chats" link (new key; old link stops working)
 *   POST /api/buyer/key      { key }              → { buyer, token }  open the link on any device
 *   POST /api/buyer/me       { token }            → { buyer, conversations, orders }
 */
const publicBuyer = (b: Buyer) => ({ id: b.id, name: b.name, language: b.language });

function storeError(e: unknown): never {
  const msg = (e as Error)?.message ?? "";
  if (msg.startsWith("MIGRATION_NEEDED")) throw new ApiError(503, "migration_needed", msg.replace("MIGRATION_NEEDED: ", ""));
  throw e;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    const store = getStore();
    const body = await req.json().catch(() => ({}));

    if (action === "register") {
      const b = z.object({ name: z.string().trim().min(1).max(60), language: z.string() }).parse(body);
      const buyer = await store.createBuyer(b.name, normalizeLang(b.language)).catch(storeError);
      return ok({ buyer: publicBuyer(buyer), token: signBuyerSession(buyer.id) });
    }

    if (action === "link") {
      const b = z.object({ token: z.string() }).parse(body);
      const buyerId = verifyBuyerSession(b.token);
      if (!buyerId) throw new ApiError(401, "not_identified", "Unknown buyer");
      const key = newSellerKey();
      await store.setBuyerKeyHash(buyerId, hashKey(key)).catch(storeError);
      return ok({ key });
    }

    if (action === "key") {
      const b = z.object({ key: z.string().min(10) }).parse(body);
      const buyer = await store.findBuyerByKeyHash(hashKey(b.key)).catch(storeError);
      if (!buyer) throw new ApiError(404, "bad_link", "This link is not valid any more");
      return ok({ buyer: publicBuyer(buyer), token: signBuyerSession(buyer.id) });
    }

    if (action === "me") {
      const b = z.object({ token: z.string() }).parse(body);
      const buyerId = verifyBuyerSession(b.token);
      if (!buyerId) throw new ApiError(401, "not_identified", "Unknown buyer");
      const buyer = await store.getBuyer(buyerId).catch(storeError);
      if (!buyer) throw new ApiError(404, "not_found", "Buyer not found");
      const activity = await store.getBuyerActivity(buyerId).catch(storeError);
      return ok({ buyer: publicBuyer(buyer), ...activity });
    }

    throw new ApiError(404, "not_found", "Unknown action");
  } catch (e) {
    return fail(e);
  }
}
