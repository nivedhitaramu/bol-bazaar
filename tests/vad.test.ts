/** Hands-free voice activity detection — run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleTo16k, Vad, type VadEvent } from "../lib/client/vad";

const SR = 16000;
const FRAME = 512; // 32 ms

/** Synthesise `ms` of audio: a 200 Hz tone at `amp` (0 = silence) plus a little noise. */
function audio(ms: number, amp: number): Float32Array {
  const n = Math.round((ms / 1000) * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * 200 * i) / SR) + (Math.random() - 0.5) * 0.004;
  return a;
}

function run(vad: Vad, ...parts: Float32Array[]): VadEvent[] {
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const events: VadEvent[] = [];
  for (let i = 0; i + FRAME <= all.length; i += FRAME) events.push(...vad.process(all.subarray(i, i + FRAME)));
  return events;
}

test("speech then ~1.2 s of silence ends an utterance, with pre-roll and trimmed tail", () => {
  const ev = run(new Vad(SR), audio(600, 0), audio(1500, 0.2), audio(1500, 0));
  const types = ev.map((e) => e.type);
  assert.deepEqual(types, ["start", "end"]);
  const end = ev[1] as Extract<VadEvent, { type: "end" }>;
  assert.ok(end.voicedMs >= 1400 && end.voicedMs <= 1600, `voiced ${end.voicedMs}`);
  const seconds = end.samples.length / SR;
  assert.ok(seconds > 1.5 && seconds < 2.4, `clip ${seconds}s (speech + pre-roll + ≤0.3 s tail)`);
});

test("no utterance ends before 1.2 s of silence (natural pauses don't cut speech)", () => {
  const ev = run(new Vad(SR), audio(300, 0), audio(800, 0.2), audio(700, 0), audio(800, 0.2), audio(1400, 0));
  assert.deepEqual(ev.map((e) => e.type), ["start", "end"], "a 0.7 s pause stays inside one utterance");
});

test("sounds shorter than 0.5 s are ignored", () => {
  const ev = run(new Vad(SR), audio(500, 0), audio(250, 0.3), audio(1500, 0));
  assert.deepEqual(ev.map((e) => e.type), ["start", "short"]);
});

test("very quiet input never starts; soft-but-audible speech reports 'quiet'", () => {
  assert.deepEqual(run(new Vad(SR), audio(500, 0), audio(1500, 0.006), audio(1500, 0)), [], "below the floor → nothing");
  const ev = run(new Vad(SR), audio(500, 0), audio(1200, 0.035), audio(1500, 0));
  assert.deepEqual(ev.map((e) => e.type), ["start", "quiet"], "audible but too soft → ask to come closer");
});

test("adapts to a steady background hum instead of triggering on it", () => {
  const vad = new Vad(SR);
  const ev = run(vad, audio(4000, 0.012));
  assert.deepEqual(ev, [], "constant low hum is noise, not speech");
  const ev2 = run(vad, audio(1200, 0.25), audio(1500, 0.012));
  assert.deepEqual(ev2.map((e) => e.type), ["start", "end"], "speech over the hum is still detected");
});

test("reset() drops a partial utterance (used while the other side's audio plays)", () => {
  const vad = new Vad(SR);
  run(vad, audio(300, 0), audio(600, 0.2));
  assert.equal(vad.speaking, true);
  vad.reset();
  assert.equal(vad.speaking, false);
  assert.deepEqual(run(vad, audio(1500, 0)), []);
});

test("resampleTo16k keeps duration", () => {
  const out = resampleTo16k(new Float32Array(48000), 48000);
  assert.equal(out.length, 16000);
});
