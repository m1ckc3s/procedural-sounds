import type { Patch } from "./patch";
import { patchDuration, renderPatch } from "./synth";

// Offline render through the SAME node-building as live playback (renderPatch), so a
// measured buffer is exactly what the ear gets. Mono is deliberate: the synth has no
// pan, so channel 0 is the whole signal.
// Keyed on patch identity: a draw measures loudness in page.tsx and draws the waveform in
// SoundStage from the same Patch object, so this halves the OfflineAudioContexts per tap.
const RENDERS = new WeakMap<Patch, Promise<AudioBuffer>>();

export function renderToBuffer(patch: Patch, sampleRate = 44100): Promise<AudioBuffer> {
  if (sampleRate === 44100) {
    const hit = RENDERS.get(patch);
    if (hit) return hit;
  }
  const seconds = Math.min(patchDuration(patch) + 0.05, 8);
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate);
  renderPatch(ctx, patch, undefined, 0, ctx.destination);
  const rendered = ctx.startRendering();
  if (sampleRate === 44100) {
    RENDERS.set(patch, rendered);
    rendered.catch(() => RENDERS.delete(patch));
  }
  return rendered;
}

export interface LoudnessMeasure {
  peakDb: number;
  rmsDb: number; // full-buffer RMS (tail/silence included; biased low for short ticks)
  winDb: number; // loudest 50ms-window RMS - the perceived-loudness proxy for UI sounds
  seconds: number;
}

const FLOOR_DB = -120;

function toDb(x: number): number {
  return x <= 0 ? FLOOR_DB : Math.max(FLOOR_DB, 20 * Math.log10(x));
}

// Loudest short-window RMS beats whole-buffer RMS for transient sounds: a 10ms tick and
// a 300ms chime at equal window level actually sound matched, while whole-buffer RMS
// would call the tick 15dB quieter because of surrounding silence.
export function measureBuffer(buffer: AudioBuffer): LoudnessMeasure {
  const data = buffer.getChannelData(0);
  const n = data.length;
  const prefix = new Float64Array(n + 1);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const s = data[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
    prefix[i + 1] = prefix[i] + s * s;
  }
  const rms = n > 0 ? Math.sqrt(prefix[n] / n) : 0;

  const win = Math.max(1, Math.round(buffer.sampleRate * 0.05));
  const hop = Math.max(1, Math.round(buffer.sampleRate * 0.01));
  let maxWinRms = 0;
  if (n <= win) {
    maxWinRms = rms;
  } else {
    for (let start = 0; start + win <= n; start += hop) {
      const winRms = Math.sqrt((prefix[start + win] - prefix[start]) / win);
      if (winRms > maxWinRms) maxWinRms = winRms;
    }
  }

  return {
    peakDb: Math.round(toDb(peak) * 10) / 10,
    rmsDb: Math.round(toDb(rms) * 10) / 10,
    winDb: Math.round(toDb(maxWinRms) * 10) / 10,
    seconds: Math.round((n / buffer.sampleRate) * 1000) / 1000,
  };
}

export async function measurePatch(patch: Patch): Promise<LoudnessMeasure> {
  return measureBuffer(await renderToBuffer(patch));
}
