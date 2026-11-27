"use client";
import { useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useToast } from "./Toast";
import { useLang } from "./LangProvider";
import { useVoiceInput } from "@/lib/client/useVoiceInput";
import { postVoice, SwitchedToBrowserStt } from "@/lib/client/api";

/** Small mic button that fills a text field by voice. */
export function FieldMic({ lang, onText, label }: { lang: string; onText: (s: string) => void; label: string }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const v = useVoiceInput({
    lang,
    maxMs: 10_000,
    onResult: async (r) => {
      if (r.text) return onText(r.text.replace(/[.।]+$/, ""));
      setBusy(true);
      try {
        const j = await postVoice<{ transcript: string }>("/api/stt", r, { language: lang });
        onText(j.transcript.replace(/[.।]+$/, ""));
      } catch (e) {
        toast(e instanceof SwitchedToBrowserStt ? t("fallbackStt") : t("errorGeneric"), e instanceof SwitchedToBrowserStt ? "info" : "error");
      } finally {
        setBusy(false);
      }
    },
    onError: (k) => k !== "short" && toast(t("errorMic"), "error"),
  });
  const rec = v.state === "recording";
  return (
    <button
      type="button"
      onClick={v.toggle}
      disabled={busy}
      aria-label={`${label}: ${rec ? t("stop") : t("tapToSpeak")}`}
      className={`grid size-14 shrink-0 place-items-center rounded-xl text-white transition active:scale-95 ${rec ? "bg-saffron animate-pulse" : "bg-maroon"}`}
    >
      {busy || v.state === "processing" ? <Loader2 className="size-5 animate-spin" /> : rec ? <Square className="size-5 fill-white" /> : <Mic className="size-5" />}
    </button>
  );
}
