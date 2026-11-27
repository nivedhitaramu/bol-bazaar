"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, RotateCcw, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useLang } from "@/components/LangProvider";
import { useToast } from "@/components/Toast";
import { LanguageGrid } from "@/components/LanguagePicker";
import { FieldMic } from "@/components/FieldMic";
import { MicButton } from "@/components/MicButton";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { useSeller } from "@/lib/client/useSeller";
import { INDIAN_STATES } from "@/lib/languages";
import type { Seller } from "@/lib/types";

export default function OnboardPage() {
  const { lang, setLang, t } = useLang();
  const { toast } = useToast();
  const { setSeller } = useSeller();
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [craft, setCraft] = useState("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [intro, setIntro] = useState<VoiceResult | null>(null);
  const [introUrl, setIntroUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (intro?.audio) {
      const u = URL.createObjectURL(intro.audio);
      setIntroUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setIntroUrl(null);
  }, [intro]);

  const rec = useVoiceInput({
    lang,
    maxMs: 25_000,
    onResult: (r) => setIntro(r),
    onError: (k) => k !== "short" && toast(t("errorMic"), "error"),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast(`${t("missing")}: ${t("name")}`, "error");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("language", lang);
      form.append("city", city);
      form.append("state", state);
      form.append("craft", craft);
      form.append("gender", gender);
      if (intro?.audio) form.append("introAudio", intro.audio, "intro.wav");
      if (intro?.text) form.append("introText", intro.text);
      const r = await fetch("/api/sellers", { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "failed");
      const s = (await r.json()) as Seller;
      setSeller({ id: s.id, name: s.name, language: s.language, gender: s.gender, city: s.city });
      toast(t("saved"), "success");
      router.push("/seller/new");
    } catch {
      toast(t("errorGeneric"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
        <h1 className="mb-4 flex items-center gap-2 font-display text-2xl font-bold text-maroon">
          <Sparkles className="size-6 text-saffron" /> {t("startSelling")}
        </h1>
        <form onSubmit={submit} className="grid gap-4">
          <section className="card p-4">
            <h2 className="mb-3 font-bold">{t("chooseLang")}</h2>
            <LanguageGrid value={lang} onChange={setLang} />
          </section>

          <section className="card grid gap-3 p-4">
            <label className="grid gap-1">
              <span className="text-sm font-bold text-muted">{t("name")}</span>
              <div className="flex gap-2">
                <input className="input text-lg" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
                <FieldMic lang={lang} onText={setName} label={t("name")} />
              </div>
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Voice">
              {(["female", "male"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gender === g}
                  onClick={() => setGender(g)}
                  className={`btn border-2 ${gender === g ? "border-maroon bg-maroon/5 text-maroon" : "border-sand bg-white"}`}
                >
                  <span className="text-2xl" aria-hidden>{g === "female" ? "👩" : "👨"}</span>
                  {gender === g && <Check className="size-4" />}
                </button>
              ))}
            </div>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-muted">{t("city")}</span>
              <div className="flex gap-2">
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                <FieldMic lang={lang} onText={setCity} label={t("city")} />
              </div>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-muted">{t("state")}</span>
              <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">—</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-muted">{t("craft")}</span>
              <div className="flex gap-2">
                <input className="input" value={craft} onChange={(e) => setCraft(e.target.value)} placeholder="Silk weaving, pottery, pickles…" />
                <FieldMic lang={lang} onText={setCraft} label={t("craft")} />
              </div>
            </label>
          </section>

          <section className="card motif flex flex-col items-center gap-2 p-6 text-center">
            <h2 className="font-display text-xl font-bold text-maroon">{t("voiceIntro")}</h2>
            <p className="text-sm text-muted">{t("voiceIntroHint")}</p>
            <MicButton
              size="lg"
              state={rec.state === "recording" ? "recording" : rec.state === "processing" ? "busy" : "idle"}
              level={rec.level}
              progress={rec.elapsed / rec.maxMs}
              onPress={rec.toggle}
              label={rec.state === "recording" ? t("stop") : t("voiceIntro")}
            />
            <p className="h-6 font-semibold text-saffron">
              {rec.state === "recording" ? `${t("listening")} ${Math.floor(rec.elapsed / 1000)}s` : ""}
            </p>
            {rec.interim && <p className="text-sm italic text-muted">“{rec.interim}”</p>}
            {intro && (
              <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-3">
                <Check className="size-5 shrink-0 text-leaf" />
                {introUrl ? (
                  <audio src={introUrl} controls className="h-10 min-w-0 flex-1" />
                ) : (
                  <p className="flex-1 text-left text-sm italic">“{intro.text}”</p>
                )}
                <button type="button" onClick={() => setIntro(null)} className="grid size-14 place-items-center rounded-full hover:bg-sand" aria-label="Re-record">
                  <RotateCcw className="size-5" />
                </button>
              </div>
            )}
            {!intro && (
              <p className="flex items-center gap-1 text-xs text-muted">
                <Play className="size-3" /> “வணக்கம், என் பெயர் மீனா… / नमस्ते, मेरा नाम रमेश है…”
              </p>
            )}
          </section>

          <button type="submit" disabled={saving || rec.state !== "idle"} className="btn btn-primary text-lg">
            {saving ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />} {t("startSelling")}
          </button>
        </form>
      </main>
    </>
  );
}
