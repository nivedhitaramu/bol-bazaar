"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Package, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SaveBuyerLink } from "@/components/SaveBuyerLink";
import { useLang } from "@/components/LangProvider";
import { useBuyer } from "@/lib/client/useBuyer";
import { langInfo } from "@/lib/languages";
import { formatINR, type BuyerActivity } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  placed: "bg-turmeric-soft text-ink",
  confirmed: "bg-peacock/15 text-peacock",
  shipped: "bg-saffron/15 text-maroon",
  delivered: "bg-leaf/15 text-leaf",
};

/** "My chats & orders" — everything this buyer started, on any device that opened their link. */
export default function BuyerHomePage() {
  const { t } = useLang();
  const { buyer, ready } = useBuyer();
  const [data, setData] = useState<BuyerActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buyer?.token) return;
    fetch("/api/buyer/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: buyer.token }) })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.code === "migration_needed" ? j.error : t("errorGeneric"));
        setData(j);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer?.token]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 pb-16 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-maroon">
          <MessageCircle className="size-6 text-saffron" /> {t("myChats")}
        </h1>

        {!ready || (buyer && !data && !error) ? (
          <Loader2 className="mx-auto size-7 animate-spin text-maroon" />
        ) : !buyer ? (
          <div className="card grid gap-4 p-5 text-center">
            <p className="text-muted">{t("noBuyerYet")}</p>
            <Link href="/shop" className="btn btn-primary">
              <ShoppingBag className="size-5" /> {t("browseShop")}
            </Link>
          </div>
        ) : (
          <>
            <p className="font-semibold">
              {buyer.name} · {langInfo(buyer.language).native}
            </p>
            {error && <p className="rounded-2xl bg-maroon/10 p-3 font-bold text-maroon">{error}</p>}

            {data && data.orders.length > 0 && (
              <section aria-label={t("orders")} className="grid gap-2">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Package className="size-5 text-maroon" /> {t("orders")}
                </h2>
                {data.orders.map((o) => (
                  <Link
                    key={o.id}
                    href={o.conversation_id ? `/chat/${o.conversation_id}?as=buyer` : `/product/${o.product_id}`}
                    className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-sand bg-white p-2 hover:border-saffron"
                  >
                    {o.product.photo_url ? (
                      <img src={o.product.photo_url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-sand">
                        <Package className="size-6 text-muted" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{o.product.name}</span>
                      <span className="text-sm text-muted">
                        × {o.quantity} · {formatINR(o.product.price != null ? o.product.price * o.quantity : null)}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[o.status] ?? ""}`}>{t(`status_${o.status}`)}</span>
                  </Link>
                ))}
              </section>
            )}

            {data && (
              <section aria-label={t("myChats")} className="grid gap-2">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <MessageCircle className="size-5 text-maroon" /> {t("chats")}
                </h2>
                {data.conversations.length === 0 && <p className="text-muted">{t("noBuyerYet")}</p>}
                {data.conversations.map((c) => {
                  // Show the last message in the buyer's language (their own words, or the seller's translated).
                  const last = c.last ? (c.last.sender === "buyer" ? c.last.original_text : (c.last.translated_text ?? c.last.original_text)) : "";
                  return (
                    <Link
                      key={c.id}
                      href={`/chat/${c.id}?as=buyer`}
                      className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-sand bg-white p-2 hover:border-saffron"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-maroon font-display text-lg font-bold text-white">
                        {c.seller.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {c.seller.name}
                          {c.product && <span className="font-normal text-muted"> · {c.product.name}</span>}
                        </span>
                        <span className="block truncate text-sm text-muted">{last || "…"}</span>
                      </span>
                    </Link>
                  );
                })}
              </section>
            )}

            <SaveBuyerLink buyer={buyer} />
          </>
        )}
      </main>
    </>
  );
}
