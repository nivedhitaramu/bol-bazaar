"use client";
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Lock, Share2 } from "lucide-react";
import { PinPad } from "./PinPad";
import { useToast } from "./Toast";
import { ClientApiError, postJson } from "@/lib/client/api";
import { play } from "@/lib/client/player";
import type { LocalSeller } from "@/lib/client/useSeller";
import { DEMO } from "@/lib/demoIds";
import { translator } from "@/lib/i18n";
import { normalizeLang } from "@/lib/languages";

/**
 * "Save your seller link" (prototype login): a private link to get back into the shop on any phone,
 * sent to her own WhatsApp, then a 4-digit PIN (tapped or spoken) for "I already have a shop".
 * Everything is in the language she speaks.
 */
export function SaveSellerLink({ seller, setSeller }: { seller: LocalSeller; setSeller: (s: LocalSeller | null) => void }) {
  const lang = normalizeLang(seller.language);
  const t = translator(lang);
  const { toast } = useToast();
  const isDemo = seller.id === DEMO.meenaId || seller.id === DEMO.rameshId;
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"link" | "pin1" | "pin2" | "done">("link");
  const [firstPin, setFirstPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // Get (or create) the private link once.
  useEffect(() => {
    if (isDemo || seller.key) return;
    let cancelled = false;
    postJson<{ key: string; token: string; hasPin: boolean }>("/api/auth/setup", { sellerId: seller.id, token: seller.token })
      .then((r) => {
        if (cancelled) return;
        setSeller({ ...seller, key: r.key, token: r.token });
        play({ text: t("saveLinkHint"), lang });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ClientApiError && e.code === "migration_needed" ? e.message : t("errorGeneric"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id, seller.key, isDemo]);

  if (isDemo) return null;

  const link = seller.key && origin ? `${origin}/seller/login?k=${seller.key}` : "";
  const wa = `https://wa.me/?text=${encodeURIComponent(`${t("saveLinkTitle")} 🔒\n${link}\n\n${t("saveLinkHint")}`)}`;

  const savePin = async (pin: string) => {
    if (step === "pin1") {
      setFirstPin(pin);
      setStep("pin2");
      setReset((x) => x + 1);
      return play({ text: t("confirmPin"), lang });
    }
    if (pin !== firstPin) {
      setStep("pin1");
      setFirstPin("");
      setReset((x) => x + 1);
      toast(t("pinMismatch"), "error");
      return play({ text: t("pinMismatch"), lang });
    }
    setBusy(true);
    try {
      await postJson("/api/auth/pin", { sellerId: seller.id, token: seller.token, pin });
      setStep("done");
      toast(`✓ ${t("pinSaved")}`, "success");
      play({ text: t("pinSaved"), lang });
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mb-4 overflow-hidden" aria-label={t("saveLinkTitle")}>
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-cream">
        <KeyRound className="size-6 shrink-0 text-turmeric" />
        <h2 className="font-display text-xl font-bold">{t("saveLinkTitle")}</h2>
      </div>
      <div className="grid gap-3 p-4">
        <p className="flex items-start gap-2 rounded-2xl bg-turmeric-soft p-3 font-semibold text-ink">
          <Lock className="mt-0.5 size-5 shrink-0 text-maroon" /> {t("saveLinkHint")}
        </p>
        {error && <p className="rounded-xl bg-maroon/10 p-3 text-sm font-bold text-maroon">{error}</p>}
        {!error && !link && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="size-5 animate-spin" /> …
          </p>
        )}
        {link && (
          <>
            <code className="block break-all rounded-xl bg-sand px-3 py-2 text-xs">{link}</code>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp text-lg">
              <Share2 className="size-5" /> {t("sendToMyWhatsapp")}
            </a>
            <button
              type="button"
              className="btn btn-ghost"
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

            {step === "link" && (
              <button type="button" className="btn btn-primary text-lg" onClick={() => { setStep("pin1"); play({ text: t("setPinHint"), lang }); }}>
                <Lock className="size-5" /> {t("setPin")}
              </button>
            )}
            {(step === "pin1" || step === "pin2") && (
              <div className="grid gap-2 rounded-2xl bg-cream p-3">
                <p className="text-center font-display text-lg font-bold text-maroon">{step === "pin1" ? t("setPin") : t("confirmPin")}</p>
                {step === "pin1" && <p className="text-center text-sm text-muted">{t("setPinHint")}</p>}
                <PinPad
                  lang={lang}
                  busy={busy}
                  resetKey={reset}
                  onComplete={savePin}
                  labels={{ speak: t("speakDigits"), listening: t("listening"), didntCatch: t("didntCatchDigits"), ok: t("yes") }}
                />
              </div>
            )}
            {step === "done" && (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-leaf/10 p-3 font-bold text-leaf">
                <Check className="size-5" /> {t("pinSaved")}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
