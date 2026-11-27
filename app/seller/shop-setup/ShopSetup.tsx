"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RotateCcw, Share2, Store, Volume2 } from "lucide-react";
import { MicButton } from "@/components/MicButton";
import { FieldMic } from "@/components/FieldMic";
import { LaunchSequence, type LaunchStage } from "@/components/LaunchSequence";
import { useToast } from "@/components/Toast";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { ClientApiError, postJson, postVoice, SwitchedToBrowserStt } from "@/lib/client/api";
import { play } from "@/lib/client/player";
import type { LocalSeller } from "@/lib/client/useSeller";
import { translator, type I18nKey } from "@/lib/i18n";
import { normalizeLang, shortOf } from "@/lib/languages";
import { parseAmount } from "@/lib/numbers";
import type { ShopDraft, ShopProfile } from "@/lib/types";

type ExtractRes = { transcript: string; draft: ShopDraft; missing: string[]; fromProfile: string[]; source: string };
type PublishRes = { shop: ShopProfile; path: string; readback: string; audio: string | null; mime: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Keep each animation step on screen long enough to read. */
const atLeast = <T,>(p: Promise<T>, ms: number) => Promise.all([p, sleep(ms)]).then(([v]) => v);

const FIELD_LABEL: Record<keyof ShopDraft, I18nKey> = {
  shop_name: "shopName",
  owner_name: "ownerName",
  city: "city",
  craft: "craft",
  years_of_experience: "yearsLabel",
  story: "story",
  specialties: "specialtiesLabel",
  price_range: "priceRange",
  phone: "phoneLabel",
};

export function ShopSetup({ seller }: { seller: LocalSeller }) {
  const lang = normalizeLang(seller.language);
  const t = translator(lang); // her language, whatever the UI language is
  const { toast } = useToast();
  const [stage, setStage] = useState<LaunchStage>(0);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShopDraft | null>(null);
  const [fromProfile, setFromProfile] = useState<string[]>([]);
  const [live, setLive] = useState<PublishRes | null>(null);

  const fail = (e: unknown) => {
    setStage(0);
    if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`);
    else if (e instanceof ClientApiError && e.code === "migration_needed") toast(t("migrationNeeded"), "error");
    else toast(t("errorGeneric"), "error");
  };

  const publish = async (d: ShopDraft, tr: string | null) => {
    setStage(3);
    const r = await atLeast(postJson<PublishRes>("/api/shop/publish", { sellerId: seller.id, draft: d, transcript: tr, language: lang }), 1600);
    setLive(r);
    setStage(4);
    play(
      { base64: r.audio, mime: r.mime, text: r.readback, lang },
      { onEnd: (fallback) => fallback && !r.audio && toast(t("fallbackVoice")) }
    );
  };

  const run = async (input: VoiceResult) => {
    setBusy(true);
    try {
      setStage(2);
      const ex = await atLeast(postVoice<ExtractRes>("/api/shop/extract", input, { sellerId: seller.id, language: lang }), 1200);
      setTranscript(ex.transcript);
      setDraft(ex.draft);
      setFromProfile(ex.fromProfile);
      if (ex.source === "heuristic") toast(t("keyNotSet"));
      await publish(ex.draft, ex.transcript);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await publish(draft, transcript);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoiceInput({
    lang,
    maxMs: 60_000,
    onStart: () => {
      setLive(null);
      setStage(1);
    },
    onResult: run,
    onError: (k) => {
      setStage(0);
      if (k !== "short") toast(t("errorMic"), "error");
    },
  });

  const set = <K extends keyof ShopDraft>(k: K, v: ShopDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const isMissing = (k: keyof ShopDraft) => {
    const v = draft?.[k];
    if (k === "price_range") return !draft?.price_range || (draft.price_range.min == null && draft.price_range.max == null);
    return v == null || v === "" || (Array.isArray(v) && v.length === 0);
  };

  const url = live && typeof window !== "undefined" ? `${window.location.origin}${live.path}` : "";
  const shopName = live ? (live.shop.i18n[shortOf(lang)]?.shop_name ?? live.shop.i18n.en.shop_name) : "";
  const waText = live ? `${shopName}\n${live.shop.i18n[shortOf(lang)]?.tagline ?? ""}\n${url}` : "";
  const recording = voice.state === "recording";
  const secondsLeft = Math.max(0, Math.ceil((voice.maxMs - voice.elapsed) / 1000));

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold text-maroon">
        <Store className="size-6 text-saffron" /> {t("speakYourShop")}
      </h1>
      <p className="mb-5 text-sm text-muted">{t("shopSetupHint")}</p>

      {/* The one big mic */}
      {stage < 2 && (
        <section className="card motif mb-4 flex flex-col items-center gap-2 px-4 py-8 text-center">
          <MicButton
            size="xl"
            state={busy || voice.state === "processing" ? "busy" : recording ? "recording" : "idle"}
            level={voice.level}
            progress={voice.elapsed / voice.maxMs}
            onPress={voice.toggle}
            label={recording ? t("stop") : t("tapToSpeak")}
          />
          <p className={`min-h-6 font-semibold ${recording ? "text-saffron" : "text-muted"}`}>
            {recording ? `${t("listening")} ${secondsLeft}s` : t("tapToSpeak")}
          </p>
          {voice.interim && <p className="max-w-md text-sm italic text-muted">“{voice.interim}”</p>}
          {!recording && (
            <p className="max-w-sm text-xs text-muted">
              “I am Meena, I weave Kanchipuram silk for 20 years, my sarees start at 5000…”
            </p>
          )}
          <TypeInstead onSend={(text) => run({ text })} disabled={busy} t={t} />
        </section>
      )}

      {stage >= 1 && (
        <div className="mb-4">
          <LaunchSequence
            stage={stage}
            level={voice.level}
            seconds={recording ? secondsLeft : undefined}
            labels={{ listening: t("listening"), understanding: t("understanding"), writing: t("writing3"), live: t("shopLive") }}
          />
        </div>
      )}

      {/* Live! */}
      {live && stage === 4 && (
        <section className="card mb-4 overflow-hidden">
          <div className="motif bg-maroon px-5 py-6 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-turmeric">{t("shopLive")}</p>
            <p className="font-display text-3xl font-extrabold leading-tight">{shopName}</p>
            <p className="mt-1 text-white/85">{live.shop.i18n[shortOf(lang)]?.tagline}</p>
          </div>
          <div className="grid gap-3 p-4">
            <p className="flex items-start gap-2 rounded-2xl bg-sand/70 px-3 py-2 text-sm">
              <Volume2 className="mt-0.5 size-4 shrink-0 text-maroon" /> {live.readback}
            </p>
            <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp text-lg">
              <Share2 className="size-5" /> {t("shareShop")}
            </a>
            <div className="grid grid-cols-2 gap-3">
              <Link href={live.path} className="btn btn-primary">
                <ExternalLink className="size-5" /> {t("viewShop")}
              </Link>
              <button
                onClick={() => {
                  setStage(0);
                  setLive(null);
                }}
                className="btn btn-ghost"
              >
                <RotateCcw className="size-5" /> {t("startAgain")}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* What we understood — yellow = not said, fill by voice */}
      {draft && stage === 4 && (
        <section className="card grid gap-3 p-4" aria-label={t("fillByVoice")}>
          {transcript && (
            <p className="rounded-xl bg-sand/60 px-3 py-2 text-sm">
              <b className="text-maroon">{t("heardYou")}:</b> <i>“{transcript}”</i>
            </p>
          )}
          {(Object.keys(FIELD_LABEL) as (keyof ShopDraft)[]).some(isMissing) && (
            <p className="rounded-xl bg-turmeric-soft px-3 py-2 text-sm font-bold">⚠ {t("fillByVoice")}</p>
          )}
          <Field label={t("shopName")} missing={isMissing("shop_name")}>
            <TextWithMic value={draft.shop_name ?? ""} missing={isMissing("shop_name")} lang={lang} label={t("shopName")} onChange={(v) => set("shop_name", v || null)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ownerName")} missing={isMissing("owner_name")} note={fromProfile.includes("owner_name") ? t("fromProfile") : undefined}>
              <TextWithMic value={draft.owner_name ?? ""} missing={isMissing("owner_name")} lang={lang} label={t("ownerName")} onChange={(v) => set("owner_name", v || null)} />
            </Field>
            <Field label={t("city")} missing={isMissing("city")} note={fromProfile.includes("city") ? t("fromProfile") : undefined}>
              <TextWithMic value={draft.city ?? ""} missing={isMissing("city")} lang={lang} label={t("city")} onChange={(v) => set("city", v || null)} />
            </Field>
          </div>
          <Field label={t("craft")} missing={isMissing("craft")} note={fromProfile.includes("craft") ? t("fromProfile") : undefined}>
            <TextWithMic value={draft.craft ?? ""} missing={isMissing("craft")} lang={lang} label={t("craft")} onChange={(v) => set("craft", v || null)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("yearsLabel")} missing={isMissing("years_of_experience")}>
              <TextWithMic
                numeric
                value={draft.years_of_experience?.toString() ?? ""}
                missing={isMissing("years_of_experience")}
                lang={lang}
                label={t("yearsLabel")}
                onChange={(v) => set("years_of_experience", v ? parseAmount(v) : null)}
              />
            </Field>
            <Field label={t("phoneLabel")} missing={isMissing("phone")}>
              <TextWithMic
                numeric
                value={draft.phone ?? ""}
                missing={isMissing("phone")}
                lang={lang}
                label={t("phoneLabel")}
                onChange={(v) => set("phone", v.replace(/\D/g, "").slice(-10) || null)}
              />
            </Field>
          </div>
          <Field label={`${t("priceRange")} (₹)`} missing={isMissing("price_range")}>
            <div className="grid grid-cols-2 gap-2">
              {(["min", "max"] as const).map((k) => (
                <TextWithMic
                  key={k}
                  numeric
                  placeholder={k === "min" ? "min" : "max"}
                  value={draft.price_range?.[k]?.toString() ?? ""}
                  missing={isMissing("price_range")}
                  lang={lang}
                  label={`${t("priceRange")} ${k}`}
                  onChange={(v) => {
                    const n = v ? parseAmount(v) : null;
                    const cur = draft.price_range ?? { min: null, max: null };
                    set("price_range", { ...cur, [k]: n });
                  }}
                />
              ))}
            </div>
          </Field>
          <Field label={t("specialtiesLabel")} missing={isMissing("specialties")}>
            <TextWithMic
              value={(draft.specialties ?? []).join(", ")}
              missing={isMissing("specialties")}
              lang={lang}
              label={t("specialtiesLabel")}
              onChange={(v) => set("specialties", v ? v.split(",").map((x) => x.trim()).filter(Boolean) : null)}
            />
          </Field>
          <Field label={t("story")} missing={isMissing("story")}>
            <textarea
              rows={3}
              className={`input resize-none ${isMissing("story") ? "missing" : ""}`}
              value={draft.story ?? ""}
              onChange={(e) => set("story", e.target.value || null)}
            />
          </Field>
          <button onClick={update} disabled={busy} className="btn btn-primary text-lg">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Store className="size-5" />} {t("updateShop")}
          </button>
        </section>
      )}
    </div>
  );
}

function Field({ label, missing, note, children }: { label: string; missing?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-1.5 text-sm font-bold text-muted">
        {label}
        {missing && <span className="size-2 rounded-full bg-turmeric" aria-label="missing" />}
        {note && <span className="text-[11px] font-semibold text-leaf">· {note}</span>}
      </span>
      {children}
    </label>
  );
}

function TextWithMic({
  value,
  onChange,
  missing,
  lang,
  label,
  numeric,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  missing: boolean;
  lang: string;
  label: string;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        className={`input ${missing ? "missing" : ""}`}
        value={value}
        inputMode={numeric ? "numeric" : undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldMic lang={lang} label={label} onText={(s) => onChange(s)} />
    </div>
  );
}

function TypeInstead({ onSend, disabled, t }: { onSend: (text: string) => void; disabled: boolean; t: ReturnType<typeof translator> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-11 text-sm font-semibold text-muted underline">
        {t("typeInstead")}
      </button>
    );
  return (
    <form
      className="mt-2 grid w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text.trim());
      }}
    >
      <textarea rows={4} className="input resize-none" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("shopSetupHint")} />
      <button type="submit" className="btn btn-primary" disabled={disabled || !text.trim()}>
        {t("send")}
      </button>
    </form>
  );
}
