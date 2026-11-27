"use client";
/**
 * Hands-free listening: no tapping. One utterance in → onUtterance() out.
 *
 *  - Sarvam mode: continuous mic + energy VAD (lib/client/vad.ts). ~1.2 s of silence ends an
 *    utterance, which is encoded as 16 kHz WAV and handed to the caller (→ /api/relay).
 *  - Browser mode (no keys / Sarvam down): continuous SpeechRecognition; each final result is an
 *    utterance. The VAD still runs alongside (when the browser allows) for the level meter and
 *    the "please come closer" hint.
 *  - Paused while ANY app audio plays (+600 ms echo tail) or while the caller is busy (sending),
 *    so it never hears itself. Partial speech captured during a pause is discarded.
 *  - Only one hands-free mic at a time (the /demo page has two panels on one laptop).
 */
import { useEffect, useRef, useState } from "react";
import { encodeWav } from "./wav";
import { resampleTo16k, Vad } from "./vad";
import { browserSttSupported, getVoiceMode, onVoiceModeChange, probeVoiceMode } from "./voiceMode";
import { isPlaybackActive, onPlaybackChange } from "./player";
import type { VoiceResult } from "./useVoiceInput";

export type HandsFreeState = "off" | "starting" | "listening" | "hearing" | "paused" | "error";

// ── one active hands-free mic per tab ──
let owner: { id: string; revoke: () => void } | null = null;
function claim(id: string, revoke: () => void) {
  if (owner && owner.id !== id) owner.revoke();
  owner = { id, revoke };
}
function release(id: string) {
  if (owner?.id === id) owner = null;
}

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function useHandsFree(opts: {
  id: string;
  enabled: boolean;
  /** Caller is busy (e.g. sending) — don't listen. */
  busy?: boolean;
  lang: string;
  onUtterance: (r: VoiceResult) => void | Promise<void>;
  onSpeechStart?: () => void;
  onTooQuiet?: () => void;
  /** A detected sound was dropped (too short / too quiet) — e.g. clear a "Listening…" hint. */
  onDiscard?: () => void;
  /** Another panel took the mic, or the mic failed — caller should switch the toggle off. */
  onStop?: (reason: "revoked" | "mic") => void;
}) {
  const [state, setState] = useState<HandsFreeState>("off");
  const [level, setLevel] = useState(0);
  const [interim, setInterim] = useState("");
  const [mode, setMode] = useState(getVoiceMode());
  const [playing, setPlaying] = useState(false);

  const cb = useRef(opts);
  cb.current = opts;
  const pausedRef = useRef(false);
  const quietAt = useRef(0);

  useEffect(() => {
    probeVoiceMode();
    const off1 = onVoiceModeChange(setMode);
    let tail: ReturnType<typeof setTimeout> | null = null;
    const off2 = onPlaybackChange((p) => {
      if (tail) clearTimeout(tail);
      if (p) setPlaying(true);
      else tail = setTimeout(() => setPlaying(false), 600); // let the speaker's echo die away
    });
    setPlaying(isPlaybackActive());
    return () => {
      off1();
      off2();
      if (tail) clearTimeout(tail);
    };
  }, []);

  const paused = playing || Boolean(opts.busy);
  pausedRef.current = paused;

  const tooQuiet = () => {
    const now = Date.now();
    if (now - quietAt.current < 8000) return; // don't nag
    quietAt.current = now;
    cb.current.onTooQuiet?.();
  };

  // ── main lifecycle: (re)start whenever enabled / mode changes ──
  useEffect(() => {
    if (!opts.enabled) {
      setState("off");
      setLevel(0);
      return;
    }
    const id = opts.id;
    claim(id, () => cb.current.onStop?.("revoked"));
    let disposed = false;
    setState("starting");

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let proc: ScriptProcessorNode | null = null;
    let recog: SR | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const useBrowser = mode === "browser" && browserSttSupported();

    // Energy VAD on the raw mic (both modes; in browser mode it only drives the meter + quiet hint).
    const startVad = async (required: boolean) => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
        });
      } catch {
        if (required && !disposed) {
          setState("error");
          cb.current.onStop?.("mic");
        }
        return;
      }
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      // ScriptProcessor: deprecated but the most widely supported raw-PCM tap (incl. low-end Android).
      proc = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);
      const vad = new Vad(ctx.sampleRate);
      const rate = ctx.sampleRate;
      let wasPaused = false;
      proc.onaudioprocess = (e) => {
        const frame = e.inputBuffer.getChannelData(0);
        if (pausedRef.current) {
          if (!wasPaused) vad.reset();
          wasPaused = true;
          setLevel(0);
          return;
        }
        wasPaused = false;
        for (const ev of vad.process(frame)) {
          if (ev.type === "start") {
            setState("hearing");
            cb.current.onSpeechStart?.();
          } else if (ev.type === "quiet") {
            setState("listening");
            cb.current.onDiscard?.();
            tooQuiet();
          } else if (ev.type === "short") {
            setState("listening");
            cb.current.onDiscard?.();
          } else if (ev.type === "end") {
            setState("listening");
            if (!useBrowser) {
              const wav = encodeWav(resampleTo16k(ev.samples, rate), 16000);
              void cb.current.onUtterance({ audio: wav });
            }
          }
        }
        setLevel(vad.level);
      };
      if (!useBrowser) setState("listening");
    };

    const startRecognition = () => {
      const w = window as unknown as Record<string, new () => SR>;
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      restartTimer = null;
      if (!Ctor || disposed || pausedRef.current || recog) return;
      const r = new Ctor();
      recog = r;
      r.lang = cb.current.lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) {
            const text = res[0].transcript.trim();
            setInterim("");
            if (text.length >= 2 && !pausedRef.current) {
              setState("listening");
              void cb.current.onUtterance({ text });
            }
          } else live += res[0].transcript;
        }
        if (live) {
          setInterim(live);
          setState("hearing");
        }
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setState("error");
          cb.current.onStop?.("mic");
        }
      };
      r.onend = () => {
        recog = null;
        if (!disposed && !pausedRef.current) restartTimer = setTimeout(startRecognition, 250); // keep listening
      };
      try {
        r.start();
        setState("listening");
      } catch {}
    };

    if (useBrowser) {
      startRecognition();
      void startVad(false);
    } else if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") {
      void startVad(true);
    } else {
      setState("error");
      cb.current.onStop?.("mic");
    }

    // Browser recognition must be stopped while we're paused (it would hear the speaker).
    const pauseWatcher = setInterval(() => {
      if (!useBrowser || disposed) return;
      if (pausedRef.current && recog) {
        recog.onend = null;
        recog.abort();
        recog = null;
      } else if (!pausedRef.current && !recog && !restartTimer) {
        startRecognition();
      }
    }, 200);

    return () => {
      disposed = true;
      release(id);
      clearInterval(pauseWatcher);
      if (restartTimer) clearTimeout(restartTimer);
      if (recog) {
        recog.onend = null;
        recog.abort();
      }
      if (proc) proc.onaudioprocess = null;
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      setLevel(0);
      setInterim("");
    };
    // Restart only when the toggle or STT mode changes — callbacks are read through cb.current.
  }, [opts.enabled, mode, opts.id]);

  const shown: HandsFreeState = state === "off" || state === "error" || state === "starting" ? state : paused ? "paused" : state;
  return { state: shown, level, interim, playing, mode };
}
