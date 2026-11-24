import type { Metadata, Viewport } from "next";
import {
  Baloo_2,
  Noto_Sans,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  Noto_Sans_Kannada,
  Noto_Sans_Malayalam,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
} from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";
import { ToastProvider } from "@/components/Toast";
import { getServerLang } from "@/lib/serverLang";

const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", display: "swap" });
const baloo = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-baloo", display: "swap" });
const ta = Noto_Sans_Tamil({ variable: "--font-ta", display: "swap", preload: false });
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", display: "swap", preload: false });
const te = Noto_Sans_Telugu({ variable: "--font-te", display: "swap", preload: false });
const kn = Noto_Sans_Kannada({ variable: "--font-kn", display: "swap", preload: false });
const ml = Noto_Sans_Malayalam({ variable: "--font-ml", display: "swap", preload: false });
const bn = Noto_Sans_Bengali({ variable: "--font-bn", display: "swap", preload: false });
const gu = Noto_Sans_Gujarati({ variable: "--font-gu", display: "swap", preload: false });

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getServerLang();
  const fontVars = [noto, baloo, ta, deva, te, kn, ml, bn, gu].map((f) => f.variable).join(" ");
  return (
    <html lang={lang.split("-")[0]} className={fontVars}>
      <body className="min-h-dvh antialiased">
        <LangProvider initial={lang}>
          <ToastProvider>{children}</ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
