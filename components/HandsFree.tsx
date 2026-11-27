"use client";
import { Ear, Hand, Loader2, Volume2 } from "lucide-react";
import type { HandsFreeState } from "@/lib/client/useHandsFree";

/** Big, unmistakable switch. Off = tap-to-talk (the default). */
export function HandsFreeToggle({
  on,
  onChange,
  label,
  hint,
  compact = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 text-left transition ${
        on ? "border-leaf bg-leaf/10" : "border-sand bg-white hover:border-saffron"
      } ${compact ? "min-h-14 px-3 py-1.5" : "min-h-14 px-4 py-2"}`}
    >
      <span className={`grid shrink-0 place-items-center rounded-xl ${on ? "bg-leaf text-white" : "bg-sand text-ink"} ${compact ? "size-8" : "size-10"}`}>
        {on ? <Ear className="size-5" /> : <Hand className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-extrabold leading-tight ${compact ? "text-sm" : "text-base"}`}>{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-leaf" : "bg-muted/40"}`} aria-hidden>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

/**
 * Hands-free status: Listening… (soft pulse) · hearing you (live level) · Sending… · Speaking….
 * `phase` is decided by the caller: sending/speaking win over the mic state.
 */
export function HandsFreeStatus({
  state,
  phase,
  level,
  interim,
  labels,
  compact = false,
}: {
  state: HandsFreeState;
  phase: "sending" | "speaking" | null;
  level: number;
  interim?: string;
  labels: { listening: string; sending: string; speaking: string };
  compact?: boolean;
}) {
  const size = compact ? 64 : 88;
  const view: "listening" | "hearing" | "sending" | "speaking" | "starting" =
    phase ?? (state === "hearing" ? "hearing" : state === "starting" ? "starting" : "listening");
  const text = view === "sending" ? labels.sending : view === "speaking" ? labels.speaking : labels.listening;
  const color = view === "sending" ? "bg-maroon" : view === "speaking" ? "bg-peacock" : view === "hearing" ? "bg-saffron" : "bg-leaf";

  return (
    <div className="flex flex-col items-center gap-1.5" aria-live="polite">
      <div className="relative grid place-items-center" style={{ width: size + 28, height: size + 28 }}>
        {(view === "listening" || view === "hearing") && (
          <>
            <span className={`absolute rounded-full ${color} opacity-30 animate-pulse-ring`} style={{ width: size, height: size }} />
            <span
              className={`absolute rounded-full ${color} opacity-25 transition-transform duration-75`}
              style={{ width: size, height: size, transform: `scale(${1 + level * 0.45})` }}
            />
          </>
        )}
        <span className={`relative grid place-items-center rounded-full text-white shadow-xl transition-colors ${color}`} style={{ width: size, height: size }}>
          {view === "sending" || view === "starting" ? (
            <Loader2 className="size-8 animate-spin" />
          ) : view === "speaking" ? (
            <span className="flex items-center gap-1">
              <Volume2 className="size-6" />
              <span className="eq">
                <span /><span /><span />
              </span>
            </span>
          ) : (
            <span className="flex h-8 items-end gap-1" aria-hidden>
              {[0.55, 0.9, 1, 0.8, 0.5].map((k, i) => (
                <span key={i} className="w-1.5 rounded-full bg-white transition-all duration-75" style={{ height: `${8 + level * 26 * k}px` }} />
              ))}
            </span>
          )}
        </span>
      </div>
      <p className={`font-bold ${view === "hearing" ? "text-saffron" : view === "sending" ? "text-maroon" : view === "speaking" ? "text-peacock" : "text-leaf"}`}>
        {view === "sending" && (
          <span className="dots mr-1.5 align-middle">
            <span /><span /><span />
          </span>
        )}
        {text}
      </p>
      {interim && <p className="max-w-xs text-center text-xs italic text-muted">“{interim}”</p>}
    </div>
  );
}
