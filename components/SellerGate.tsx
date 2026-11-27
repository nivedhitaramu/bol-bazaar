"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Store } from "lucide-react";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { type LocalSeller, useSeller } from "@/lib/client/useSeller";
import { DEMO } from "@/lib/demoIds";
import { normalizeLang } from "@/lib/languages";
import { getJson } from "@/lib/client/api";
import type { Seller } from "@/lib/types";

/** Renders children with the local seller, or an onboarding prompt. */
export function SellerGate({ children }: { children: (seller: LocalSeller, setSeller: (s: LocalSeller | null) => void) => React.ReactNode }) {
  const { seller, ready, setSeller } = useSeller();
  const { t, suggestLang } = useLang();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const pickDemoSeller = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getJson<Seller>(`/api/sellers/${DEMO.meenaId}`);
      setSeller({ id: s.id, name: s.name, language: s.language, gender: s.gender, city: s.city });
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setLoading(false);
    }
  }, [setSeller, t, toast]);

  // On seller pages the app language defaults to the seller's own language
  // (unless the user explicitly picked one in the header).
  useEffect(() => {
    if (seller) suggestLang(normalizeLang(seller.language));
  }, [seller, suggestLang]);

  // Links from /demo carry ?demo=1 → become Meena automatically (one click for judges).
  useEffect(() => {
    if (ready && !seller && new URLSearchParams(window.location.search).get("demo") === "1") pickDemoSeller();
  }, [ready, seller, pickDemoSeller]);

  if (!ready || (loading && !seller)) {
    return (
      <div className="grid min-h-[50dvh] place-items-center">
        <Loader2 className="size-8 animate-spin text-maroon" />
      </div>
    );
  }
  if (seller) return <>{children(seller, setSeller)}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <div className="card p-8">
        <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-turmeric-soft">
          <Store className="size-10 text-maroon" />
        </div>
        <h1 className="font-display text-2xl font-bold text-maroon">{t("notOnboarded")}</h1>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/seller/onboard" className="btn btn-primary text-lg">
            <Sparkles className="size-5" /> {t("startSelling")}
          </Link>
          <button onClick={pickDemoSeller} disabled={loading} className="btn btn-ghost">
            {loading ? <Loader2 className="size-5 animate-spin" /> : null} {t("useDemoSeller")}
          </button>
        </div>
      </div>
    </div>
  );
}
