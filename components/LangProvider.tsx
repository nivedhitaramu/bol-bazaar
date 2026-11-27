"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type LangCode, LANG_COOKIE, normalizeLang } from "@/lib/languages";
import { type I18nKey, translator } from "@/lib/i18n";

/**
 * The APP (UI) language — what every screen's labels are written in. Controlled by the header picker.
 * Distinct from a seller's SPEAKING language (see SpeakLangPicker), which drives speech recognition,
 * read-back voice and which language her listings are written in.
 */
type Ctx = {
  lang: LangCode;
  /** User picked this language for the app (header / landing / onboarding). */
  setLang: (l: LangCode) => void;
  /** Suggest a language (e.g. the seller's own) unless the user has explicitly chosen one. */
  suggestLang: (l: LangCode) => void;
  explicit: boolean;
  t: (k: I18nKey) => string;
};
const LangCtx = createContext<Ctx | null>(null);

const LS_KEY = "bb_lang";
const LS_EXPLICIT = "bb_lang_explicit";

function writeCookie(l: LangCode) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

export function LangProvider({ initial, children }: { initial: LangCode; children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initial);
  const [explicit, setExplicit] = useState(false);
  const router = useRouter();

  // localStorage is the source of truth; keep the cookie in sync for server components.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LS_KEY);
      setExplicit(localStorage.getItem(LS_EXPLICIT) === "1");
    } catch {}
    if (stored) {
      const l = normalizeLang(stored, initial);
      if (l !== initial) {
        setLangState(l);
        writeCookie(l);
        router.refresh();
      }
    } else {
      try {
        localStorage.setItem(LS_KEY, initial);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang.split("-")[0];
  }, [lang]);

  const apply = useCallback(
    (l: LangCode, markExplicit: boolean) => {
      setLangState(l);
      try {
        localStorage.setItem(LS_KEY, l);
        if (markExplicit) localStorage.setItem(LS_EXPLICIT, "1");
      } catch {}
      if (markExplicit) setExplicit(true);
      writeCookie(l);
      router.refresh();
    },
    [router]
  );

  const setLang = useCallback((l: LangCode) => apply(l, true), [apply]);

  const suggestLang = useCallback(
    (l: LangCode) => {
      let isExplicit = explicit;
      try {
        isExplicit = localStorage.getItem(LS_EXPLICIT) === "1";
      } catch {}
      if (!isExplicit && l !== lang) apply(l, false);
    },
    [apply, explicit, lang]
  );

  const value = useMemo(() => ({ lang, setLang, suggestLang, explicit, t: translator(lang) }), [lang, setLang, suggestLang, explicit]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): Ctx {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useLang must be used inside LangProvider");
  return c;
}
