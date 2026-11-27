"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useLang } from "@/components/LangProvider";
import { saveBuyer } from "@/lib/client/useBuyer";

/** Opening a "Save my chats" link (/buyer/login?k=…) restores the buyer's chats and orders on this device. */
export default function BuyerLoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("k");
    if (!key) return setError(t("badLink"));
    fetch("/api/buyer/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.code === "migration_needed" ? j.error : t("badLink"));
        saveBuyer({ ...j.buyer, token: j.token, key });
        router.replace("/buyer");
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {error ? (
          <div className="card grid gap-4 p-5 text-center">
            <p className="font-bold text-maroon">{error}</p>
            <Link href="/shop" className="btn btn-primary">
              <ShoppingBag className="size-5" /> {t("browseShop")}
            </Link>
          </div>
        ) : (
          <p className="card flex items-center justify-center gap-2 p-8 font-semibold text-muted">
            <Loader2 className="size-6 animate-spin" /> {t("loggingIn")}
          </p>
        )}
      </main>
    </>
  );
}
