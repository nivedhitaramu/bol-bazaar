"use client";
import { useEffect, useState } from "react";
import { armSimulateNoise, onSimulateNoise } from "@/lib/client/recoveryClient";
import { useToast } from "./Toast";

/**
 * Hidden /demo control for the video: arms the low-confidence path so the NEXT chat message
 * (either panel) asks about one word instead of sending. Faint "∿" in the corner, or Shift+N.
 */
export function SimulateNoise() {
  const [armed, setArmed] = useState(false);
  const { toast } = useToast();

  useEffect(() => onSimulateNoise(setArmed), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]");
      if (e.shiftKey && e.key.toLowerCase() === "n" && !typing) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = () => {
    const next = !armed;
    armSimulateNoise(next);
    toast(next ? "∿ Noise simulated: the next message will ask about one word" : "Noise simulation off");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="Simulate noise (Shift+N)"
      aria-label="Simulate noise"
      aria-pressed={armed}
      className={`fixed bottom-2 right-2 z-[70] grid min-h-14 min-w-14 place-items-center rounded-full font-bold transition ${
        armed ? "bg-saffron px-4 text-white opacity-100 shadow-lg" : "text-ink opacity-[0.08] hover:opacity-60"
      }`}
    >
      {armed ? "∿ noise ON" : "∿"}
    </button>
  );
}
