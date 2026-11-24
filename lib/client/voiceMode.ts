"use client";
/**
 * Global STT mode. "sarvam" = record audio and send to the server (Sarvam STT).
 * "browser" = Web Speech API SpeechRecognition (fallback when Sarvam is unavailable).
 */
type Mode = "sarvam" | "browser";
let mode: Mode = "sarvam";
let probed = false;
const listeners = new Set<(m: Mode) => void>();

export function getVoiceMode(): Mode {
  return mode;
}

export function setVoiceMode(m: Mode) {
  if (m === mode) return;
  mode = m;
  listeners.forEach((l) => l(m));
}

export function onVoiceModeChange(fn: (m: Mode) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function browserSttSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Ask the server once whether Sarvam is configured. */
export async function probeVoiceMode() {
  if (probed) return mode;
  probed = true;
  try {
    const r = await fetch("/api/health?quick=1", { cache: "no-store" });
    const j = await r.json();
    if (!j?.config?.sarvam && browserSttSupported()) setVoiceMode("browser");
  } catch {}
  return mode;
}
