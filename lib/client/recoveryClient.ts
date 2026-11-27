"use client";
/** Client-side helpers for "when things go wrong". */
import { useCallback, useRef } from "react";
import type { VoiceResult } from "./useVoiceInput";
import { postVoice } from "./api";

// ── server capabilities (cached) — "translation pending" vs "key not set" ──
let configP: Promise<{ sarvam: boolean; supabase: boolean }> | null = null;
export function serverConfig() {
  configP ??= fetch("/api/health?quick=1", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => ({ sarvam: Boolean(j?.config?.sarvam), supabase: Boolean(j?.config?.supabase) }))
    .catch(() => ({ sarvam: false, supabase: false }));
  return configP;
}

// ── /demo "simulate noise": the next chat message takes the low-confidence path ──
let armed = false;
const noiseListeners = new Set<(on: boolean) => void>();
export function armSimulateNoise(on = true) {
  armed = on;
  noiseListeners.forEach((l) => l(on));
}
/** Returns true once (and disarms) if the demo armed it. */
export function consumeSimulateNoise(): boolean {
  if (!armed) return false;
  armSimulateNoise(false);
  return true;
}
export function onSimulateNoise(fn: (on: boolean) => void) {
  noiseListeners.add(fn);
  return () => {
    noiseListeners.delete(fn);
  };
}

/** An answer ("aamaa", "saree"…) as text: typed / browser STT pass through; audio → /api/stt. */
export async function answerText(input: VoiceResult, lang: string): Promise<string> {
  if (input.text) return input.text;
  const r = await postVoice<{ transcript: string }>("/api/stt", input, { language: lang });
  return r.transcript;
}

/**
 * Two strikes: after `limit` consecutive failures (couldn't hear, didn't understand the answer…)
 * call onLimit — the surface opens its text box. Any success resets the count.
 */
export function useFailures(onLimit: () => void, limit = 2) {
  const n = useRef(0);
  const cb = useRef(onLimit);
  cb.current = onLimit;
  const fail = useCallback(() => {
    n.current += 1;
    if (n.current >= limit) {
      n.current = 0;
      cb.current();
    }
  }, [limit]);
  const reset = useCallback(() => {
    n.current = 0;
  }, []);
  return { fail, reset };
}
