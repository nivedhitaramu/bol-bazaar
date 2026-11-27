"use client";
import Link from "next/link";
import { ArrowRight, Ear, MessageCircleQuestion, PackageCheck, PackagePlus, Store } from "lucide-react";

/**
 * The /demo story, in order. Steps 3–4 happen on this page (split screen); the others open
 * in a new tab already signed in as Meena (?demo=1), so the split screen stays put.
 */
const STEPS = [
  { n: 1, icon: Store, title: "Speak your shop", sub: "60 s of talking → a 3-language storefront", href: "/seller/shop-setup?demo=1" },
  { n: 2, icon: PackagePlus, title: "List by voice", sub: "Photo + speak → listing, price read back", href: "/seller/new?demo=1" },
  { n: 3, icon: Ear, title: "Hands-free chat", sub: "Turn on “Hands-free” below: Hindi ⇄ Tamil", href: "#chat" },
  { n: 4, icon: PackageCheck, title: "Voice order confirm", sub: "Seller panel: “ஆர்டரை உறுதி செய்”", href: "#orders" },
  { n: 5, icon: MessageCircleQuestion, title: "Ask your shop", sub: "“Indru enna aachu?” → spoken summary", href: "/seller?demo=1" },
] as const;

export function DemoStory() {
  return (
    <nav aria-label="Demo story" className="border-b border-sand bg-cream/80 px-3 py-2">
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const local = s.href.startsWith("#");
          const inner = (
            <>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-maroon text-sm font-extrabold text-white">{s.n}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-extrabold text-ink">
                  <s.icon className="size-4 text-saffron" aria-hidden /> {s.title}
                </span>
                <span className="block truncate text-xs text-muted">{s.sub}</span>
              </span>
            </>
          );
          const cls = `flex min-h-14 w-[13.25rem] shrink-0 items-center gap-2 rounded-2xl border-2 px-2.5 py-1.5 transition hover:border-saffron ${
            local ? "border-leaf/50 bg-leaf/5" : "border-sand bg-white"
          }`;
          return (
            <li key={s.n} className="flex shrink-0 items-center gap-2">
              {local ? (
                <a href={s.href} className={cls} onClick={(e) => { e.preventDefault(); document.getElementById(s.href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                  {inner}
                </a>
              ) : (
                <Link href={s.href} target="_blank" className={cls}>
                  {inner}
                </Link>
              )}
              {i < STEPS.length - 1 && <ArrowRight className="size-4 shrink-0 text-saffron" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
