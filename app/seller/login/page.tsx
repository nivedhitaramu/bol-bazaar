"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, MapPin, Search, Store } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FieldMic } from "@/components/FieldMic";
import { PinPad } from "@/components/PinPad";
import { useLang } from "@/components/LangProvider";
import { useSeller, type LocalSeller } from "@/lib/client/useSeller";
import { play } from "@/lib/client/player";
import { canonicalName } from "@/lib/ask/rules";

type ShopRow = { id: string; name: string; city: string | null; shopNames: string[] };
type LoginOk = { seller: Omit<LocalSeller, "token" | "key">; token: string };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();

/** "I already have a shop" — prototype login: private link (?k=…) or shop name + 4-digit PIN. */
export default function SellerLoginPage() {
  const { lang, t } = useLang();
  const router = useRouter();
  const { setSeller } = useSeller();
  const [mode, setMode] = useState<"checking" | "link" | "search">("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<ShopRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);

  const finish = (r: LoginOk, key?: string) => {
    setSeller({ ...r.seller, token: r.token, ...(key ? { key } : {}) });
    router.replace("/seller");
  };

  // Private link: /seller/login?k=… logs straight in.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("k");
    if (!key) return setMode("search");
    setMode("link");
    fetch("/api/auth/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.code === "migration_needed" ? j.error : t("badLink"));
        finish(j as LoginOk, key);
      })
      .catch((e) => {
        setLinkError((e as Error).message);
        setMode("search");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "search" || shops) return;
    fetch("/api/auth/sellers")
      .then((r) => r.json())
      .then((j) => setShops(j.sellers ?? []))
      .catch(() => setShops([]));
  }, [mode, shops]);

  // Match the spoken/typed shop name in any script (Meena / मीना / மீனா).
  const results = useMemo(() => {
    if (!shops) return [];
    const nq = norm(q);
    if (!nq) return shops;
    const canonQ = norm(canonicalName(q.trim()));
    return shops.filter((s) =>
      [s.name, canonicalName(s.name), s.city ?? "", ...s.shopNames].some((x) => {
        const nx = norm(x);
        return nx && (nx.includes(nq) || nq.includes(nx) || nx.includes(canonQ));
      })
    );
  }, [shops, q]);

  const login = async (pin: string) => {
    if (!picked) return;
    setBusy(true);
    setPinError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: picked.id, pin }),
      });
      const j = await r.json();
      if (r.ok) return finish(j as LoginOk);
      const msg = j.code === "locked" ? t("lockedOut") : j.code === "wrong_pin" ? `${t("wrongPin")} ${j.triesLeft}` : t("errorGeneric");
      setPinError(msg);
      setReset((x) => x + 1);
      play({ text: msg, lang });
    } catch {
      setPinError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md px-4 pb-16 pt-4">
        <h1 className="mb-4 flex items-center gap-2 font-display text-2xl font-bold text-maroon">
          <KeyRound className="size-6 text-saffron" /> {t("haveShop")}
        </h1>

        {(mode === "checking" || mode === "link") && (
          <p className="card flex items-center justify-center gap-2 p-8 font-semibold text-muted">
            <Loader2 className="size-6 animate-spin" /> {t("loggingIn")}
          </p>
        )}
        {linkError && <p className="mb-4 rounded-2xl bg-maroon/10 p-3 font-bold text-maroon">{linkError}</p>}

        {mode === "search" && !picked && (
          <section className="card grid gap-3 p-4">
            <label className="grid gap-1">
              <span className="text-sm font-bold text-muted">{t("findYourShop")}</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                  <input className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)} lang={lang.split("-")[0]} />
                </div>
                <FieldMic lang={lang} label={t("findYourShop")} onText={setQ} />
              </div>
            </label>
            {!shops && <Loader2 className="mx-auto size-6 animate-spin text-maroon" />}
            {shops && results.length === 0 && <p className="text-center text-muted">{shops.length ? "—" : t("noShopsWithPin")}</p>}
            <ul className="grid gap-2">
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(s);
                      play({ text: t("enterPin"), lang });
                    }}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-sand bg-white px-3 py-2 text-left hover:border-saffron"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-maroon font-display text-lg font-bold text-white">{s.name.slice(0, 1)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{s.shopNames[0] ?? s.name}</span>
                      <span className="flex items-center gap-1 text-sm text-muted">
                        <Store className="size-3.5" /> {s.name}
                        {s.city && (
                          <>
                            <MapPin className="ml-1 size-3.5" /> {s.city}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {mode === "search" && picked && (
          <section className="card grid gap-3 p-4">
            <button type="button" onClick={() => { setPicked(null); setPinError(null); }} className="flex min-h-14 items-center gap-2 font-semibold text-muted">
              <ArrowLeft className="size-5" /> {picked.shopNames[0] ?? picked.name}
            </button>
            <p className="text-center font-display text-xl font-bold text-maroon">{t("enterPin")}</p>
            <PinPad
              lang={lang}
              busy={busy}
              error={pinError}
              resetKey={reset}
              onComplete={login}
              labels={{ speak: t("speakDigits"), listening: t("listening"), didntCatch: t("didntCatchDigits"), ok: t("yes") }}
            />
          </section>
        )}

        <Link href="/seller?demo=1" className="btn btn-ghost mt-4 w-full">
          {t("useDemoSeller")}
        </Link>
      </main>
    </>
  );
}
