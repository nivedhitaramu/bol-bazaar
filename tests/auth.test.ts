/** Prototype seller login — run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyAuth,
  hashKey,
  hashPin,
  LOCK_MS,
  lockState,
  newSellerKey,
  parsePinDigits,
  registerFailure,
  registerSuccess,
  signSession,
  verifyPin,
  verifySession,
} from "../lib/authCore";

test("PIN: only a salted hash is stored, and it verifies", () => {
  const h = hashPin("4821");
  assert.ok(!h.includes("4821"), "the PIN itself is never stored");
  assert.notEqual(hashPin("4821"), h, "salted: same PIN → different hash");
  assert.equal(verifyPin("4821", h), true);
  assert.equal(verifyPin("4822", h), false);
  assert.equal(verifyPin("48211", h), false);
  assert.equal(verifyPin("4821", null), false);
});

test("private link key: random, long, only its SHA-256 is stored", () => {
  const k = newSellerKey();
  assert.ok(k.length >= 24 && /^[A-Za-z0-9_-]+$/.test(k), k);
  assert.notEqual(newSellerKey(), k);
  assert.equal(hashKey(k), hashKey(` ${k} `), "whitespace-tolerant");
  assert.equal(hashKey(k).length, 64);
});

test("lockout: 5 wrong PINs → locked 5 minutes → unlocks", () => {
  const t0 = 1_000_000;
  let r = emptyAuth("s1");
  for (let i = 0; i < 4; i++) r = registerFailure(r, t0);
  assert.equal(r.failed, 4);
  assert.equal(lockState(r, t0).locked, false);
  r = registerFailure(r, t0);
  assert.equal(lockState(r, t0).locked, true);
  assert.equal(lockState(r, t0).retryInMs, LOCK_MS);
  assert.equal(lockState(r, t0 + LOCK_MS - 1).locked, true);
  assert.equal(lockState(r, t0 + LOCK_MS + 1).locked, false);
  assert.equal(registerSuccess(r).failed, 0);
});

test("session token: genuine, tamper-proof, expires", () => {
  const tok = signSession("seller-123", "secret", 0);
  assert.equal(verifySession(tok, "secret", 1000), "seller-123");
  assert.equal(verifySession(tok, "other-secret", 1000), null, "wrong secret");
  assert.equal(verifySession(tok.replace("seller-123", "seller-999"), "secret", 1000), null, "edited seller id");
  assert.equal(verifySession(tok, "secret", 31 * 24 * 3600_000), null, "expired after 30 days");
  assert.equal(verifySession("garbage", "secret"), null);
});

test("spoken PIN in any language → 4 digits", () => {
  assert.equal(parsePinDigits("one two three four"), "1234");
  assert.equal(parsePinDigits("एक दो तीन चार"), "1234");
  assert.equal(parsePinDigits("ஒன்று இரண்டு மூன்று நான்கு"), "1234");
  assert.equal(parsePinDigits("4 8 2 1."), "4821");
  assert.equal(parsePinDigits("zero nine eight seven"), "0987");
  assert.equal(parsePinDigits("१२३४"), "1234");
  assert.equal(parsePinDigits("one two three"), null, "needs exactly 4");
  assert.equal(parsePinDigits("hello"), null);
});
