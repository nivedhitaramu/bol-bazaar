"use client";
import { useRef, useState } from "react";
import { Mic } from "lucide-react";
import { MicButton } from "./MicButton";
import { useToast } from "./Toast";
import { useLang } from "./LangProvider";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { ClientApiError, postJson, postVoice, SwitchedToBrowserStt } from "@/lib/client/api";
import { RecoveryCard } from "./RecoveryCard";
import { classifyYesNo, isUndo, recoveryText } from "@/lib/recovery";
import { answerText, useFailures } from "@/lib/client/recoveryClient";
import { play } from "@/lib/client/player";
import { translator } from "@/lib/i18n";
import { normalizeLang } from "@/lib/languages";
import type { Order, OrderStatus } from "@/lib/types";

type VoiceOrderResponse = {
  action?: "confirm" | "applied" | "undo" | "none";
  orderId?: string;
  fromStatus?: OrderStatus;
  prompt?: string;
  audio?: string | null;
  mime?: string | null;
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

  // Nothing changes until the seller says "yes"; "illa, thappu" reverts the last change.
  const [pending, setPending] = useState<{ orderId: string; intent: string; fromStatus: OrderStatus; prompt: string } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const lastChange = useRef<{ orderId: string; fromStatus: OrderStatus } | null>(null);
  const failures = useFailures(() => {
    setShowText(true);
    toast(recoveryText("typeOffer", lang));
    play({ text: recoveryText("typeOffer", lang), lang });
  });

  const announce = (o: Order) => {
    const label = t(`status_${o.status}` as Parameters<typeof t>[0]);
    toast(`✓ ${o.buyer_name}: ${label}`, "success");
    play({ text: `${o.buyer_name} — ${label}`, lang });
    onUpdated?.(o);
  };

  const undoLast = async () => {
    const last = lastChange.current;
    if (!last) return void play({ text: recoveryText("cancelled", lang), lang });
    const r = await postJson<{ order: Order }>(`/api/orders/${last.orderId}`, { sellerId, status: last.fromStatus }, "PATCH");
    lastChange.current = null;
    onUpdated?.(r.order);
    toast(recoveryText("undone", lang), "success");
    play({ text: recoveryText("undone", lang), lang });
  };

  const apply = async () => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    setBusy(true);
    try {
      const form: VoiceResult = {};
      const r = await postVoice<VoiceOrderResponse>("/api/orders/voice", form, { sellerId, language: lang, apply: "1", orderId: p.orderId, intent: p.intent });
      lastChange.current = { orderId: p.orderId, fromStatus: p.fromStatus };
      if (r.order) announce(r.order);
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  const answer = (choice: "yes" | "no" | null) => {
    if (choice === "yes") return void apply();
    if (choice === "no") {
      setPending(null);
      return void play({ text: recoveryText("cancelled", lang), lang });
    }
    failures.fail();
    play({ text: recoveryText("notSure", lang), lang });
  };

  const run = async (input: VoiceResult) => {
    setBusy(true);
    try {
      if (pendingRef.current) {
        const said = await answerText(input, lang);
        setHeard(said);
        if (isUndo(said)) {
          setPending(null);
          return void play({ text: recoveryText("cancelled", lang), lang });
        }
        return answer(classifyYesNo(said));
      }
      const r = await postVoice<VoiceOrderResponse>("/api/orders/voice", input, { sellerId, language: lang, dryRun: "1" });
      setHeard(r.transcript);
      failures.reset();
      if (r.action === "undo") return void (await undoLast());
      if (r.action === "confirm" && r.orderId && r.intent && r.fromStatus && r.prompt) {
        setPending({ orderId: r.orderId, intent: r.intent, fromStatus: r.fromStatus, prompt: r.prompt });
        return void play({ base64: r.audio ?? null, mime: r.mime ?? null, text: r.prompt, lang });
      }
      toast(r.intent === "unknown" ? t("orderVoiceHint") : t("noOrders"), "info");
    } catch (e) {
      failures.fail();
      if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`);
      else if (e instanceof ClientApiError && e.code === "empty_transcript") play({ text: recoveryText("couldntHear", lang), lang });
      else toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  const v = useVoiceInput({
    lang,
    onResult: run,
    onQuiet: () => {
      toast(t("comeCloser"));
      play({ text: t("comeCloser"), lang });
      failures.fail();
    },
    onError: (k) => {
      if (k === "short") return failures.fail();
      toast(t("errorMic"), "error");
      setShowText(true);
    },
  });

  return (
    <div>
    {pending && (
      <RecoveryCard
        kind="confirm"
        prompt={pending.prompt}
        lang={lang}
        busy={busy}
        compact={compact}
        labels={{ yes: t("yes"), no: t("no"), tapToSpeak: t("tapToSpeak"), listening: t("listening") }}
        onVoice={run}
        onPick={(c) => answer(c === "yes" ? "yes" : c === "no" ? "no" : null)}
      />
    )}
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
            <input className="input min-h-14 py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="confirm order" />
          </form>
        ) : (
          <button type="button" className="mt-0.5 min-h-14 text-sm font-semibold text-muted underline" onClick={() => setShowText(true)}>
            {t("typeInstead")}
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
