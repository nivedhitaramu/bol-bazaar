"use client";
import { useRef, useState } from "react";
import { Headphones, Languages, Square } from "lucide-react";
import { useLang } from "./LangProvider";
import { translator } from "@/lib/i18n";
import { useToast } from "./Toast";
import { play, speak, stopAudio, unlockAudio } from "@/lib/client/player";
import { langInfo, normalizeLang } from "@/lib/languages";
import type { Seller } from "@/lib/types";

type Phase = "idle" | "original" | "translating" | "translated";

/** Plays the maker's own voice, then the same intro translated into the buyer's language. */
export function HearTheMaker({
  seller,
  targetLang,
}: {
  seller: Pick<Seller, "name" | "language" | "gender" | "voice_intro_url" | "voice_intro_transcript" | "craft" | "city">;
  /** Language to translate the intro into (defaults to the viewer's UI language). */
  targetLang?: string;
}) {
  const ctx = useLang();
  const lang = targetLang ?? ctx.lang;
  const t = targetLang ? translator(normalizeLang(targetLang)) : ctx.t;
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [translated, setTranslated] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const run = useRef(0);

  const transcript =
    seller.voice_intro_transcript ||
    `${seller.name}${seller.craft ? ` — ${seller.craft}` : ""}${seller.city ? `, ${seller.city}` : ""}`;
  const same = lang.split("-")[0] === seller.language.split("-")[0];

  const start = async () => {
    if (phase !== "idle") {
      run.current++;
      stopAudio();
      setPhase("idle");
      return;
    }
    const id = ++run.current;
    await unlockAudio();
    setPhase("original");
    let fallback = false;
    if (seller.voice_intro_url) {
      await play({ url: seller.voice_intro_url, text: transcript, lang: seller.language }, { onEnd: (f) => (fallback = f) });
    } else {
      fallback = (await speak(transcript, seller.language, { gender: seller.gender })).fallback;
    }
    if (id !== run.current) return;
    if (!same) {
      setPhase("translating");
      const r = await speak(transcript, lang, {
        from: seller.language,
        gender: seller.gender,
        onStart: () => id === run.current && setPhase("translated"),
      });
      if (id !== run.current) return;
      // /api/speak echoes the original when it can't translate (no key and no dictionary match).
      const untranslated = !r.translated;
      setNoKey(untranslated);
      setTranslated(untranslated ? null : r.text);
      fallback = fallback || r.fallback;
    }
    if (fallback) toast(t("fallbackVoice"));
    setPhase("idle");
  };

  const active = phase !== "idle";
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-maroon to-maroon-dark text-white shadow-xl">
      <button type="button" onClick={start} className="flex w-full items-center gap-4 p-4 text-left" aria-pressed={active}>
        <span className="relative grid size-16 shrink-0 place-items-center">
          {active && <span className="absolute inset-0 rounded-full bg-turmeric/50 animate-pulse-ring" />}
          <span className="relative grid size-16 place-items-center rounded-full bg-turmeric text-maroon shadow-lg">
            {active ? <Square className="size-6 fill-maroon" /> : <Headphones className="size-8" />}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl font-bold">{t("hearMaker")}</span>
          <span className="flex items-center gap-1.5 text-sm text-white/80">
            {phase === "original" && (
              <>
                <span className="eq text-turmeric"><span /><span /><span /><span /></span>
                {seller.name} · {langInfo(seller.language).native}
              </>
            )}
            {phase === "translating" && (
              <>
                <span className="dots"><span /><span /><span /></span> {t("translating")}
              </>
            )}
            {phase === "translated" && (
              <>
                <Languages className="size-4 text-turmeric" />
                <span className="eq text-turmeric"><span /><span /><span /><span /></span>
                {langInfo(lang).native}
              </>
            )}
            {phase === "idle" && (
              <>
                {langInfo(seller.language).native}
                {!same && <> → {langInfo(lang).native}</>}
              </>
            )}
          </span>
        </span>
      </button>
      {(active || translated) && (
        <div className="space-y-2 border-t border-white/15 bg-black/10 px-4 py-3 text-sm">
          <p className={phase === "original" ? "text-white" : "text-white/60"}>“{transcript}”</p>
          {translated && !same && <p className="text-base font-semibold text-turmeric">“{translated}”</p>}
          {noKey && !same && <p className="text-xs font-bold text-turmeric/90">🔑 {t("translationKeyNotSet")}</p>}
        </div>
      )}
    </div>
  );
}
