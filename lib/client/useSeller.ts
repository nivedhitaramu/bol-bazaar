"use client";
import { useCallback, useEffect, useState } from "react";

export type LocalSeller = {
  id: string;
  name: string;
  language: string;
  gender: "female" | "male";
  city?: string | null;
  /** Signed session from /api/auth (prototype login). Demo sellers have none. */
  token?: string;
  /** The private link key — only kept on the device that created or opened it. */
  key?: string;
};
const KEY = "bb_seller";

export function readSeller(): LocalSeller | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as LocalSeller) : null;
  } catch {
    return null;
  }
}

/** No auth for the hackathon: the seller's id lives in localStorage on their phone. */
export function useSeller() {
  const [seller, setSellerState] = useState<LocalSeller | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSellerState(readSeller());
    setReady(true);
  }, []);

  const setSeller = useCallback((s: LocalSeller | null) => {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {}
    setSellerState(s);
  }, []);

  return { seller, ready, setSeller };
}

const BUYER_KEY = "bb_buyer_name";
export function readBuyerName(): string {
  try {
    return localStorage.getItem(BUYER_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveBuyerName(n: string) {
  try {
    localStorage.setItem(BUYER_KEY, n);
  } catch {}
}
