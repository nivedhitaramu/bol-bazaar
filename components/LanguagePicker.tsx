"use client";
import { useEffect, useState } from "react";
import { Check, Languages, X } from "lucide-react";
import { LANGUAGES, langInfo, type LangCode } from "@/lib/languages";
import { useLang } from "./LangProvider";

export function LanguageGrid({ value, onChange }: { value: string; onChange: (l: LangCode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup">
      {LANGUAGES.map((l) => {
        const on = l.code === value;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.code)}
            className={`relative flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 transition ${
              on ? "border-maroon bg-maroon text-white" : "border-sand bg-white hover:border-saffron"
            }`}
          >
            <span className="text-lg font-bold leading-tight">{l.native}</span>
            <span className={`text-xs ${on ? "text-white/80" : "text-muted"}`}>{l.name}</span>
            {on && <Check className="absolute right-1.5 top-1.5 size-4" />}
          </button>
        );
      })}
    </div>
  );
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 border-sand bg-white px-3 font-semibold text-ink hover:border-saffron ${compact ? "text-sm" : ""}`}
        aria-label={t("chooseLang")}
      >
        <Languages className="size-4 text-maroon" />
        {langInfo(lang).native}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("chooseLang")}
            className="w-full max-w-md rounded-t-3xl bg-cream p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-maroon">
                <Languages className="size-5" /> {t("chooseLang")}
              </h2>
              <button onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-sand" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <LanguageGrid
              value={lang}
              onChange={(l) => {
                setLang(l);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
