"use client";
import { useEffect, useState } from "react";
import { Check, Delete } from "lucide-react";
import { MicButton } from "./MicButton";
import { useVoiceInput } from "@/lib/client/useVoiceInput";
import { answerText } from "@/lib/client/recoveryClient";
import { parsePinDigits } from "@/lib/pin";

/**
 * Big 4-digit PIN pad: tap the keys, or speak the digits in any language
 * ("ஒன்று இரண்டு மூன்று நான்கு" / "एक दो तीन चार" / "one two three four").
 * Digits are shown as dots and never read aloud.
 */
export function PinPad({
  lang,
  onComplete,
  busy,
  error,
  labels,
  resetKey,
}: {
  lang: string;
  onComplete: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
  labels: { speak: string; listening: string; didntCatch: string; ok: string };
  /** Change it to clear the pad (e.g. after a wrong PIN). */
  resetKey?: number;
}) {
  const [pin, setPin] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => setPin(""), [resetKey]);

  const v = useVoiceInput({
    lang,
    maxMs: 8000,
    onResult: async (r) => {
      const said = await answerText(r, lang).catch(() => "");
      const digits = parsePinDigits(said);
      if (!digits) return setHint(labels.didntCatch);
      setHint(null);
      setPin(digits);
      onComplete(digits);
    },
    onError: () => setHint(labels.didntCatch),
  });

  const press = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setHint(null);
    if (next.length === 4) onComplete(next);
  };

  const key = "grid h-16 place-items-center rounded-2xl bg-white text-3xl font-extrabold text-ink shadow-sm ring-1 ring-sand transition active:scale-95 active:bg-sand disabled:opacity-50";
  return (
    <div className="mx-auto grid w-full max-w-xs gap-4">
      <div className="flex justify-center gap-4" aria-label={`${pin.length} of 4`} role="status">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-full border-2 transition ${i < pin.length ? "border-maroon bg-maroon" : "border-muted/50"}`} />
        ))}
      </div>
      {(error || hint) && <p className="text-center font-bold text-maroon" role="alert">{error ?? hint}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button type="button" className={key} onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy || !pin} aria-label="Delete">
          <Delete className="size-7" />
        </button>
        <button type="button" className={key} onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button type="button" className={`${key} bg-leaf text-white ring-leaf`} onClick={() => pin.length === 4 && onComplete(pin)} disabled={busy || pin.length !== 4} aria-label={labels.ok}>
          <Check className="size-8" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-2">
        <MicButton
          size="md"
          state={busy || v.state === "processing" ? "busy" : v.state === "recording" ? "recording" : "idle"}
          level={v.level}
          progress={v.elapsed / v.maxMs}
          onPress={v.toggle}
          label={labels.speak}
        />
        <span className="text-sm font-semibold text-muted">{v.state === "recording" ? labels.listening : labels.speak}</span>
      </div>
    </div>
  );
}
