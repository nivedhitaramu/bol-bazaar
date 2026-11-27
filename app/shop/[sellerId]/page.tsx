import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProductCard } from "@/components/ProductCard";
import { HearTheMaker } from "@/components/HearTheMaker";
import { getSeller, listPublished } from "@/lib/data";
import { translator } from "@/lib/i18n";
import { langInfo, shortOf } from "@/lib/languages";
import { getServerLang } from "@/lib/serverLang";

export const dynamic = "force-dynamic";

export default async function SellerShopPage({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  const lang = await getServerLang();
  const t = translator(lang);
  if (!/^[0-9a-f-]{36}$/i.test(sellerId)) notFound();

  const [seller, products] = await Promise.all([getSeller(sellerId), listPublished({ sellerId })]);
  if (!seller) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <section className="card motif mb-6 p-5">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-full bg-maroon font-display text-3xl font-bold text-white">
              {seller.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold text-maroon">{seller.name}</h1>
              <p className="flex items-center gap-1 text-muted">
                <MapPin className="size-4" />
                {[seller.craft, seller.city, seller.state].filter(Boolean).join(" · ")} · {langInfo(seller.language).native}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <HearTheMaker seller={seller} />
          </div>
        </section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} langShort={shortOf(lang)} byLabel={t("by")} />
          ))}
        </div>
      </main>
    </>
  );
}
