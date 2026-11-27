"use client";
import { useState } from "react";
import { Mic } from "lucide-react";
import { MicButton } from "./MicButton";
import { useToast } from "./Toast";
import { useLang } from "./LangProvider";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { postVoice, SwitchedToBrowserStt } from "@/lib/client/api";
import { play } from "@/lib/client/player";
import { translator } from "@/lib/i18n";
import { normalizeLang } from "@/lib/languages";
import type { Order } from "@/lib/types";

type VoiceOrderResponse = {
  transcript: string;
  intent: string;
  order: Order | null;
  reason?: string;
};

/** Seller says "confirm order" / "ship tomorrow" / "shipped" in any language. */
export function OrderVoiceCommand({
  sellerId,
  language,
  onUpdated,
  compact = false,
  uiLang,
}: {
  sellerId: string;
  /** Language the seller SPEAKS (STT + spoken confirmation). */
  language: string;
  onUpdated?: (o: Order) => void;
  compact?: boolean;
  /** Pin the label language (the /demo panels); defaults to the app language. */
  uiLang?: string;
}) {
  const lang = normalizeLang(language);
  const app = useLang();
  const t = uiLang ? translator(normalizeLang(uiLang)) : app.t;
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  const run = async (input: VoiceResult) => {
    setBusy(true);
    try {
      const r = await postVoice<VoiceOrderResponse>("/api/orders/voice", input, { sellerId, language: lang });
      setHeard(r.transcript);
      if (r.order) {
        const label = t(`status_${r.order.status}` as Parameters<typeof t>[0]);
        toast(`✓ ${r.order.buyer_name}: ${label}`, "success");
        play({ text: `${r.order.buyer_name} — ${label}`, lang });
        onUpdated?.(r.order);
      } else {
        toast(r.intent === "unknown" ? t("orderVoiceHint") : t("noOrders"), "info");
      }
    } catch (e) {
      if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`);
      else toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  const v = useVoiceInput({
    lang,
    onResult: run,
    onError: (k) => {
      if (k !== "short") {
        toast(t("errorMic"), "error");
        setShowText(true);
      }
    },
  });

  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-turmeric-soft ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <MicButton
        size="md"
        state={busy || v.state === "processing" ? "busy" : v.state === "recording" ? "recording" : "idle"}
        level={v.level}
        progress={v.elapsed / v.maxMs}
        onPress={v.toggle}
        label={t("orderVoiceHint")}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-bold text-maroon">
          <Mic className="size-4" /> {v.state === "recording" ? t("listening") : busy ? t("thinking") : t("orders")}
        </p>
        <p className="text-xs leading-snug text-ink/80">{heard ? `“${heard}”` : t("orderVoiceHint")}</p>
        {showText ? (
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) run({ text: text.trim() });
              setText("");
            }}
          >
            <input className="input min-h-10 py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="confirm order" />
          </form>
        ) : (
          <button type="button" className="mt-0.5 text-xs font-semibold text-muted underline" onClick={() => setShowText(true)}>
            {t("typeInstead")}
          </button>
        )}
      </div>
    </div>
  );
}
