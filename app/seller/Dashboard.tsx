"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, Loader2, LogOut, MessageCircle, Package, Plus, Store, Truck } from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { OrderVoiceCommand } from "@/components/OrderVoiceCommand";
import { getJson, postJson } from "@/lib/client/api";
import type { LocalSeller } from "@/lib/client/useSeller";
import { subscribeAllMessages, subscribeOrders } from "@/lib/client/realtime";
import { lastSeen } from "@/lib/client/unread";
import { langInfo, normalizeLang, shortOf } from "@/lib/languages";
import { formatINR, listingFor, type OrderStatus } from "@/lib/types";
import type { DashboardData } from "@/lib/data";

type Tab = "products" | "chats" | "orders";
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { placed: "confirmed", confirmed: "shipped", shipped: "delivered" };
const STATUS_STYLE: Record<OrderStatus, string> = {
  placed: "bg-turmeric-soft text-maroon",
  confirmed: "bg-peacock/10 text-peacock",
  shipped: "bg-saffron/15 text-saffron",
  delivered: "bg-leaf/10 text-leaf",
};

export function Dashboard({ seller, onSignOut }: { seller: LocalSeller; onSignOut: () => void }) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("chats");
  const [updating, setUpdating] = useState<string | null>(null);
  const [, force] = useState(0);
  const short = shortOf(lang);
  const sellerLang = normalizeLang(seller.language);

  const load = useCallback(async () => {
    try {
      setData(await getJson<DashboardData>(`/api/sellers/${seller.id}/dashboard`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [seller.id]);

  useEffect(() => {
    load();
    const onFocus = () => force((x) => x + 1); // re-read unread markers
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Realtime: new buyer messages + order changes
  useEffect(() => {
    if (!data) return;
    const convIds = new Set(data.conversations.map((c) => c.id));
    const productIds = new Set(data.products.map((p) => p.id));
    const offMsgs = subscribeAllMessages((m) => {
      if (!convIds.has(m.conversation_id)) {
        // could be a brand-new conversation for one of our products
        load();
        return;
      }
      setData((d) =>
        d && {
          ...d,
          conversations: d.conversations
            .map((c) =>
              c.id === m.conversation_id
                ? { ...c, last: m, buyerTimes: m.sender === "buyer" ? [m.created_at, ...c.buyerTimes] : c.buyerTimes }
                : c
            )
            .sort((a, b) => ((b.last?.created_at ?? b.created_at) > (a.last?.created_at ?? a.created_at) ? 1 : -1)),
        }
      );
    });
    const offOrders = subscribeOrders((o) => {
      if (!productIds.has(o.product_id)) return;
      setData((d) => {
        if (!d) return d;
        if (!d.orders.some((x) => x.id === o.id)) {
          load();
          return d;
        }
        return { ...d, orders: d.orders.map((x) => (x.id === o.id ? { ...x, ...o } : x)) };
      });
    });
    return () => {
      offMsgs();
      offOrders();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.conversations.length, data?.products.length, data?.orders.length, load]);

  const unread = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of data?.conversations ?? []) {
      const seen = lastSeen(c.id);
      map[c.id] = c.buyerTimes.filter((ts) => ts > seen).length;
    }
    return map;
     
  }, [data]);
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const openOrders = data?.orders.filter((o) => o.status !== "delivered").length ?? 0;

  const advance = async (orderId: string, status: OrderStatus) => {
    setUpdating(orderId);
    try {
      await postJson(`/api/orders/${orderId}`, { sellerId: seller.id, status }, "PATCH");
      setData((d) => d && { ...d, orders: d.orders.map((o) => (o.id === orderId ? { ...o, status } : o)) });
      toast(`✓ ${t(`status_${status}`)}`, "success");
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setUpdating(null);
    }
  };

  const togglePublish = async (id: string, status: "draft" | "published") => {
    const next = status === "published" ? "draft" : "published";
    try {
      await postJson(`/api/products/${id}`, { sellerId: seller.id, status: next }, "PATCH");
      setData((d) => d && { ...d, products: d.products.map((p) => (p.id === id ? { ...p, status: next } : p)) });
    } catch {
      toast(t("errorGeneric"), "error");
    }
  };

  if (error)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-muted">{t("errorGeneric")}</p>
        <div className="flex justify-center gap-2">
          <button onClick={load} className="btn btn-primary">↻</button>
          <button onClick={onSignOut} className="btn btn-ghost">
            <LogOut className="size-5" />
          </button>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="grid min-h-[50dvh] place-items-center">
        <Loader2 className="size-8 animate-spin text-maroon" />
      </div>
    );

  const tabs: Array<{ id: Tab; label: string; icon: typeof Store; badge?: number }> = [
    { id: "chats", label: t("conversations"), icon: MessageCircle, badge: totalUnread },
    { id: "orders", label: t("orders"), icon: Package, badge: openOrders },
    { id: "products", label: t("products"), icon: Store },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
      {/* Greeting */}
      <div className="card motif mb-4 flex items-center gap-4 p-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-maroon font-display text-2xl font-bold text-white">
          {data.seller.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-maroon">{data.seller.name}</h1>
          <p className="truncate text-sm text-muted">
            {[data.seller.craft, data.seller.city, data.seller.state].filter(Boolean).join(" · ")} · {langInfo(data.seller.language).native}
          </p>
        </div>
        <button onClick={onSignOut} className="grid size-11 place-items-center rounded-full hover:bg-sand" aria-label="Sign out">
          <LogOut className="size-5 text-muted" />
        </button>
      </div>

      <Link href="/seller/new" className="btn btn-primary mb-4 w-full text-lg">
        <Plus className="size-6" /> {t("newProduct")}
      </Link>

      {/* Tabs */}
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-sm font-bold transition ${
              tab === id ? "bg-maroon text-white shadow-lg" : "bg-white text-ink"
            }`}
          >
            <Icon className="size-5" />
            {label}
            {!!badge && (
              <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full bg-saffron px-1.5 text-xs font-extrabold text-white ring-2 ring-cream">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "chats" && (
        <ul className="grid gap-2">
          {data.conversations.length === 0 && <Empty text={t("noChats")} />}
          {data.conversations.map((c) => {
            const n = unread[c.id] ?? 0;
            const preview = c.last ? (c.last.sender === "buyer" ? (c.last.translated_text ?? c.last.original_text) : c.last.original_text) : "";
            return (
              <li key={c.id}>
                <Link href={`/chat/${c.id}?as=seller`} className="card flex items-center gap-3 p-3 transition hover:shadow-lg">
                  {c.product?.photo_url ? (
                    <img src={c.product.photo_url} alt="" className="size-14 rounded-xl object-cover" />
                  ) : (
                    <div className="size-14 rounded-xl bg-sand" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold">
                      {c.buyer_name}
                      <span className="rounded bg-turmeric-soft px-1.5 text-xs font-semibold text-maroon">{langInfo(c.buyer_language).native}</span>
                    </p>
                    <p className={`truncate text-sm ${n ? "font-semibold text-ink" : "text-muted"}`}>{preview}</p>
                  </div>
                  {n > 0 && (
                    <span className="grid size-7 place-items-center rounded-full bg-saffron text-sm font-extrabold text-white">{n}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "orders" && (
        <div className="grid gap-3">
          <OrderVoiceCommand
            sellerId={seller.id}
            language={sellerLang}
            onUpdated={(o) => setData((d) => d && { ...d, orders: d.orders.map((x) => (x.id === o.id ? { ...x, ...o } : x)) })}
          />
          {data.orders.length === 0 && <Empty text={t("noOrders")} />}
          {data.orders.map((o) => {
            const title = listingFor(o.product.listing, short)?.title ?? o.product.name;
            const next = NEXT[o.status];
            return (
              <div key={o.id} className="card flex items-center gap-3 p-3">
                {o.product.photo_url ? <img src={o.product.photo_url} alt="" className="size-16 rounded-xl object-cover" /> : <div className="size-16 rounded-xl bg-sand" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{title}</p>
                  <p className="text-sm text-muted">
                    {o.buyer_name} · ×{o.quantity} · {formatINR((o.product.price ?? 0) * o.quantity)}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[o.status]}`}>{t(`status_${o.status}`)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {next && (
                    <button onClick={() => advance(o.id, next)} disabled={updating === o.id} className="btn btn-saffron min-h-11 px-3 text-sm">
                      {updating === o.id ? <Loader2 className="size-4 animate-spin" /> : next === "shipped" ? <Truck className="size-4" /> : <Check className="size-4" />}
                      {t(`status_${next}`)}
                    </button>
                  )}
                  {o.conversation_id && (
                    <Link href={`/chat/${o.conversation_id}?as=seller`} className="btn btn-ghost min-h-11 px-3 text-sm" aria-label={t("chatWith")}>
                      <MessageCircle className="size-4" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "products" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.products.length === 0 && (
            <div className="col-span-full">
              <Empty text={t("noProducts")} />
            </div>
          )}
          {data.products.map((p) => {
            const l = listingFor(p.listing, short);
            return (
              <div key={p.id} className="card overflow-hidden">
                <Link href={`/product/${p.id}`}>
                  {p.photo_url ? <img src={p.photo_url} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-sand" />}
                </Link>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-bold leading-snug">{l?.title ?? p.name}</p>
                  <p className="font-extrabold text-saffron">{formatINR(p.price)}</p>
                  <button
                    onClick={() => togglePublish(p.id, p.status)}
                    className={`mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-xl text-xs font-bold ${
                      p.status === "published" ? "bg-leaf/10 text-leaf" : "bg-sand text-muted"
                    }`}
                  >
                    {p.status === "published" ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    {p.status === "published" ? t("live") : t("draft")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border-2 border-dashed border-sand p-8 text-center font-semibold text-muted">{text}</p>;
}
