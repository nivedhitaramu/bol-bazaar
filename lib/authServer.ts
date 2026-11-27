import "server-only";
import { createHash, randomBytes } from "crypto";
import { readEnv, supabaseSecretKey } from "./env";
import { signSession, verifySession } from "./authCore";

const g = globalThis as unknown as { __bbSessionSecret?: string };

/** AUTH_SECRET, else derived from the Supabase secret key, else random per process (keyless demo). */
export function sessionSecret(): string {
  const explicit = readEnv("AUTH_SECRET");
  if (explicit) return explicit;
  const sb = supabaseSecretKey();
  if (sb) return createHash("sha256").update(`${sb}:bol-bazaar-session`).digest("hex");
  return (g.__bbSessionSecret ??= randomBytes(32).toString("hex"));
}

// Buyer sessions share the signing scheme; the "buyer:" prefix keeps them from ever passing as a seller's.
export const signBuyerSession = (buyerId: string) => signSession(`buyer:${buyerId}`, sessionSecret());
export function verifyBuyerSession(token: string | null | undefined): string | null {
  const v = verifySession(token, sessionSecret());
  return v?.startsWith("buyer:") ? v.slice("buyer:".length) : null;
}
