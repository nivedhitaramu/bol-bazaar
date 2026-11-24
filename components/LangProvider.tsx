"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type LangCode, LANG_COOKIE, normalizeLang } from "@/lib/languages";
import { type I18nKey, translator } from "@/lib/i18n";

type Ctx = { lang: LangCode; setLang: (l: LangCode) => void; t: (k: I18nKey) => string };
const LangCtx = createContext<Ctx | null>(null);

const LS_KEY = "bb_lang";

function writeCookie(l: LangCode) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

export function LangProvider({ initial, children }: { initial: LangCode; children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initial);
  const router = useRouter();

  // localStorage is the source of truth; keep the cookie in sync for server components.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LS_KEY);
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

  const setLang = useCallback(
    (l: LangCode) => {
      setLangState(l);
      try {
        localStorage.setItem(LS_KEY, l);
      } catch {}
      writeCookie(l);
      router.refresh();
    },
    [router]
  );

  const value = useMemo(() => ({ lang, setLang, t: translator(lang) }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): Ctx {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useLang must be used inside LangProvider");
  return c;
}
