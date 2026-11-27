import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { sessionSecret } from "@/lib/authServer";
import { DEMO } from "@/lib/demoIds";
import {
  emptyAuth,
  hashKey,
  hashPin,
  isValidPin,
  lockState,
  MAX_TRIES,
  newSellerKey,
  registerFailure,
  registerSuccess,
  signSession,
  verifyPin,
  verifySession,
} from "@/lib/authCore";
import type { Seller } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * PROTOTYPE seller login (no SMS / OTP — not production auth).
 *   POST /api/auth/setup   { sellerId, token? }        → { key, token }  private link key (claim once, or rotate with a valid session)
 *   POST /api/auth/pin     { sellerId, token, pin }    → { ok }          set the 4-digit PIN (hash only)
 *   POST /api/auth/key     { key }                     → { seller, token } open the private link
 *   GET  /api/auth/sellers                             → shops that can log in with a PIN
 *   POST /api/auth/login   { sellerId, pin }           → { seller, token } 5 wrong tries → locked 5 min
 */

const DEMO_IDS = new Set<string>([DEMO.meenaId, DEMO.rameshId]);
const publicSeller = (s: Seller) => ({ id: s.id, name: s.name, language: s.language, gender: s.gender, city: s.city });

function storeError(e: unknown): never {
  const msg = (e as Error)?.message ?? "";
  if (msg.startsWith("MIGRATION_NEEDED")) throw new ApiError(503, "migration_needed", msg.replace("MIGRATION_NEEDED: ", ""));
  throw e;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    if (action !== "sellers") throw new ApiError(404, "not_found", "Unknown action");
    const rows = await getStore().listLoginSellers().catch(storeError);
    return ok({
      sellers: rows.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        shopNames: s.shop?.i18n ? [...new Set(Object.values(s.shop.i18n).map((x) => x.shop_name))] : [],
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    const store = getStore();
    const body = await req.json().catch(() => ({}));
    const secret = sessionSecret();

    if (action === "setup") {
      const b = z.object({ sellerId: z.string().min(1), token: z.string().optional() }).parse(body);
      if (DEMO_IDS.has(b.sellerId)) throw new ApiError(403, "demo_seller", "Demo sellers use the one-tap button, no login");
      const seller = await store.getSeller(b.sellerId);
      if (!seller) throw new ApiError(404, "not_found", "Seller not found");
      const rec = (await store.getAuth(b.sellerId).catch(storeError)) ?? emptyAuth(b.sellerId);
      // First claim is open (right after onboarding); after that, only the logged-in seller can rotate it.
      if (rec.key_hash && verifySession(b.token, secret) !== b.sellerId)
        throw new ApiError(403, "already_claimed", "This shop already has a private link — log in to change it");
      const key = newSellerKey();
      await store.saveAuth({ ...rec, key_hash: hashKey(key) }).catch(storeError);
      return ok({ key, token: signSession(b.sellerId, secret), hasPin: Boolean(rec.pin_hash) });
    }

    if (action === "pin") {
      const b = z.object({ sellerId: z.string().min(1), token: z.string(), pin: z.string() }).parse(body);
      if (verifySession(b.token, secret) !== b.sellerId) throw new ApiError(401, "not_logged_in", "Log in first");
      if (!isValidPin(b.pin)) throw new ApiError(400, "bad_pin", "PIN must be 4 digits");
      const rec = (await store.getAuth(b.sellerId).catch(storeError)) ?? emptyAuth(b.sellerId);
      await store.saveAuth({ ...registerSuccess(rec), pin_hash: hashPin(b.pin) }).catch(storeError);
      return ok({ ok: true });
    }

    if (action === "key") {
      const b = z.object({ key: z.string().min(10) }).parse(body);
      const rec = await store.findAuthByKeyHash(hashKey(b.key)).catch(storeError);
      const seller = rec && (await store.getSeller(rec.seller_id));
      if (!seller) throw new ApiError(404, "bad_link", "This link is not valid any more");
      return ok({ seller: publicSeller(seller), token: signSession(seller.id, secret), hasPin: Boolean(rec.pin_hash) });
    }

    if (action === "login") {
      const b = z.object({ sellerId: z.string().min(1), pin: z.string() }).parse(body);
      const rec = await store.getAuth(b.sellerId).catch(storeError);
      if (!rec?.pin_hash) throw new ApiError(404, "no_pin", "This shop has no PIN yet");
      const lock = lockState(rec);
      if (lock.locked) return ok({ error: "locked", code: "locked", retryInMs: lock.retryInMs }, { status: 423 });
      if (!verifyPin(b.pin, rec.pin_hash)) {
        const next = registerFailure(rec);
        await store.saveAuth(next).catch(storeError);
        const nowLocked = lockState(next);
        if (nowLocked.locked) return ok({ error: "locked", code: "locked", retryInMs: nowLocked.retryInMs }, { status: 423 });
        return ok({ error: "wrong_pin", code: "wrong_pin", triesLeft: MAX_TRIES - next.failed }, { status: 401 });
      }
      await store.saveAuth(registerSuccess(rec)).catch(storeError);
      const seller = await store.getSeller(b.sellerId);
      if (!seller) throw new ApiError(404, "not_found", "Seller not found");
      return ok({ seller: publicSeller(seller), token: signSession(seller.id, secret) });
    }

    throw new ApiError(404, "not_found", "Unknown action");
  } catch (e) {
    return fail(e);
  }
}
