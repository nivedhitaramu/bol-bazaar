"use client";
import { useState } from "react";
import { Keyboard, Send } from "lucide-react";
import { MicButton } from "./MicButton";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { SwitchedToBrowserStt } from "@/lib/client/api";

/** Hook-level error handling shared by every voice surface. */
export function useVoiceErrorHandler() {
  const { t } = useLang();
  const { toast } = useToast();
  return (e: unknown) => {
    if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`, "info");
    else {
      console.error(e);
      toast(t("errorGeneric"), "error");
    }
  };
}

export function VoiceCapture({
  lang,
  onInput,
  busy = false,
  busyLabel,
  size = "xl",
  hint,
  allowText = true,
  textPlaceholder,
  multiline = false,
}: {
  lang: string;
  onInput: (r: VoiceResult) => Promise<void>;
  busy?: boolean;
  busyLabel?: string;
  size?: "xl" | "lg" | "md";
  hint?: string;
  allowText?: boolean;
  textPlaceholder?: string;
  multiline?: boolean;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const onErr = useVoiceErrorHandler();
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  const run = async (r: VoiceResult) => {
    try {
      await onInput(r);
    } catch (e) {
      onErr(e);
    }
  };

  const v = useVoiceInput({
    lang,
    onResult: run,
    onError: (k) => {
      if (k === "short") return;
      toast(t("errorMic"), "error");
      setShowText(true);
    },
  });

  const sendText = async () => {
    const s = text.trim();
    if (!s) return;
    setText("");
    await run({ text: s });
  };

  const secs = Math.ceil((v.maxMs - v.elapsed) / 1000);
  const status =
    v.state === "recording"
      ? `${t("listening")} ${secs}s`
      : busy || v.state === "processing"
        ? busyLabel ?? t("thinking")
        : hint ?? t("tapToSpeak");

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <MicButton
        state={busy || v.state === "processing" ? "busy" : v.state === "recording" ? "recording" : "idle"}
        level={v.level}
        progress={v.elapsed / v.maxMs}
        onPress={v.toggle}
        size={size}
        label={v.state === "recording" ? t("stop") : t("tapToSpeak")}
      />
      <p
        className={`min-h-6 text-base font-semibold ${v.state === "recording" ? "text-saffron" : busy ? "text-maroon" : "text-muted"}`}
        aria-live="polite"
      >
        {busy && <span className="dots mr-2 align-middle"><span /><span /><span /></span>}
        {status}
      </p>
      {v.interim && <p className="max-w-md text-sm italic text-muted">“{v.interim}”</p>}

      {allowText && (
        <div className="w-full max-w-md">
          {!showText ? (
            <button type="button" onClick={() => setShowText(true)} className="mx-auto flex min-h-14 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted hover:text-ink">
              <Keyboard className="size-4" /> {t("typeInstead")}
            </button>
          ) : (
            <form
              className="mt-1 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendText();
              }}
            >
              {multiline ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder={textPlaceholder}
                  aria-label={textPlaceholder ?? t("typeInstead")}
                />
              ) : (
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="input"
                  placeholder={textPlaceholder}
                  aria-label={textPlaceholder ?? t("typeInstead")}
                />
              )}
              <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary shrink-0 px-4" aria-label={t("send")}>
                <Send className="size-5" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
