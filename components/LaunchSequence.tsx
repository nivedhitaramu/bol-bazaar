"use client";
import { Check, Languages, Mic, Sparkles, Store } from "lucide-react";

export type LaunchStage = 0 | 1 | 2 | 3 | 4; // idle · listening · understanding · writing · live

/** Listening → Understanding → Writing in 3 languages → Your shop is live! */
export function LaunchSequence({
  stage,
  labels,
  level = 0,
  seconds,
}: {
  stage: LaunchStage;
  labels: { listening: string; understanding: string; writing: string; live: string };
  level?: number;
  seconds?: number;
}) {
  const steps = [
    { icon: Mic, label: labels.listening },
    { icon: Sparkles, label: labels.understanding },
    { icon: Languages, label: labels.writing },
    { icon: Store, label: labels.live },
  ];
  const pct = stage === 0 ? 0 : stage >= 4 ? 100 : ((stage - 1) / 3) * 100 + 8;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink p-5 text-cream shadow-2xl" aria-live="polite">
      {stage === 4 && <Burst />}
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-saffron to-turmeric transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid gap-3">
        {steps.map((s, i) => {
          const n = (i + 1) as LaunchStage;
          const done = stage > n || (stage === 4 && n === 4);
          const active = stage === n && n !== 4;
          const Icon = s.icon;
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-500 ${
                active ? "scale-[1.02] bg-white/10" : done ? "opacity-100" : "opacity-35"
              }`}
            >
              <span
                className={`relative grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-500 ${
                  done ? "bg-leaf text-white" : active ? "bg-saffron text-white" : "bg-white/10"
                }`}
              >
                {active && <span className="absolute inset-0 rounded-full bg-saffron/60 animate-pulse-ring" />}
                {done ? <Check className="relative size-5" /> : <Icon className="relative size-5" />}
              </span>
              <span className={`flex-1 font-bold ${n === 4 && stage === 4 ? "font-display text-2xl text-turmeric" : "text-base"}`}>{s.label}</span>
              {active && n === 1 && (
                <span className="flex items-end gap-0.5" aria-hidden>
                  {[0.6, 1, 0.75, 0.9, 0.5].map((k, j) => (
                    <span key={j} className="w-1 rounded-full bg-turmeric transition-all duration-75" style={{ height: `${6 + level * 22 * k}px` }} />
                  ))}
                  {seconds != null && <span className="ml-2 text-xs font-bold tabular-nums text-turmeric">{seconds}s</span>}
                </span>
              )}
              {active && n === 2 && (
                <span className="dots text-turmeric">
                  <span /><span /><span />
                </span>
              )}
              {active && n === 3 && (
                <span className="flex gap-1 text-xs font-bold">
                  {["தமிழ்", "हिन्दी", "English"].map((l, j) => (
                    <span key={l} className="msg-in rounded-full bg-turmeric/20 px-2 py-0.5 text-turmeric" style={{ animationDelay: `${j * 0.35}s`, animationFillMode: "both" }}>
                      {l}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Lightweight celebratory burst (CSS only). */
function Burst() {
  const colors = ["#e9b22c", "#e8781e", "#f5e8d3", "#2f6b4f", "#ffffff"];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 7) * 0.08;
        return (
          <span
            key={i}
            className="absolute top-0 block size-2 rounded-sm"
            style={{
              left: `${left}%`,
              background: colors[i % colors.length],
              animation: `bb-fall 1.6s ${delay}s ease-in forwards`,
              transform: `rotate(${i * 23}deg)`,
            }}
          />
        );
      })}
      <style>{`@keyframes bb-fall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1 } 100% { transform: translateY(360px) rotate(540deg); opacity: 0 } }`}</style>
    </div>
  );
}
