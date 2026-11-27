import { KeyRound } from "lucide-react";

/** Thin top bar shown when API keys are missing (keyless demo mode). Height = --banner-h (30px). */
export function DemoBanner({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap bg-ink px-3 text-[12px] font-semibold text-cream"
      style={{ height: "var(--banner-h)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <KeyRound className="size-3.5 shrink-0 text-turmeric" aria-hidden />
      <span className="truncate">{text}</span>
      <a href="/api/health" className="tap-56 ml-1 shrink-0 text-turmeric underline">
        status
      </a>
    </div>
  );
}
