"use client";
/**
 * Single shared audio element + speechSynthesis fallback.
 * Browsers block autoplay until a user gesture — call unlockAudio() from a tap handler.
 */
let el: HTMLAudioElement | null = null;
let unlocked = false;
let queue: Promise<void> = Promise.resolve();
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function audioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

export function isAudioUnlocked() {
  return unlocked;
}

export async function unlockAudio() {
  const a = audioEl();
  try {
    a.src = SILENT;
    a.muted = false;
    await a.play();
  } catch {}
  try {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {}
  unlocked = true;
}

export function stopAudio() {
  try {
    audioEl().pause();
  } catch {}
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

function playSrc(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = audioEl();
    const cleanup = () => {
      a.onended = null;
      a.onerror = null;
    };
    a.onended = () => {
      cleanup();
      resolve();
    };
    a.onerror = () => {
      cleanup();
      reject(new Error("audio playback failed"));
    };
    a.src = src;
    a.play().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const vs = window.speechSynthesis.getVoices();
    if (vs.length) return resolve(vs);
    const t = setTimeout(() => resolve(window.speechSynthesis.getVoices()), 800);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(t);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

/** Browser TTS fallback. Resolves when done (or immediately if unsupported). */
export async function speakWithBrowser(text: string, lang: string): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = await voicesReady();
  const base = lang.split("-")[0];
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base));
  return new Promise((resolve) => {
    let finished = false;
    const finish = (ok: boolean) => {
      if (!finished) {
        finished = true;
        resolve(ok);
      }
    };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (voice) u.voice = voice;
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // Safety: some Android builds never fire onend.
    setTimeout(() => finish(true), Math.min(30000, 1500 + text.length * 90));
  });
}

export type PlayInput = { url?: string | null; base64?: string | null; mime?: string | null; text?: string; lang?: string };

/** Play server audio if present, else fall back to browser TTS. Queued so clips never overlap. */
export function play(input: PlayInput, hooks?: { onStart?: () => void; onEnd?: (usedFallback: boolean) => void }) {
  const task = async () => {
    hooks?.onStart?.();
    let usedFallback = false;
    const src = input.url || (input.base64 ? `data:${input.mime || "audio/mpeg"};base64,${input.base64}` : null);
    try {
      if (!src) throw new Error("no audio");
      await playSrc(src);
    } catch {
      if (input.text && input.lang) {
        usedFallback = true;
        await speakWithBrowser(input.text, input.lang);
      }
    }
    hooks?.onEnd?.(usedFallback);
  };
  queue = queue.then(task, task);
  return queue;
}

/** Translate (optional) + TTS on the server, then play. Falls back to browser speech. */
export async function speak(
  text: string,
  lang: string,
  opts: { from?: string; gender?: "female" | "male"; onStart?: () => void; onEnd?: (fallback: boolean) => void } = {}
): Promise<{ text: string; fallback: boolean }> {
  let spoken = text;
  let base64: string | null = null;
  let mime: string | null = null;
  try {
    const r = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 2400), to: lang, from: opts.from, gender: opts.gender }),
    });
    if (r.ok) {
      const j = await r.json();
      spoken = j.text || text;
      base64 = j.audio;
      mime = j.mime;
    }
  } catch {}
  let fallback = !base64;
  await play(
    { base64, mime, text: spoken, lang },
    {
      onStart: opts.onStart,
      onEnd: (f) => {
        fallback = fallback || f;
        opts.onEnd?.(f);
      },
    }
  );
  return { text: spoken, fallback };
}
