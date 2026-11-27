"use client";
import { Check, HelpCircle, ShieldCheck, X } from "lucide-react";
import { MicButton } from "./MicButton";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";

/**
 * The "are you sure?" card: read-back confirmation (yes / no) or a misheard-word question
 * (option A / option B). Answer by voice (its own mic, or hands-free) or by tapping.
 */
export function RecoveryCard({
  kind,
  prompt,
  options,
  lang,
  busy,
  labels,
  onVoice,
  onPick,
  compact = false,
}: {
  kind: "confirm" | "clarify";
  prompt: string;
  options?: [string, string];
  lang: string;
  busy?: boolean;
  labels: { yes: string; no: string; tapToSpeak: string; listening: string };
  /** A spoken answer — the parent interprets it (yes/no or option). */
  onVoice: (r: VoiceResult) => void;
  /** A tapped answer. */
  onPick: (choice: "yes" | "no" | 0 | 1) => void;
  compact?: boolean;
}) {
  const v = useVoiceInput({ lang, maxMs: 8000, onResult: onVoice, onError: () => {} });
  const rec = v.state === "recording";
  return (
    <div
      role="alertdialog"
      aria-label={prompt}
      className={`msg-in mb-2 rounded-2xl border-2 ${kind === "confirm" ? "border-leaf/60 bg-leaf/10" : "border-turmeric bg-turmeric-soft"} ${compact ? "p-2.5" : "p-3"}`}
    >
      <div className="flex items-start gap-2">
        {kind === "confirm" ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-leaf" /> : <HelpCircle className="mt-0.5 size-5 shrink-0 text-saffron" />}
        <p className={`flex-1 font-bold leading-snug text-ink ${compact ? "text-base" : "text-lg"}`}>{prompt}</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {kind === "confirm" ? (
          <>
            <button type="button" onClick={() => onPick("yes")} disabled={busy} className="btn btn-primary min-h-12 flex-1 bg-leaf px-3">
              <Check className="size-5" /> {labels.yes}
            </button>
            <button type="button" onClick={() => onPick("no")} disabled={busy} className="btn btn-ghost min-h-12 flex-1 px-3">
              <X className="size-5" /> {labels.no}
            </button>
          </>
        ) : (
          options?.map((o, i) => (
            <button key={i} type="button" onClick={() => onPick(i as 0 | 1)} disabled={busy} className="btn btn-ghost min-h-12 flex-1 border-2 border-saffron/50 bg-white px-3 text-lg">
              {o}
            </button>
          ))
        )}
        <MicButton
          size="md"
          state={busy || v.state === "processing" ? "busy" : rec ? "recording" : "idle"}
          level={v.level}
          progress={v.elapsed / v.maxMs}
          onPress={v.toggle}
          label={rec ? labels.listening : labels.tapToSpeak}
        />
      </div>
    </div>
  );
}
