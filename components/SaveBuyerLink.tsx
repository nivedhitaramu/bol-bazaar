"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Lock, MessageCircleHeart, Share2 } from "lucide-react";
import { ClientApiError, postJson } from "@/lib/client/api";
import { play } from "@/lib/client/player";
import { type LocalBuyer, saveBuyer } from "@/lib/client/useBuyer";
import { translator } from "@/lib/i18n";
import { normalizeLang } from "@/lib/languages";

/**
 * "Save my chats" — a private link that restores a buyer's chats and orders on any device.
 * No PIN for buyers. Explained in the buyer's own language.
 */
export function SaveBuyerLink({ buyer, compact = false }: { buyer: LocalBuyer; compact?: boolean }) {
  const lang = normalizeLang(buyer.language);
  const t = translator(lang);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (buyer.key) return;
    let cancelled = false;
    postJson<{ key: string }>("/api/buyer/link", { token: buyer.token })
      .then((r) => {
        if (cancelled) return;
        saveBuyer({ ...buyer, key: r.key });
        play({ text: t("saveChatsHint"), lang });
      })
      .catch((e) => !cancelled && setError(e instanceof ClientApiError && e.code === "migration_needed" ? e.message : t("errorGeneric")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer.id, buyer.key]);

  const link = buyer.key && origin ? `${origin}/buyer/login?k=${buyer.key}` : "";
  const wa = `https://wa.me/?text=${encodeURIComponent(`${t("saveChats")} 🔒\n${link}\n\n${t("saveChatsHint")}`)}`;

  return (
    <section className={`overflow-hidden rounded-3xl border-2 border-leaf/30 bg-white ${compact ? "" : "shadow-sm"}`} aria-label={t("saveChats")}>
      <div className="flex items-center gap-2 bg-leaf px-4 py-2.5 text-white">
        <MessageCircleHeart className="size-5 shrink-0" />
        <h2 className="font-display text-lg font-bold">{t("saveChats")}</h2>
      </div>
      <div className="grid gap-2.5 p-3">
        <p className="flex items-start gap-2 text-sm font-semibold text-ink">
          <Lock className="mt-0.5 size-4 shrink-0 text-leaf" /> {t("saveChatsHint")}
        </p>
        {error && <p className="rounded-xl bg-maroon/10 p-2 text-sm font-bold text-maroon">{error}</p>}
        {!error && !link && <Loader2 className="mx-auto size-5 animate-spin text-leaf" />}
        {link && (
          <>
            <code className="block break-all rounded-xl bg-sand px-3 py-2 text-xs">{link}</code>
            <div className="grid grid-cols-2 gap-2">
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp px-3 text-sm">
                <Share2 className="size-5" /> {t("sendToMyWhatsapp")}
              </a>
              <button
                type="button"
                className="btn btn-ghost px-3 text-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
              >
                {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? t("copied") : t("copyLink")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
