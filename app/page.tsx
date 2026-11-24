import Link from "next/link";
import { ArrowLeftRight, ArrowRight, BadgeIndianRupee, FileText, Mic, PlayCircle, ShoppingBag, Store } from "lucide-react";
import { Logo } from "@/components/AppHeader";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LandingLanguages } from "@/components/LandingLanguages";
import { translator } from "@/lib/i18n";
import { getServerLang } from "@/lib/serverLang";

export default async function Home() {
  const lang = await getServerLang();
  const t = translator(lang);
  const steps = [
    { icon: Mic, title: t("stepSpeak"), sub: t("stepSpeakSub"), color: "bg-maroon" },
    { icon: FileText, title: t("stepListed"), sub: t("stepListedSub"), color: "bg-saffron" },
    { icon: BadgeIndianRupee, title: t("stepSold"), sub: t("stepSoldSub"), color: "bg-leaf" },
  ];

  return (
    <div className="min-h-dvh">
      <div className="motif-strip" aria-hidden />
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Logo />
        <div className="ml-auto">
          <LanguagePicker />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16">
        {/* Hero */}
        <section className="relative pt-4 text-center md:pt-10">
          <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full bg-turmeric-soft px-4 py-1.5 text-sm font-bold text-maroon">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-saffron opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-saffron" />
            </span>
            தமிழ் · हिन्दी · తెలుగు · ಕನ್ನಡ · മലയാളം · বাংলা · मराठी · ગુજરાતી · English
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-maroon sm:text-6xl">
            Bol Bazaar
            <span className="mt-2 block text-3xl text-ink sm:text-5xl">
              Sell anywhere in India, <span className="text-saffron">just by speaking.</span>
            </span>
          </h1>
          {lang !== "en-IN" && <p className="mt-4 text-xl font-semibold text-ink/80">{t("tagline")}</p>}

          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            <Link
              href="/seller"
              className="group relative flex min-h-40 flex-col items-start justify-end overflow-hidden rounded-[2rem] bg-maroon p-6 text-left text-white shadow-2xl transition active:scale-[0.98]"
            >
              <span className="motif absolute inset-0 opacity-30" aria-hidden />
              <Store className="absolute right-5 top-5 size-16 text-turmeric/90 transition group-hover:scale-110" aria-hidden />
              <span className="relative font-display text-3xl font-extrabold">{t("seller")}</span>
              <span className="relative flex items-center gap-1 text-white/80">
                {t("sellerSub")} <ArrowRight className="size-4" />
              </span>
            </Link>
            <Link
              href="/shop"
              className="group relative flex min-h-40 flex-col items-start justify-end overflow-hidden rounded-[2rem] bg-saffron p-6 text-left text-white shadow-2xl transition active:scale-[0.98]"
            >
              <span className="motif absolute inset-0 opacity-30" aria-hidden />
              <ShoppingBag className="absolute right-5 top-5 size-16 text-white/90 transition group-hover:scale-110" aria-hidden />
              <span className="relative font-display text-3xl font-extrabold">{t("buyer")}</span>
              <span className="relative flex items-center gap-1 text-white/90">
                {t("buyerSub")} <ArrowRight className="size-4" />
              </span>
            </Link>
          </div>

          <Link href="/demo" className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 font-bold text-cream shadow-lg transition hover:bg-ink/90">
            <PlayCircle className="size-5 text-turmeric" /> {t("demo")}: தமிழ் <ArrowLeftRight className="size-4" /> हिन्दी
          </Link>
        </section>

        {/* Steps */}
        <section className="mt-14" aria-label="How it works">
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="card relative flex items-center gap-4 p-5 sm:flex-col sm:text-center">
                <span className={`grid size-16 shrink-0 place-items-center rounded-2xl ${s.color} text-white shadow-lg`}>
                  <s.icon className="size-8" />
                </span>
                <div>
                  <p className="font-display text-2xl font-bold text-ink">
                    <span className="mr-1 text-muted">{i + 1}.</span>
                    {s.title}
                  </p>
                  <p className="text-sm text-muted">{s.sub}</p>
                </div>
                {i < 2 && <ArrowRight className="absolute -right-4 top-1/2 hidden size-6 -translate-y-1/2 text-saffron sm:block" aria-hidden />}
              </li>
            ))}
          </ol>
        </section>

        {/* Language */}
        <section className="mx-auto mt-14 max-w-xl" aria-label={t("chooseLang")}>
          <h2 className="mb-3 text-center font-display text-2xl font-bold text-maroon">{t("chooseLang")}</h2>
          <LandingLanguages />
        </section>

        <footer className="mt-16 text-center text-sm text-muted">
          <p>
            Built for <b>India Runs on Voice</b> (Scaler × Wispr) · Small Business track · Powered by Sarvam AI
          </p>
          <p className="mt-1">
            by <a className="font-semibold text-maroon underline" href="https://github.com/nivedhitaramu">Nivedhita R</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
