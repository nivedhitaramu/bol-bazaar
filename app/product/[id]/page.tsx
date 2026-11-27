import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Package, Ruler, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HearTheMaker } from "@/components/HearTheMaker";
import { BuyerActions } from "./BuyerActions";
import { getProduct } from "@/lib/data";
import { translator } from "@/lib/i18n";
import { langInfo, shortOf } from "@/lib/languages";
import { getServerLang } from "@/lib/serverLang";
import { translateListing } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { sarvamAvailable } from "@/lib/sarvam";
import { formatINR, listingFor, type ListingText } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { params: Promise<{ id: string }> };

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  try {
    const p = await getProduct(id);
    if (!p) return {};
    const l = p.listing.en ?? Object.values(p.listing)[0];
    return {
      title: `${l?.title ?? p.name} — ${formatINR(p.price)} · Bol Bazaar`,
      description: l?.description?.replace(/\n/g, " "),
    };
  } catch {
    return {};
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const lang = await getServerLang();
  const t = translator(lang);
  const short = shortOf(lang);

  if (!isUuid(id)) notFound();
  const p = await getProduct(id);
  if (!p) notFound();

  // Listing in the buyer's language: translate once with Sarvam and cache it on the product.
  let l: ListingText | null = p.listing[short] ?? null;
  let machineTranslated = false;
  if (!l && p.listing.en && sarvamAvailable()) {
    try {
      l = await translateListing(p.listing.en, lang);
      machineTranslated = true;
      await getStore().setProductListing(p.id, { ...p.listing, [short]: l });
    } catch {
      l = null;
    }
  }
  l = l ?? listingFor(p.listing, short);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl pb-16 md:px-4 md:pt-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="md:sticky md:top-20 md:self-start">
            {p.photo_url ? (
              <img src={p.photo_url} alt={l?.title ?? p.name} className="aspect-square w-full object-cover md:rounded-3xl" />
            ) : (
              <div className="aspect-square w-full bg-sand md:rounded-3xl" />
            )}
          </div>

          <div className="flex flex-col gap-4 px-4 md:px-0">
            {p.status !== "published" && (
              <span className="self-start rounded-full bg-sand px-3 py-1 text-xs font-bold text-muted">{t("draft")}</span>
            )}
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight text-ink">{l?.title ?? p.name}</h1>
              <p className="mt-1 text-3xl font-extrabold text-saffron">{formatINR(p.price)}</p>
            </div>

            <div className="space-y-1.5 text-lg leading-relaxed">
              {l?.description.split("\n").map((line, i) => <p key={i}>{line}</p>)}
            </div>
            {machineTranslated && (
              <p className="text-xs text-muted">
                ✦ {t("translatedTo")} → {langInfo(lang).native}
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              {p.material && (
                <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold shadow-sm">
                  <Sparkles className="size-4 text-saffron" /> {p.material}
                </span>
              )}
              {p.size_options?.map((s) => (
                <span key={s} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold shadow-sm">
                  <Ruler className="size-4 text-saffron" /> {s}
                </span>
              ))}
              {p.quantity != null && (
                <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold shadow-sm">
                  <Package className="size-4 text-saffron" /> {p.quantity}
                </span>
              )}
            </div>

            {/* Maker */}
            <section className="card overflow-hidden" aria-label={t("intro")}>
              <Link href={`/shop/${p.seller.id}`} className="flex items-center gap-3 p-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-full bg-maroon font-display text-2xl font-bold text-white">
                  {p.seller.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("intro")}</p>
                  <p className="text-lg font-bold">{p.seller.name}</p>
                  <p className="flex items-center gap-1 text-sm text-muted">
                    <MapPin className="size-3.5" />
                    {[p.seller.craft, p.seller.city, p.seller.state].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </Link>
              <div className="px-3 pb-3">
                <HearTheMaker seller={p.seller} />
              </div>
            </section>

            <BuyerActions productId={p.id} price={p.price} maxQty={p.quantity} />

            {!!l?.tags?.length && (
              <div className="flex flex-wrap gap-1.5">
                {l.tags.map((tg) => (
                  <span key={tg} className="rounded-full bg-turmeric-soft px-2.5 py-1 text-xs font-semibold text-maroon">
                    #{tg}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
