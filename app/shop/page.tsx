import Link from "next/link";
import { MapPin, SlidersHorizontal } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProductCard } from "@/components/ProductCard";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured, listFacets, listPublished } from "@/lib/data";
import { translator } from "@/lib/i18n";
import { shortOf } from "@/lib/languages";
import { getServerLang } from "@/lib/serverLang";

export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; state?: string }> }) {
  const sp = await searchParams;
  const lang = await getServerLang();
  const t = translator(lang);

  if (!isSupabaseConfigured())
    return (
      <>
        <AppHeader />
        <SetupNotice />
      </>
    );

  let products, facets;
  try {
    [products, facets] = await Promise.all([listPublished({ category: sp.category, state: sp.state }), listFacets()]);
  } catch (e) {
    return (
      <>
        <AppHeader />
        <SetupNotice detail={(e as Error).message} />
      </>
    );
  }

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { category: sp.category, state: sp.state, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <h1 className="mb-3 font-display text-3xl font-bold text-maroon">{t("shop")}</h1>

        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="navigation" aria-label={t("category")}>
          <SlidersHorizontal className="my-auto size-5 shrink-0 text-muted" aria-hidden />
          <Chip href={href({ category: undefined })} on={!sp.category}>
            {t("all")}
          </Chip>
          {facets.categories.map((c) => (
            <Chip key={c} href={href({ category: c })} on={sp.category === c}>
              {c}
            </Chip>
          ))}
        </div>
        {facets.states.length > 0 && (
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={t("state")}>
            <MapPin className="my-auto size-5 shrink-0 text-muted" aria-hidden />
            <Chip href={href({ state: undefined })} on={!sp.state} small>
              {t("all")}
            </Chip>
            {facets.states.map((s) => (
              <Chip key={s} href={href({ state: s })} on={sp.state === s} small>
                {s}
              </Chip>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-sand p-10 text-center font-semibold text-muted">{t("noProducts")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} langShort={shortOf(lang)} byLabel={t("by")} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Chip({ href, on, children, small }: { href: string; on: boolean; children: React.ReactNode; small?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex shrink-0 items-center whitespace-nowrap rounded-full border-2 px-4 font-semibold transition ${small ? "min-h-10 text-sm" : "min-h-12"} ${
        on ? "border-maroon bg-maroon text-white" : "border-sand bg-white hover:border-saffron"
      }`}
    >
      {children}
    </Link>
  );
}
