"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Award, IndianRupee, MapPin, MessageCircle, Quote, Share2, Sparkles, Store } from "lucide-react";
import { HearTheMaker } from "@/components/HearTheMaker";
import { ProductCard } from "@/components/ProductCard";
import { translator } from "@/lib/i18n";
import { langInfo, normalizeLang, shortOf } from "@/lib/languages";
import { readSeller } from "@/lib/client/useSeller";
import type { ProductWithSeller } from "@/lib/data";
import type { Seller, ShopText } from "@/lib/types";

const ORDER = ["ta", "hi", "en"];

/** Storefront for sellers who haven't spoken their shop yet — built from onboarding info only. */
function basicText(seller: Seller): ShopText {
  return {
    shop_name: seller.name,
    tagline: [seller.craft, seller.city].filter(Boolean).join(" · "),
    story: "",
    craft: seller.craft ?? "",
    specialties: [],
    price_text: null,
    years_text: null,
  };
}

export function Storefront({ seller, products, initialLang }: { seller: Seller; products: ProductWithSeller[]; initialLang: string }) {
  const shop = seller.shop ?? null;
  const langs = useMemo(() => {
    const have = shop ? Object.keys(shop.i18n) : ["en"];
    const sellerShort = shortOf(normalizeLang(seller.language));
    return [...ORDER.filter((l) => have.includes(l)), ...have.filter((l) => !ORDER.includes(l))].sort((a, b) =>
      a === sellerShort ? -1 : b === sellerShort ? 1 : 0
    );
  }, [shop, seller.language]);

  const [sel, setSel] = useState(() => {
    const viewer = shortOf(normalizeLang(initialLang));
    return langs.includes(viewer) ? viewer : langs.includes("en") ? "en" : langs[0];
  });
  const [isOwner, setIsOwner] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    setIsOwner(readSeller()?.id === seller.id);
    setUrl(window.location.href);
  }, [seller.id]);

  const code = normalizeLang(`${sel}-IN`);
  const t = translator(code);
  const text: ShopText = shop?.i18n[sel] ?? shop?.i18n.en ?? basicText(seller);

  const phone = shop?.phone?.replace(/\D/g, "").slice(-10);
  const greeting =
    sel === "hi"
      ? `नमस्ते ${shop?.owner_name ?? seller.name} जी, मैंने Bol Bazaar पर आपकी दुकान देखी।`
      : sel === "ta"
        ? `வணக்கம் ${shop?.owner_name ?? seller.name}, Bol Bazaar-ல் உங்கள் கடையைப் பார்த்தேன்.`
        : `Hi ${shop?.owner_name ?? seller.name}, I saw your shop on Bol Bazaar.`;
  const wa = phone
    ? { href: `https://wa.me/91${phone}?text=${encodeURIComponent(greeting)}`, label: t("chatOnWhatsapp"), icon: MessageCircle }
    : { href: `https://wa.me/?text=${encodeURIComponent(`${text.shop_name} — ${text.tagline}\n${url}`)}`, label: t("shareShop"), icon: Share2 };

  return (
    <main className="pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-maroon via-maroon to-maroon-dark text-white">
        <div className="motif absolute inset-0 opacity-25" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-5">
          <div className="mb-6 flex justify-end">
            <div role="tablist" aria-label="Language" className="inline-flex rounded-full bg-white/10 p-1 backdrop-blur">
              {langs.map((l) => (
                <button
                  key={l}
                  role="tab"
                  aria-selected={sel === l}
                  onClick={() => setSel(l)}
                  className={`min-h-14 rounded-full px-4 text-sm font-bold transition ${sel === l ? "bg-turmeric text-maroon shadow" : "text-white/85 hover:text-white"}`}
                >
                  {langInfo(`${l}-IN`).native}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="grid size-24 shrink-0 place-items-center rounded-3xl bg-turmeric font-display text-5xl font-extrabold text-maroon shadow-xl">
              {(shop?.owner_name ?? seller.name).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-turmeric">
                <Store className="size-4" /> Bol Bazaar
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl">{text.shop_name}</h1>
              {text.tagline && <p className="mt-2 text-lg text-white/90 sm:text-xl">{text.tagline}</p>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
            {(shop?.city ?? seller.city) && (
              <Chip icon={MapPin}>
                {shop?.owner_name ?? seller.name} · {shop?.city ?? seller.city}
                {seller.state ? `, ${seller.state}` : ""}
              </Chip>
            )}
            {text.years_text && <Chip icon={Award}>{text.years_text}</Chip>}
            {text.price_text && <Chip icon={IndianRupee}>{text.price_text}</Chip>}
            {text.craft && <Chip icon={Sparkles}>{text.craft}</Chip>}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a href={wa.href} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp min-h-14 text-lg shadow-lg">
              <wa.icon className="size-5" /> {wa.label}
            </a>
            <HearTheMaker seller={seller} targetLang={code} />
          </div>
        </div>
        <div className="motif-strip" aria-hidden />
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Story */}
        {(text.story || text.specialties.length > 0) && (
          <section className="card -mt-4 relative mb-8 p-6" aria-label={t("ourStory")}>
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold text-maroon">
              <Quote className="size-5 text-saffron" /> {t("ourStory")}
            </h2>
            {text.story && <p className="text-lg leading-relaxed text-ink/90">{text.story}</p>}
            {text.specialties.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{t("specialtiesLabel")}</p>
                <div className="flex flex-wrap gap-2">
                  {text.specialties.map((s) => (
                    <span key={s} className="rounded-full bg-turmeric-soft px-3 py-1.5 text-sm font-semibold text-maroon">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {isOwner && !shop && (
          <Link href="/seller/shop-setup" className="card mb-8 flex items-center gap-4 p-5 transition hover:shadow-xl">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-maroon text-white">
              <Store className="size-7" />
            </span>
            <span>
              <span className="block font-display text-xl font-bold text-maroon">{t("speakYourShop")}</span>
              <span className="text-sm text-muted">{t("shopSetupCta")}</span>
            </span>
          </Link>
        )}

        {/* Products */}
        <h2 className="mb-3 mt-2 font-display text-2xl font-bold text-ink">{t("products")}</h2>
        {products.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-sand p-10 text-center font-semibold text-muted">{t("noProducts")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} langShort={sel} byLabel={t("by")} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur" style={{ background: "rgba(255,255,255,.12)" }}>
      <Icon className="size-4 text-turmeric" /> {children}
    </span>
  );
}
