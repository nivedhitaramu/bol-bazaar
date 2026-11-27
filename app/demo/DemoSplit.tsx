"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ExternalLink, Loader2, Mic, RotateCcw, Store } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { SoundGate } from "@/components/SoundGate";
import { Logo } from "@/components/AppHeader";
import { OrderVoiceCommand } from "@/components/OrderVoiceCommand";
import { useToast } from "@/components/Toast";
import { DEMO } from "@/lib/demoIds";
import { postJson } from "@/lib/client/api";

export function DemoSplit() {
  const [sound, setSound] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { toast } = useToast();

  const reset = async () => {
    setResetting(true);
    try {
      await postJson("/api/demo/reset", {});
      setEpoch((e) => e + 1);
      toast("Demo reset ✓", "success");
    } catch {
      toast("Reset failed — check Supabase config (/api/health)", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-var(--banner-h,0px))] flex-col bg-sand/40" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <SoundGate enabled={sound} onEnable={() => setSound(true)} />
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sand bg-cream px-4 py-2">
        <Logo small />
        <p className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <span className="rounded-lg bg-maroon px-2 py-0.5 text-white">தமிழ்</span>
          <ArrowLeftRight className="size-4 text-saffron" />
          <span className="rounded-lg bg-saffron px-2 py-0.5 text-white">हिन्दी</span>
          <span className="hidden text-base font-semibold text-muted md:inline">— live cross-language chat</span>
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Link href="/seller/shop-setup?demo=1" className="btn btn-saffron min-h-11 px-3 text-sm">
            <Mic className="size-4" /> Speak your shop
          </Link>
          <Link href={`/shop/${DEMO.meenaId}`} className="btn btn-ghost min-h-11 px-3 text-sm">
            <Store className="size-4" /> Meena&apos;s shop
          </Link>
          <Link href={`/chat/${DEMO.conversationId}?as=buyer`} target="_blank" className="btn btn-ghost min-h-11 px-3 text-sm">
            <ExternalLink className="size-4" /> Buyer on phone
          </Link>
          <button onClick={reset} disabled={resetting} className="btn btn-primary min-h-11 px-3 text-sm">
            {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reset demo
          </button>
        </div>
      </header>

      <main key={epoch} className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 md:grid-cols-2 md:overflow-hidden">
        <section className="card flex h-[85dvh] min-h-0 flex-col overflow-hidden md:h-auto" aria-label="Seller — Meena (Tamil)">
          <div className="flex items-center gap-2 bg-maroon px-4 py-2 text-white">
            <span className="text-xs font-bold uppercase tracking-widest text-turmeric">Seller</span>
            <span className="font-bold">Meena · Kanchipuram</span>
            <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-sm">தமிழ்</span>
          </div>
          <div className="border-b border-sand bg-white p-2">
            <OrderVoiceCommand sellerId={DEMO.meenaId} language="ta-IN" uiLang="ta-IN" compact />
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel conversationId={DEMO.conversationId} side="seller" soundEnabled={sound} compact panelId="demo-seller" />
          </div>
        </section>

        <section className="card flex h-[85dvh] min-h-0 flex-col overflow-hidden md:h-auto" aria-label="Buyer — Priya (Hindi)">
          <div className="flex items-center gap-2 bg-saffron px-4 py-2 text-white">
            <span className="text-xs font-bold uppercase tracking-widest text-maroon">Buyer</span>
            <span className="font-bold">Priya · Lucknow</span>
            <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-sm">हिन्दी</span>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel conversationId={DEMO.conversationId} side="buyer" soundEnabled={sound} compact panelId="demo-buyer" />
          </div>
        </section>
      </main>
    </div>
  );
}
