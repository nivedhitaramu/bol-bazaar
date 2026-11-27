"use client";
import { useRef, useState } from "react";
import { Check, Languages, Mic } from "lucide-react";
import { LANGUAGES, langInfo, type LangCode } from "@/lib/languages";
import { useLang } from "./LangProvider";
import { Popover } from "./Popover";

export function LanguageGrid({ value, onChange, label }: { value: string; onChange: (l: LangCode) => void; label?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
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

/** Header control: the APP language — every label on every screen follows it. */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex min-h-14 items-center gap-1.5 rounded-full border-2 border-sand bg-white px-3 font-semibold text-ink hover:border-saffron ${compact ? "text-sm" : ""}`}
        aria-label={`${t("appLanguage")}: ${langInfo(lang).native}`}
        title={t("appLanguage")}
      >
        <Languages className="size-4 text-maroon" />
        {compact ? (
          <>
            {/* phones: short mark ("En", "த", "हि") so the header never overflows 375px */}
            <span className="sm:hidden">{langInfo(lang).flagChar}</span>
            <span className="hidden sm:inline">{langInfo(lang).native}</span>
          </>
        ) : (
          langInfo(lang).native
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} title={t("appLanguage")} icon={<Languages className="size-5" />}>
        <p className="-mt-2 mb-3 text-sm text-muted">{t("appLanguageHint")}</p>
        <LanguageGrid
          value={lang}
          label={t("appLanguage")}
          onChange={(l) => {
            setLang(l);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

/**
 * Seller pages: the language she SPEAKS (speech recognition, read-back voice, listing language).
 * Separate from the app language on purpose — e.g. English screens, Tamil voice.
 */
export function SpeakLangPicker({ value, onChange }: { value: string; onChange: (l: LangCode) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-14 items-center gap-2 rounded-full bg-turmeric-soft px-3.5 text-sm font-bold text-maroon ring-1 ring-turmeric/60 hover:bg-turmeric/30"
      >
        <Mic className="size-4" />
        {t("iSpeak")}: <span className="text-base">{langInfo(value).native}</span>
        <span aria-hidden>▾</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} title={t("iSpeak")} icon={<Mic className="size-5" />}>
        <p className="-mt-2 mb-3 text-sm text-muted">{t("iSpeakHint")}</p>
        <LanguageGrid
          value={value}
          label={t("iSpeak")}
          onChange={(l) => {
            onChange(l);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}
