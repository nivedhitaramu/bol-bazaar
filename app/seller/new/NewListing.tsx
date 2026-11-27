"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mic,
  RefreshCw,
  Save,
  Send,
  Share2,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { useVoiceErrorHandler, VoiceCapture } from "@/components/VoiceCapture";
import { HandsFreeStatus, HandsFreeToggle } from "@/components/HandsFree";
import { useHandsFree } from "@/lib/client/useHandsFree";
import { downscaleImage, postJson, postVoice, uploadFile } from "@/lib/client/api";
import { play, stopAudio } from "@/lib/client/player";
import type { LocalSeller } from "@/lib/client/useSeller";
import type { VoiceResult } from "@/lib/client/useVoiceInput";
import { CATEGORIES, langInfo, shortOf } from "@/lib/languages";
import { SpeakLangPicker } from "@/components/LanguagePicker";
import { useSpeakLang } from "@/lib/client/useSpeakLang";
import type { I18nKey } from "@/lib/i18n";
import { formatINR, type Listing, type ProductDraft } from "@/lib/types";

type DraftResponse = {
  transcript?: string;
  draft: ProductDraft;
  missing: string[];
  listing: Listing;
  readback: string;
  change?: string;
  audio: string | null;
  mime: string | null;
  sources: Record<string, string>;
};

const FIELD_LABEL: Record<keyof ProductDraft, I18nKey> = {
  product_name: "productName",
  price: "price",
  quantity: "quantity",
  category: "category",
  material: "material",
  size_options: "sizes",
  craft_story: "story",
};

export function NewListing({ seller, setSeller }: { seller: LocalSeller; setSeller: (s: LocalSeller | null) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { speakLang: sellerLang, setSpeakLang } = useSpeakLang(seller, setSeller);
  const sellerShort = shortOf(sellerLang);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadP = useRef<Promise<string | null> | null>(null);

  const [busy, setBusy] = useState<null | "create" | "edit" | "regen" | "save">(null);
  const [res, setRes] = useState<DraftResponse | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<string>(sellerShort);
  const [speaking, setSpeaking] = useState(false);
  const [published, setPublished] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    const p = (async () => {
      try {
        const small = await downscaleImage(file);
        const url = await uploadFile(small, "product-photos", "photo.jpg");
        setPhotoUrl(url);
        return url;
      } catch {
        toast(t("errorGeneric"), "error");
        return null;
      } finally {
        setUploading(false);
      }
    })();
    uploadP.current = p;
  };

  const readBack = (r: { audio: string | null; mime: string | null; readback: string }) => {
    play(
      { base64: r.audio, mime: r.mime, text: r.readback, lang: sellerLang },
      {
        onStart: () => setSpeaking(true),
        onEnd: (fb) => {
          setSpeaking(false);
          if (fb && !r.audio) toast(t("fallbackVoice"));
        },
      }
    );
  };

  const apply = (r: DraftResponse) => {
    setRes(r);
    setDraft(r.draft);
    setDirty(false);
    if (r.sources.extract === "heuristic" || r.sources.listing === "heuristic" || r.sources.edit === "heuristic")
      toast(t("keyNotSet"));
    readBack(r);
  };

  const create = async (input: VoiceResult) => {
    setBusy("create");
    try {
      const r = await postVoice<DraftResponse>("/api/listing/draft", input, {
        mode: "create",
        language: sellerLang,
        sellerId: seller.id,
        gender: seller.gender,
      });
      apply(r);
      setTab(sellerShort);
    } finally {
      setBusy(null);
    }
  };

  const edit = async (input: VoiceResult) => {
    if (!draft || !res) return;
    setBusy("edit");
    try {
      const r = await postVoice<DraftResponse>("/api/listing/draft", input, {
        mode: "edit",
        language: sellerLang,
        sellerId: seller.id,
        gender: seller.gender,
        draft: JSON.stringify(draft),
        listing: dirty ? undefined : JSON.stringify(res.listing),
      });
      apply(r);
      if (r.change && r.change !== "no change") toast(`✓ ${r.change}`, "success");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    if (!draft) return;
    setBusy("regen");
    try {
      const r = await postVoice<DraftResponse>("/api/listing/draft", {}, {
        mode: "regenerate",
        language: sellerLang,
        sellerId: seller.id,
        gender: seller.gender,
        draft: JSON.stringify(draft),
        text: "-",
      });
      apply(r);
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setBusy(null);
    }
  };

  const save = async (status: "draft" | "published") => {
    if (!draft || !res) return;
    if (status === "published" && (!draft.product_name || draft.price == null)) {
      toast(`${t("missing")}: ${!draft.product_name ? t("productName") : t("price")}`, "error");
      return;
    }
    setBusy("save");
    try {
      const url = uploadP.current ? await uploadP.current : photoUrl;
      const r = await postJson<{ id: string }>("/api/products", {
        sellerId: seller.id,
        draft,
        listing: res.listing,
        photoUrl: url,
        status,
        productId: published?.id,
      });
      const link = `${window.location.origin}/product/${r.id}`;
      setPublished({ id: r.id, url: link });
      stopAudio();
      toast(status === "published" ? t("published") : t("saved"), "success");
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setBusy(null);
    }
  };

  const setField = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    if (k !== "price" && k !== "quantity") setDirty(true);
  };

  const isMissing = (k: keyof ProductDraft) => {
    const v = draft?.[k];
    return v == null || v === "" || (Array.isArray(v) && v.length === 0);
  };

  const listingTabs = res ? Object.keys(res.listing) : [];
  const shown = res ? (res.listing[tab] ?? res.listing.en) : null;

  // ─────────── Hands-free: first utterance creates the listing, later ones edit it ───────────
  const onVoiceError = useVoiceErrorHandler();
  const [handsFree, setHandsFree] = useState(false);
  const hf = useHandsFree({
    id: "new-listing",
    enabled: handsFree && !published,
    busy: busy !== null,
    lang: sellerLang,
    onUtterance: async (input) => {
      try {
        if (res && draft) await edit(input);
        else await create(input);
      } catch (e) {
        onVoiceError(e);
      }
    },
    onTooQuiet: () => {
      toast(t("comeCloser"));
      play({ text: t("comeCloser"), lang: sellerLang });
    },
    onStop: (reason) => {
      setHandsFree(false);
      if (reason === "mic") toast(t("errorMic"), "error");
    },
  });
  const hfPhase: "sending" | "speaking" | null = busy ? "sending" : hf.playing || speaking ? "speaking" : null;

  // ─────────── Published ───────────
  if (published && res && draft) {
    const titleSeller = res.listing[sellerShort]?.title ?? res.listing.en?.title ?? draft.product_name ?? "";
    const titleEn = res.listing.en?.title ?? "";
    const msg = `${titleSeller}${titleEn && titleEn !== titleSeller ? `\n${titleEn}` : ""} — ${formatINR(draft.price)}\n${published.url}`;
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="card overflow-hidden text-center">
          {(photoPreview || photoUrl) && <img src={photoPreview ?? photoUrl!} alt="" className="aspect-[4/3] w-full object-cover" />}
          <div className="p-6">
            <div className="mx-auto -mt-14 mb-3 grid size-16 place-items-center rounded-full border-4 border-white bg-leaf text-white shadow-lg">
              <Check className="size-8" />
            </div>
            <h1 className="font-display text-2xl font-bold text-maroon">{t("published")}</h1>
            <p className="mt-1 text-lg font-semibold">{titleSeller}</p>
            <p className="text-2xl font-extrabold text-saffron">{formatINR(draft.price)}</p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-sand px-3 py-2 text-left text-sm">
              <span className="truncate">{published.url}</span>
            </div>
            <div className="mt-4 grid gap-3">
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp text-lg">
                <Share2 className="size-5" /> {t("shareWhatsapp")}
              </a>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(published.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
              >
                {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? t("copied") : t("copyLink")}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <Link href={`/product/${published.id}`} className="btn btn-ghost">
                  <ExternalLink className="size-5" /> {t("shop")}
                </Link>
                <Link href="/seller" className="btn btn-primary">
                  {t("myShop")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-maroon">
          <Sparkles className="size-6 text-saffron" /> {t("newProduct")}
        </h1>
        <SpeakLangPicker value={sellerLang} onChange={setSpeakLang} />
      </div>

      <div className="mb-4">
        <HandsFreeToggle on={handsFree} onChange={setHandsFree} label={t("handsFree")} hint={t("handsFreeHint")} />
        {handsFree && (
          <div className="card mt-3 flex flex-col items-center gap-1 px-4 py-4 text-center">
            <HandsFreeStatus
              state={hf.state}
              phase={hfPhase}
              level={hf.level}
              interim={hf.interim}
              labels={{ listening: t("listening"), sending: t("sending"), speaking: t("speaking") }}
            />
            <p className="text-sm text-muted">{res ? t("editHint") : t("speakHint")}</p>
          </div>
        )}
      </div>

      {/* 1. Photo */}
      <section className="card mb-4 p-4" aria-label={t("photo")}>
        <div className="flex items-center gap-4">
          <div className="relative grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-saffron/60 bg-turmeric-soft">
            {photoPreview ? (
              <img src={photoPreview} alt={t("photo")} className="size-full object-cover" />
            ) : (
              <Camera className="size-10 text-saffron" />
            )}
            {uploading && (
              <div className="absolute inset-0 grid place-items-center bg-white/60">
                <Loader2 className="size-6 animate-spin text-maroon" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <p className="font-bold">
              <span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-maroon text-sm text-white">1</span>
              {t("photo")}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => camRef.current?.click()} className="btn btn-saffron flex-1 px-3" aria-label={t("takePhoto")}>
                <Camera className="size-5" />
              </button>
              <button type="button" onClick={() => galRef.current?.click()} className="btn btn-ghost flex-1 px-3" aria-label={t("takePhoto")}>
                <ImagePlus className="size-5" />
              </button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
          </div>
        </div>
      </section>

      {/* 2. Speak */}
      {!res && (
        <section className="card motif mb-4 px-4 py-8" aria-label={t("speakAboutProduct")}>
          <p className="mb-1 text-center font-bold">
            <span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-maroon text-sm text-white">2</span>
            {t("speakAboutProduct")}
          </p>
          <p className="mb-6 text-center text-sm text-muted">{t("speakHint")}</p>
          <VoiceCapture
            lang={sellerLang}
            onInput={create}
            busy={busy === "create"}
            busyLabel={t("thinking")}
            multiline
            textPlaceholder={t("speakHint")}
          />
          <p className="mt-4 text-center text-xs text-muted">
            {langInfo(sellerLang).native} · e.g. “இது காஞ்சிபுரம் பட்டுப் புடவை, விலை எட்டாயிரத்து ஐநூறு ரூபாய், மூன்று பீஸ் இருக்கு…”
          </p>
        </section>
      )}

      {/* 3. Review */}
      {res && draft && (
        <>
          {res.transcript && (
            <div className="mb-4 rounded-2xl bg-sand/70 px-4 py-3 text-sm">
              <span className="font-bold text-maroon">{t("heardYou")}: </span>
              <span className="italic">“{res.transcript}”</span>
            </div>
          )}

          <section className="card mb-4 overflow-hidden" aria-label={t("listingPreview")}>
            <div className="flex items-center justify-between gap-2 border-b border-sand px-4 py-3">
              <h2 className="font-display text-lg font-bold text-maroon">{t("listingPreview")}</h2>
              <div className="flex gap-1" role="tablist">
                {listingTabs.map((c) => (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={tab === c}
                    onClick={() => setTab(c)}
                    className={`min-h-14 rounded-full px-3 text-sm font-bold ${tab === c ? "bg-maroon text-white" : "bg-sand"}`}
                  >
                    {langInfo(`${c}-IN`).native}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4 p-4 sm:flex-row">
              {(photoPreview || photoUrl) && (
                <img src={photoPreview ?? photoUrl!} alt="" className="aspect-square w-full rounded-2xl object-cover sm:w-40" />
              )}
              <div className="flex-1">
                <p className="text-xl font-bold leading-snug">{shown?.title}</p>
                <p className="mt-1 text-2xl font-extrabold text-saffron">{formatINR(draft.price)}</p>
                <div className="mt-2 space-y-1 text-[15px] leading-relaxed">
                  {shown?.description.split("\n").map((line, i) => <p key={i}>{line}</p>)}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {shown?.tags.map((tg) => (
                    <span key={tg} className="rounded-full bg-turmeric-soft px-2.5 py-1 text-xs font-semibold text-maroon">
                      #{tg}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-sand px-4 py-3">
              <button onClick={() => readBack(res)} disabled={speaking} className="btn btn-ghost min-h-14 flex-1">
                {speaking ? (
                  <span className="eq text-maroon">
                    <span /><span /><span /><span />
                  </span>
                ) : (
                  <Volume2 className="size-5" />
                )}
                {speaking ? t("speaking") : t("readAloud")}
              </button>
              {dirty && (
                <button onClick={regenerate} disabled={!!busy} className="btn btn-ghost min-h-14 flex-1">
                  {busy === "regen" ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />}
                  {t("listingPreview")}
                </button>
              )}
            </div>
          </section>

          {/* Voice edit */}
          <section className="card mb-4 p-5" aria-label={t("editByVoice")}>
            <div className="flex flex-col items-center gap-1">
              <p className="flex items-center gap-2 font-bold">
                <Mic className="size-5 text-maroon" /> {t("editByVoice")}
              </p>
              <p className="mb-2 text-sm text-muted">{t("editHint")}</p>
              <VoiceCapture lang={sellerLang} onInput={edit} busy={busy === "edit"} size="lg" hint=" " textPlaceholder={t("editHint")} />
            </div>
          </section>

          {/* Fields */}
          <section className="card mb-4 grid gap-3 p-4" aria-label="Details">
            {res.missing.length > 0 && (
              <p className="rounded-xl bg-turmeric-soft px-3 py-2 text-sm font-semibold text-ink">
                ⚠ {t("missing")}: {res.missing.map((m) => t(FIELD_LABEL[m as keyof ProductDraft] ?? "name")).join(", ")}
              </p>
            )}
            <Field label={t("productName")} missing={isMissing("product_name")}>
              <input
                className={`input ${isMissing("product_name") ? "missing" : ""}`}
                value={draft.product_name ?? ""}
                onChange={(e) => setField("product_name", e.target.value || null)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("price")} (₹)`} missing={isMissing("price")}>
                <input
                  className={`input text-lg font-bold ${isMissing("price") ? "missing" : ""}`}
                  inputMode="numeric"
                  value={draft.price ?? ""}
                  onChange={(e) => {
                    const n = e.target.value.replace(/\D/g, "");
                    setField("price", n ? Number(n) : null);
                  }}
                />
              </Field>
              <Field label={t("quantity")} missing={isMissing("quantity")}>
                <input
                  className={`input text-lg font-bold ${isMissing("quantity") ? "missing" : ""}`}
                  inputMode="numeric"
                  value={draft.quantity ?? ""}
                  onChange={(e) => {
                    const n = e.target.value.replace(/\D/g, "");
                    setField("quantity", n ? Number(n) : null);
                  }}
                />
              </Field>
            </div>
            <Field label={t("category")} missing={isMissing("category")}>
              <select
                className={`input ${isMissing("category") ? "missing" : ""}`}
                value={draft.category ?? ""}
                onChange={(e) => setField("category", e.target.value || null)}
              >
                <option value="">—</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("material")} missing={isMissing("material")}>
              <input
                className={`input ${isMissing("material") ? "missing" : ""}`}
                value={draft.material ?? ""}
                onChange={(e) => setField("material", e.target.value || null)}
              />
            </Field>
            <Field label={t("sizes")} missing={isMissing("size_options")}>
              <input
                className={`input ${isMissing("size_options") ? "missing" : ""}`}
                value={(draft.size_options ?? []).join(", ")}
                placeholder="S, M, L"
                onChange={(e) =>
                  setField(
                    "size_options",
                    e.target.value
                      ? e.target.value.split(",").map((s) => s.trimStart())
                      : null
                  )
                }
              />
            </Field>
            <Field label={t("story")} missing={isMissing("craft_story")}>
              <textarea
                rows={3}
                className={`input resize-none ${isMissing("craft_story") ? "missing" : ""}`}
                value={draft.craft_story ?? ""}
                onChange={(e) => setField("craft_story", e.target.value || null)}
              />
            </Field>
          </section>

          {/* Actions */}
          <div
            className="sticky z-30 -mx-4 flex gap-3 border-t border-sand bg-cream/95 px-4 py-3 backdrop-blur"
            style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <button onClick={() => save("draft")} disabled={!!busy} className="btn btn-ghost flex-1">
              <Save className="size-5" /> {t("saveDraft")}
            </button>
            <button onClick={() => save("published")} disabled={!!busy} className="btn btn-primary flex-[2] text-lg">
              {busy === "save" ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} {t("publish")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, missing, children }: { label: string; missing?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-1.5 text-sm font-bold text-muted">
        {label}
        {missing && <span className="size-2 rounded-full bg-turmeric" aria-label="missing" />}
      </span>
      {children}
    </label>
  );
}
