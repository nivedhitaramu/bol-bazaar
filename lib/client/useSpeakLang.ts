"use client";
import { useCallback } from "react";
import { normalizeLang, type LangCode } from "@/lib/languages";
import type { LocalSeller } from "./useSeller";

/** The seller's SPEAKING language + a setter that also saves it to her profile. */
export function useSpeakLang(seller: LocalSeller, setSeller: (s: LocalSeller | null) => void) {
  const speakLang = normalizeLang(seller.language);
  const setSpeakLang = useCallback(
    (l: LangCode) => {
      setSeller({ ...seller, language: l });
      fetch(`/api/sellers/${seller.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    },
    [seller, setSeller]
  );
  return { speakLang, setSpeakLang };
}
