"use client";
import { useState } from "react";
import { Keyboard, MessageCircleQuestion, Play, Send } from "lucide-react";
import { MicButton } from "./MicButton";
import { useToast } from "./Toast";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { postVoice, SwitchedToBrowserStt } from "@/lib/client/api";
import { play } from "@/lib/client/player";
import { translator } from "@/lib/i18n";
import { normalizeLang } from "@/lib/languages";

type AskRes = { question: string; intent: string; answer: string; lang: string; audio: string | null; mime: string | null };

/**
 * "Ask your shop" — for sellers who can't read. Everything here is in the language she SPEAKS
 * (not the app language): the big "Ask" label, the examples, the spoken + large-text answer.
 */
export function AskShop({ sellerId, speakLang }: { sellerId: string; speakLang: string }) {
  const lang = normalizeLang(speakLang);
  const t = translator(lang);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskRes | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  const say = (r: AskRes) =>
    play(
      { base64: r.audio, mime: r.mime, text: r.answer, lang: r.lang },
      { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) }
    );

  const ask = async (input: VoiceResult) => {
    setBusy(true);
    try {
      const r = await postVoice<AskRes>("/api/ask", input, { sellerId, language: lang });
      setRes(r);
      say(r);
    } catch (e) {
      if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`);
      else toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoiceInput({
    lang,
    maxMs: 15_000,
    onResult: ask,
    onError: (k) => {
      if (k !== "short") {
        toast(t("errorMic"), "error");
        setShowText(true);
      }
    },
  });
  const rec = voice.state === "recording";

  return (
    <section className="card mb-4 overflow-hidden" aria-label={t("askShop")}>
      <div className="flex items-center gap-4 bg-gradient-to-r from-peacock to-leaf p-4 text-white">
        <MicButton
          size="lg"
          state={busy || voice.state === "processing" ? "busy" : rec ? "recording" : "idle"}
          level={voice.level}
          progress={voice.elapsed / voice.maxMs}
          onPress={voice.toggle}
          label={rec ? t("stop") : t("ask")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-3xl font-extrabold leading-none">
            <MessageCircleQuestion className="size-7 text-turmeric" aria-hidden /> {t("ask")}
          </p>
          <p className="mt-1 text-sm text-white/85" aria-live="polite">
            {rec ? t("listening") : busy ? t("thinking") : t("askHint")}
          </p>
        </div>
      </div>

      {(res || voice.interim) && (
        <div className="grid gap-2 p-4">
          {(voice.interim || res?.question) && (
            <p className="text-sm text-muted">
              <span className="font-bold">{t("heardYou")}:</span> “{voice.interim || res?.question}”
            </p>
          )}
          {res && (
            <div className={`rounded-2xl bg-turmeric-soft p-4 ${speaking ? "ring-4 ring-turmeric/60" : ""}`}>
              <p className="text-2xl font-bold leading-snug text-ink" lang={res.lang.split("-")[0]}>
                {res.answer}
              </p>
              <button onClick={() => say(res)} className="btn btn-ghost mt-3 min-h-14 bg-white">
                {speaking ? (
                  <span className="eq text-maroon">
                    <span /><span /><span /><span />
                  </span>
                ) : (
                  <Play className="size-5" />
                )}
                {t("replay")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-sand px-4 py-2">
        {!showText ? (
          <button type="button" onClick={() => setShowText(true)} className="flex min-h-14 items-center gap-2 text-sm font-semibold text-muted">
            <Keyboard className="size-4" /> {t("typeInstead")}
          </button>
        ) : (
          <form
            className="flex gap-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) ask({ text: text.trim() });
              setText("");
            }}
          >
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("askHint")} lang={lang.split("-")[0]} />
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary shrink-0 px-4" aria-label={t("send")}>
              <Send className="size-5" />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
