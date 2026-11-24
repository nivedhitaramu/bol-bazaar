"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { SoundGate } from "@/components/SoundGate";
import { Logo } from "@/components/AppHeader";
import { useLang } from "@/components/LangProvider";
import { isAudioUnlocked } from "@/lib/client/player";

export function ChatScreen({ conversationId, side }: { conversationId: string; side: "buyer" | "seller" }) {
  const [sound, setSound] = useState(false);
  useEffect(() => {
    if (isAudioUnlocked()) setSound(true); // already unlocked earlier in this tab (client-side navigation)
  }, []);
  const router = useRouter();
  const { t } = useLang();
  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <SoundGate enabled={sound} onEnable={() => setSound(true)} />
      <div className="flex items-center gap-2 border-b border-sand bg-cream px-2 py-1.5">
        <button
          onClick={() => (history.length > 1 ? router.back() : router.push(side === "seller" ? "/seller" : "/shop"))}
          className="grid size-11 place-items-center rounded-full hover:bg-sand"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-5" />
        </button>
        <Logo small />
        <span className="ml-auto rounded-full bg-sand px-3 py-1 text-xs font-bold uppercase tracking-wide text-maroon">
          {side === "seller" ? t("sellerLabel") : t("buyerLabel")}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel conversationId={conversationId} side={side} soundEnabled={sound} panelId={`${side}-main`} />
      </div>
    </div>
  );
}
