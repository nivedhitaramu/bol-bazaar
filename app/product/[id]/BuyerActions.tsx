"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircle, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { postJson } from "@/lib/client/api";
import { readBuyerName, saveBuyerName } from "@/lib/client/useSeller";
import { unlockAudio } from "@/lib/client/player";
import { formatINR } from "@/lib/types";
import { Portal } from "@/components/Portal";

export function BuyerActions({ productId, price, maxQty }: { productId: string; price: number | null; maxQty: number | null }) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<null | "talk" | "buy">(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ conversationId: string } | null>(null);

  useEffect(() => setName(readBuyerName()), []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    if (!n) return;
    saveBuyerName(n);
    setBusy(true);
    try {
      if (mode === "talk") {
        await unlockAudio(); // this tap counts as the gesture that enables auto-play in chat
        const r = await postJson<{ id: string }>("/api/conversations", { productId, buyerName: n, buyerLanguage: lang });
        router.push(`/chat/${r.id}?as=buyer`);
      } else {
        const r = await postJson<{ orderId: string; conversationId: string }>("/api/orders", {
          productId,
          buyerName: n,
          buyerLanguage: lang,
          quantity: qty,
        });
        setDone({ conversationId: r.conversationId });
        toast(t("orderPlaced"), "success");
      }
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  const cap = maxQty && maxQty > 0 ? Math.min(maxQty, 99) : 99;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setMode("talk")} className="btn btn-ghost min-h-16 border-2 border-maroon/20 text-lg">
          <MessageCircle className="size-6 text-maroon" /> {t("talkToSeller")}
        </button>
        <button onClick={() => setMode("buy")} className="btn btn-primary min-h-16 text-lg">
          <ShoppingBag className="size-6" /> {t("buy")}
        </button>
      </div>

      {mode && (
        <Portal>
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 sm:items-center"
            onClick={() => !busy && setMode(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md rounded-t-3xl bg-cream p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold text-maroon">
                  {mode === "talk" ? <MessageCircle className="size-5" /> : <ShoppingBag className="size-5" />}
                  {mode === "talk" ? t("talkToSeller") : t("buy")}
                </h2>
                <button
                  onClick={() => setMode(null)}
                  className="grid size-11 place-items-center rounded-full hover:bg-sand"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>

              {done ? (
                <div className="text-center">
                  <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-leaf text-white">
                    <Check className="size-8" />
                  </div>
                  <p className="font-display text-2xl font-bold text-leaf">{t("orderPlaced")}</p>
                  <button
                    onClick={async () => {
                      await unlockAudio();
                      router.push(`/chat/${done.conversationId}?as=buyer`);
                    }}
                    className="btn btn-primary mt-4 w-full"
                  >
                    <MessageCircle className="size-5" /> {t("talkToSeller")}
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="grid gap-4">
                  <label className="grid gap-1">
                    <span className="text-sm font-bold text-muted">{t("yourName")}</span>
                    <input
                      className="input text-lg"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      required
                      autoComplete="given-name"
                    />
                  </label>
                  {mode === "buy" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-muted">{t("quantity")}</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="grid size-14 place-items-center rounded-2xl bg-sand"
                          aria-label="−"
                        >
                          <Minus className="size-5" />
                        </button>
                        <span className="w-8 text-center text-2xl font-extrabold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.min(cap, q + 1))}
                          className="grid size-14 place-items-center rounded-2xl bg-sand"
                          aria-label="+"
                        >
                          <Plus className="size-5" />
                        </button>
                      </div>
                    </div>
                  )}
                  <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary text-lg">
                    {busy ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : mode === "talk" ? (
                      <MessageCircle className="size-5" />
                    ) : (
                      <ShoppingBag className="size-5" />
                    )}
                    {mode === "talk" ? t("talkToSeller") : `${t("buyNow")} · ${formatINR(price != null ? price * qty : null)}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
