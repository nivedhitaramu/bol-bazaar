"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toWav16k } from "./wav";
import { browserSttSupported, getVoiceMode, onVoiceModeChange, probeVoiceMode } from "./voiceMode";
import { stopAudio } from "./player";

export type VoiceResult = { audio?: Blob; text?: string };
export type RecState = "idle" | "recording" | "processing";

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

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function useVoiceInput(opts: {
  lang: string;
  maxMs?: number;
  onResult: (r: VoiceResult) => void | Promise<void>;
  onError?: (kind: "mic" | "unsupported" | "short") => void;
  onStart?: () => void;
}) {
  const maxMs = opts.maxMs ?? 29_000;
  const [state, setState] = useState<RecState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState("");
  const [mode, setMode] = useState(getVoiceMode());

  const cb = useRef(opts);
  cb.current = opts;

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const fakeLevel = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const recog = useRef<SR | null>(null);
  const finalText = useRef("");
  const stateRef = useRef<RecState>("idle");

  const set = (s: RecState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    probeVoiceMode();
    return onVoiceModeChange(setMode);
  }, []);

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    if (fakeLevel.current) clearInterval(fakeLevel.current);
    fakeLevel.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    try {
      if (rec.current?.state === "recording") rec.current.stop();
      recog.current?.abort();
    } catch {}
    cleanup();
  }, [cleanup]);

  const startTimer = (stop: () => void) => {
    startedAt.current = Date.now();
    setElapsed(0);
    tick.current = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= maxMs) stop();
    }, 200);
  };

  const startRecorder = async () => {
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch {
      cb.current.onError?.("mic");
      return;
    }
    stream.current = s;
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      cleanup();
      cb.current.onError?.("unsupported");
      return;
    }
    rec.current = r;
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      const dur = Date.now() - startedAt.current;
      cleanup();
      if (dur < 500 || !chunks.length) {
        set("idle");
        cb.current.onError?.("short");
        return;
      }
      set("processing");
      const raw = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
      let audio: Blob;
      try {
        audio = await toWav16k(raw);
      } catch {
        audio = raw; // Sarvam also accepts webm/mp4/ogg
      }
      set("idle");
      await cb.current.onResult({ audio });
    };

    // Level meter
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        raf.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {}

    r.start(250);
    set("recording");
    cb.current.onStart?.();
    startTimer(() => r.state === "recording" && r.stop());
  };

  const startBrowser = () => {
    const w = window as unknown as Record<string, new () => SR>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      cb.current.onError?.("unsupported");
      return;
    }
    const r = new Ctor();
    recog.current = r;
    r.lang = cb.current.lang;
    r.continuous = true;
    r.interimResults = true;
    finalText.current = "";
    setInterim("");
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript + " ";
        else interimText += res[0].transcript;
      }
      setInterim((finalText.current + interimText).trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") cb.current.onError?.("mic");
    };
    r.onend = async () => {
      cleanup();
      const text = (finalText.current || "").trim() || interimRef.current.trim();
      recog.current = null;
      set("idle");
      setInterim("");
      if (!text) {
        cb.current.onError?.("short");
        return;
      }
      await cb.current.onResult({ text });
    };
    try {
      r.start();
    } catch {
      cb.current.onError?.("unsupported");
      return;
    }
    set("recording");
    cb.current.onStart?.();
    // Simulated level meter (SpeechRecognition exposes no audio levels)
    startTimer(() => r.stop());
    fakeLevel.current = setInterval(() => setLevel(0.25 + Math.random() * 0.5), 120);
  };

  const interimRef = useRef("");
  interimRef.current = interim;

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    stopAudio();
    if (getVoiceMode() === "browser" && browserSttSupported()) startBrowser();
    else if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined")
      await startRecorder();
    else if (browserSttSupported()) startBrowser();
    else cb.current.onError?.("unsupported");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
    if (recog.current) recog.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (stateRef.current === "recording") stop();
    else if (stateRef.current === "idle") start();
  }, [start, stop]);

  return { state, level, elapsed, maxMs, interim, mode, start, stop, toggle };
}
