"use client";
import { Volume2 } from "lucide-react";
import { useLang } from "./LangProvider";
import { unlockAudio } from "@/lib/client/player";
import { Portal } from "./Portal";

/** Browsers block autoplay until a gesture — one tap here unlocks audio for the session. */
export function SoundGate({ enabled, onEnable }: { enabled: boolean; onEnable: () => void }) {
  const { t } = useLang();
  if (enabled) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/60 p-6 backdrop-blur-sm">
        <button
          type="button"
          autoFocus
          onClick={async () => {
            await unlockAudio();
            onEnable();
          }}
          className="card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center transition active:scale-95"
        >
          <span className="relative grid size-24 place-items-center">
            <span className="absolute inset-0 rounded-full bg-saffron/40 animate-pulse-ring" />
            <span className="relative grid size-24 place-items-center rounded-full bg-maroon text-white shadow-xl">
              <Volume2 className="size-12" />
            </span>
          </span>
          <span className="font-display text-2xl font-bold text-maroon">{t("enableSound")}</span>
          <span className="text-muted">{t("enableSoundSub")}</span>
        </button>
      </div>
    </Portal>
  );
}
