"use client";
import Link from "next/link";
import { Mic, Store, ShoppingBag, MessageCircle } from "lucide-react";
import { LanguagePicker } from "./LanguagePicker";
import { useLang } from "./LangProvider";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="flex min-h-14 items-center gap-2" aria-label="Bol Bazaar home">
      <span className={`grid place-items-center rounded-xl bg-maroon text-turmeric ${small ? "size-9" : "size-10"}`}>
        <Mic className="size-5" />
      </span>
      <span className={`font-display font-extrabold leading-none text-maroon ${small ? "text-xl" : "text-2xl"}`}>
        Bol<span className="text-saffron">Bazaar</span>
      </span>
    </Link>
  );
}

export function AppHeader({ back }: { back?: React.ReactNode }) {
  const { t } = useLang();
  return (
    <header
      className="sticky z-40 border-b border-sand/80 bg-cream/90 backdrop-blur"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        {back}
        <Logo small />
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/shop" className="hidden min-h-14 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-sand sm:flex">
            <ShoppingBag className="size-4 text-maroon" /> {t("shop")}
          </Link>
          <Link href="/buyer" className="hidden min-h-14 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-sand sm:flex">
            <MessageCircle className="size-4 text-maroon" /> {t("myChats")}
          </Link>
          <Link href="/seller" className="hidden min-h-14 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-sand sm:flex">
            <Store className="size-4 text-maroon" /> {t("myShop")}
          </Link>
          <Link href="/shop" className="grid size-14 place-items-center rounded-full hover:bg-sand sm:hidden" aria-label={t("shop")}>
            <ShoppingBag className="size-5 text-maroon" />
          </Link>
          <Link href="/buyer" className="grid size-14 place-items-center rounded-full hover:bg-sand sm:hidden" aria-label={t("myChats")}>
            <MessageCircle className="size-5 text-maroon" />
          </Link>
          <Link href="/seller" className="grid size-14 place-items-center rounded-full hover:bg-sand sm:hidden" aria-label={t("myShop")}>
            <Store className="size-5 text-maroon" />
          </Link>
          <LanguagePicker compact />
        </nav>
      </div>
    </header>
  );
}
