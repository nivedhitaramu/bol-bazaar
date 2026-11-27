import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";
import { ToastProvider } from "@/components/Toast";
import { DemoBanner } from "@/components/DemoBanner";
import { getServerLang } from "@/lib/serverLang";
import { isSupabaseConfigured, sarvamKey } from "@/lib/env";
import { translator } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Bol Bazaar — Sell anywhere in India, just by speaking",
  description:
    "Voice-first commerce for India's small sellers. Speak to list, chat across languages, sell everywhere.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#7a1f2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Fonts load at runtime from Google Fonts (no build-time download → Docker builds work offline-ish);
// if unreachable, the CSS stack falls back to system fonts.
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Noto+Sans:wght@400;500;600;700;800&family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Telugu:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Sans+Gujarati:wght@400;600;700&display=swap";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getServerLang();
  // Evaluated per request at runtime — never at build time.
  const demoMode = !sarvamKey() || !isSupabaseConfigured();
  const t = translator(lang);
  return (
    <html lang={lang.split("-")[0]} style={{ ["--banner-h" as string]: demoMode ? "30px" : "0px" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body className="min-h-dvh antialiased">
        {demoMode && <DemoBanner text={t("demoBanner")} />}
        <LangProvider initial={lang}>
          <ToastProvider>{children}</ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
