/**
 * Seller login — PROTOTYPE-LEVEL (no SMS/OTP). Pure helpers, unit-tested in tests/auth.test.ts.
 *  - private seller link: high-entropy random key; only its SHA-256 is stored
 *  - 4-digit PIN: scrypt with a per-seller salt; only the hash is stored
 *  - lockout: 5 wrong PINs → locked for 5 minutes
 *  - session: stateless HMAC-signed token "sellerId.expiry.signature"
 * Never import this from client code (uses node:crypto).
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { normalizeDigits, parseAmount } from "./numbers";

export const MAX_TRIES = 5;
export const LOCK_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 3600_000;

export type AuthRecord = {
  seller_id: string;
  key_hash: string | null;
  pin_hash: string | null;
  failed: number;
  locked_until: string | null;
};

export const emptyAuth = (sellerId: string): AuthRecord => ({ seller_id: sellerId, key_hash: null, pin_hash: null, failed: 0, locked_until: null });

// ── private link key ──
export function newSellerKey(): string {
  return randomBytes(18).toString("base64url"); // 24 chars, 144 bits
}
export function hashKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

// ── PIN ──
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
export function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored || !isValidPin(pin)) return false;
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const want = Buffer.from(hex, "hex");
  const got = scryptSync(pin, salt, 32);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── lockout ──
export function lockState(rec: AuthRecord, now = Date.now()): { locked: boolean; retryInMs: number } {
  const until = rec.locked_until ? new Date(rec.locked_until).getTime() : 0;
  return until > now ? { locked: true, retryInMs: until - now } : { locked: false, retryInMs: 0 };
}
/** One more wrong PIN; the 5th locks the account for 5 minutes (and resets the counter). */
export function registerFailure(rec: AuthRecord, now = Date.now()): AuthRecord {
  const failed = rec.failed + 1;
  if (failed >= MAX_TRIES) return { ...rec, failed: 0, locked_until: new Date(now + LOCK_MS).toISOString() };
  return { ...rec, failed };
}
export function registerSuccess(rec: AuthRecord): AuthRecord {
  return { ...rec, failed: 0, locked_until: null };
}

// ── session ──
export function signSession(sellerId: string, secret: string, now = Date.now()): string {
  const payload = `${sellerId}.${now + SESSION_TTL_MS}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
/** Returns the seller id if the token is genuine and unexpired. */
export function verifySession(token: string | null | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const j = payload.lastIndexOf(".");
  const exp = Number(payload.slice(j + 1));
  if (!Number.isFinite(exp) || exp < now) return null;
  return payload.slice(0, j);
}

// ── spoken PIN ──
const ZERO = new Set(["zero", "oh", "o", "शून्य", "सुन्ना", "ஜீரோ", "பூஜ்யம்", "சுழியம்", "பூஜ்ஜியம்"]);

/**
 * "one two three four" · "एक दो तीन चार" · "ஒன்று இரண்டு மூன்று நான்கு" · "1 2 3 4" · "1234" → "1234".
 * Each spoken word is one digit (we never read "twelve" as 1-2). Returns null unless exactly 4 digits.
 */
export function parsePinDigits(text: string): string | null {
  const tokens = normalizeDigits(text)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) out += t;
    else if (ZERO.has(t)) out += "0";
    else {
      const v = parseAmount(t);
      if (v != null && v >= 0 && v <= 9) out += String(v);
    }
  }
  return /^\d{4}$/.test(out) ? out : null;
}
