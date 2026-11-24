"use client";
import { Loader2, Mic, Square } from "lucide-react";

export function MicButton({
  state,
  level = 0,
  progress = 0,
  onPress,
  size = "xl",
  label,
  disabled,
}: {
  state: "idle" | "recording" | "busy";
  level?: number;
  progress?: number; // 0..1 of max duration
  onPress: () => void;
  size?: "xl" | "lg" | "md";
  label: string;
  disabled?: boolean;
}) {
  const dims = size === "xl" ? 128 : size === "lg" ? 96 : 64;
  const icon = size === "xl" ? "size-14" : size === "lg" ? "size-10" : "size-7";
  const rec = state === "recording";
  const r = dims / 2 + 6;
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: dims + 24, height: dims + 24 }}>
      {rec && (
        <>
          <span className="absolute rounded-full bg-saffron/40 animate-pulse-ring" style={{ width: dims, height: dims }} />
          <span
            className="absolute rounded-full bg-saffron/30 animate-pulse-ring"
            style={{ width: dims, height: dims, animationDelay: "0.5s" }}
          />
          <span
            className="absolute rounded-full bg-turmeric/50 transition-transform duration-75"
            style={{ width: dims, height: dims, transform: `scale(${1 + level * 0.35})` }}
          />
          <svg className="absolute -rotate-90" width={dims + 24} height={dims + 24} aria-hidden>
            <circle
              cx={(dims + 24) / 2}
              cy={(dims + 24) / 2}
              r={r}
              fill="none"
              stroke="var(--color-maroon)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - progress)}
              opacity={0.6}
            />
          </svg>
        </>
      )}
      <button
        type="button"
        onClick={onPress}
        disabled={disabled || state === "busy"}
        aria-label={label}
        aria-pressed={rec}
        className={`relative grid place-items-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-60 ${
          rec ? "bg-saffron" : "bg-maroon hover:bg-maroon-dark"
        } ${state === "idle" && !disabled ? "animate-float" : ""}`}
        style={{ width: dims, height: dims, boxShadow: "0 12px 30px -8px rgba(122,31,43,.55)" }}
      >
        {state === "busy" ? (
          <Loader2 className={`${icon} animate-spin`} />
        ) : rec ? (
          <Square className={`${icon} fill-white`} />
        ) : (
          <Mic className={icon} />
        )}
      </button>
    </div>
  );
}
