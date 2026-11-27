"use client";
import { useCallback, useEffect, useState } from "react";

/** Lightweight buyer identity (no login): name + language, a signed token, and the "Save my chats" key. */
export type LocalBuyer = { id: string; name: string; language: string; token: string; key?: string };
const KEY = "bb_buyer";
const LEGACY_NAME = "bb_buyer_name";

export function readBuyer(): LocalBuyer | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as LocalBuyer) : null;
  } catch {
    return null;
  }
}

export function saveBuyer(b: LocalBuyer | null) {
  try {
    if (b) {
      localStorage.setItem(KEY, JSON.stringify(b));
      localStorage.setItem(LEGACY_NAME, b.name);
    } else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("bb:buyer"));
}

export function useBuyer() {
  const [buyer, setState] = useState<LocalBuyer | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setState(readBuyer());
    sync();
    setReady(true);
    window.addEventListener("bb:buyer", sync);
    return () => window.removeEventListener("bb:buyer", sync);
  }, []);
  const setBuyer = useCallback((b: LocalBuyer | null) => saveBuyer(b), []);
  return { buyer, ready, setBuyer };
}

/** Get the buyer identity, creating it once (name + language) if this device doesn't have one. */
export async function ensureBuyer(name: string, language: string): Promise<LocalBuyer> {
  const existing = readBuyer();
  if (existing && existing.token) return existing;
  const r = await fetch("/api/buyer/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, language }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.code ?? "register_failed");
  const j = (await r.json()) as { buyer: Omit<LocalBuyer, "token">; token: string };
  const b = { ...j.buyer, token: j.token };
  saveBuyer(b);
  return b;
}
