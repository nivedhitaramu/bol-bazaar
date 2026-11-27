import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSeller, listPublished } from "@/lib/data";
import { getServerLang } from "@/lib/serverLang";
import { getStore } from "@/lib/store";
import { translateListing } from "@/lib/llm";
import { sarvamAvailable } from "@/lib/sarvam";
import type { ProductWithSeller } from "@/lib/data";
import { Storefront } from "./Storefront";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { params: Promise<{ sellerId: string }> };
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const STOREFRONT_LANGS = ["en", "hi", "ta"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sellerId } = await params;
  if (!isUuid(sellerId)) return {};
  try {
    const s = await getSeller(sellerId);
    const en = s?.shop?.i18n?.en;
    if (!s) return {};
    return {
      title: `${en?.shop_name ?? s.name} — Bol Bazaar`,
      description: en?.tagline ?? [s.craft, s.city].filter(Boolean).join(" · "),
    };
  } catch {
    return {};
  }
}

/**
 * Make sure every product has a listing in en / hi / ta so the storefront's language switch
 * translates everything. Uses the protected translation pipeline; results are cached on the
 * product, so this only costs anything on the first view. Capped at ~6 s.
 */
async function ensureListingLanguages(products: ProductWithSeller[]) {
  if (!sarvamAvailable()) return;
  const store = getStore();
  const jobs = products.flatMap((p) =>
    STOREFRONT_LANGS.filter((s) => !p.listing[s] && p.listing.en).map(async (s) => {
      const l = await translateListing(p.listing.en, `${s}-IN`);
      p.listing = { ...p.listing, [s]: l };
      await store.setProductListing(p.id, p.listing);
    })
  );
  if (!jobs.length) return;
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 6000))]);
}

export default async function SellerShopPage({ params }: Props) {
  const { sellerId } = await params;
  if (!isUuid(sellerId)) notFound();
  const lang = await getServerLang();
  const [seller, products] = await Promise.all([getSeller(sellerId), listPublished({ sellerId })]);
  if (!seller) notFound();
  await ensureListingLanguages(products);

  return (
    <>
      <AppHeader />
      <Storefront seller={seller} products={products} initialLang={lang} />
    </>
  );
}
