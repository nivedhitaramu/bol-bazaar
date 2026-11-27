/**
 * Energy-based voice activity detection (pure — unit-tested in tests/vad.test.ts).
 *
 * Feed it consecutive PCM frames; it emits:
 *   start  — speech began (after ~90 ms above threshold)
 *   end    — an utterance finished (≈1.2 s of silence) → samples include ~300 ms pre-roll
 *   short  — a sound shorter than 0.5 s (cough, tap, door) → ignored
 *   quiet  — a real utterance whose loudest point was too soft → "please come closer"
 * The noise floor adapts while nobody is speaking, so a fan or traffic doesn't trigger it.
 */
export type VadEvent =
  | { type: "start" }
  | { type: "end"; samples: Float32Array; voicedMs: number; peak: number }
  | { type: "short"; voicedMs: number }
  | { type: "quiet"; voicedMs: number; peak: number };

export type VadOptions = {
  silenceMs: number;
  minSpeechMs: number;
  maxSpeechMs: number;
  prerollMs: number;
  /** Absolute floor for "someone is making sound" (RMS, 0..1). */
  minStart: number;
  /** An utterance whose peak RMS stays below this is "too quiet". */
  quietPeak: number;
  /** Frames above threshold needed to start (debounce clicks). */
  startFrames: number;
};

export const DEFAULT_VAD: VadOptions = {
  silenceMs: 1200,
  minSpeechMs: 500,
  maxSpeechMs: 25_000,
  prerollMs: 300,
  minStart: 0.015,
  quietPeak: 0.035,
  startFrames: 2,
};

export function rms(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / Math.max(1, frame.length));
}

export class Vad {
  private o: VadOptions;
  private t = 0; // ms of audio seen
  private noise = 0.004;
  private above = 0;
  private preroll: Float32Array[] = [];
  private prerollMsNow = 0;
  private inSpeech = false;
  private chunks: Float32Array[] = [];
  private speechStart = 0;
  private lastVoice = 0;
  private peak = 0;
  level = 0;

  constructor(private sampleRate: number, opts: Partial<VadOptions> = {}) {
    this.o = { ...DEFAULT_VAD, ...opts };
  }

  get speaking() {
    return this.inSpeech;
  }

  /** Drop any partial utterance (e.g. while the other side's audio is playing). */
  reset() {
    this.inSpeech = false;
    this.chunks = [];
    this.preroll = [];
    this.prerollMsNow = 0;
    this.above = 0;
    this.peak = 0;
  }

  process(frame: Float32Array): VadEvent[] {
    const frameMs = (frame.length / this.sampleRate) * 1000;
    this.t += frameMs;
    const r = rms(frame);
    this.level = Math.min(1, r * 6);
    const startThr = Math.max(this.o.minStart, this.noise * 3);
    const events: VadEvent[] = [];

    if (!this.inSpeech) {
      if (r < startThr) this.noise = this.noise * 0.95 + r * 0.05; // adapt to the room
      this.preroll.push(frame.slice());
      this.prerollMsNow += frameMs;
      while (this.prerollMsNow > this.o.prerollMs && this.preroll.length > 1) {
        const f = this.preroll.shift()!;
        this.prerollMsNow -= (f.length / this.sampleRate) * 1000;
      }
      this.above = r > startThr ? this.above + 1 : 0;
      if (this.above >= this.o.startFrames) {
        this.inSpeech = true;
        this.chunks = [...this.preroll];
        this.speechStart = this.t - frameMs * this.above;
        this.lastVoice = this.t;
        this.peak = r;
        this.preroll = [];
        this.prerollMsNow = 0;
        events.push({ type: "start" });
      }
      return events;
    }

    this.chunks.push(frame.slice());
    const silenceThr = Math.max(this.o.minStart * 0.7, this.noise * 2);
    if (r > silenceThr) {
      this.lastVoice = this.t;
      this.peak = Math.max(this.peak, r);
    }
    const silentFor = this.t - this.lastVoice;
    const longFor = this.t - this.speechStart;
    if (silentFor >= this.o.silenceMs || longFor >= this.o.maxSpeechMs) {
      const voicedMs = this.lastVoice - this.speechStart;
      const peak = this.peak;
      // keep ~300 ms of trailing silence, drop the rest
      const keepMs = Math.max(0, silentFor - 300);
      let dropSamples = Math.round((keepMs / 1000) * this.sampleRate);
      while (dropSamples > 0 && this.chunks.length) {
        const last = this.chunks[this.chunks.length - 1];
        if (last.length <= dropSamples) {
          this.chunks.pop();
          dropSamples -= last.length;
        } else {
          this.chunks[this.chunks.length - 1] = last.slice(0, last.length - dropSamples);
          dropSamples = 0;
        }
      }
      const total = this.chunks.reduce((n, c) => n + c.length, 0);
      const samples = new Float32Array(total);
      let off = 0;
      for (const c of this.chunks) {
        samples.set(c, off);
        off += c.length;
      }
      this.reset();
      if (voicedMs < this.o.minSpeechMs) events.push({ type: "short", voicedMs });
      else if (peak < this.o.quietPeak) events.push({ type: "quiet", voicedMs, peak });
      else events.push({ type: "end", samples, voicedMs, peak });
    }
    return events;
  }
}

/** Downsample to 16 kHz (box-filter average — plenty for speech recognition). */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += input[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}
