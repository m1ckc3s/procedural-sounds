// Mono 16-bit PCM. Mono because the synth has no pan, so an offline render's channel 0 is
// the whole signal and a stereo file would just be two identical copies. 16-bit because a
// UI blip gains nothing from 24, and at 2 bytes per sample the data chunk is always even,
// so the RIFF odd-byte pad case cannot occur.

// The synth's own silence floor (synth.ts SILENCE): envelopes decay TOWARD it with
// setTargetAtTime and never reach zero, so a "wait for zero" trim would never fire.
const SILENCE = 0.0001;

const FADE_IN = 0.002;
const FADE_OUT = 0.006;
const ONSET = 0.01; // fraction of peak that counts as the sound having started

// Cuts the leading and trailing inaudible run, then fades both new edges so the cut cannot
// click. The fade-in is clamped to the pre-onset region: a UI tap can reach full level in
// 1ms, and ramping across a real transient would soften the very thing being exported.
export function trimAndFade(samples: Float32Array, sampleRate: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= SILENCE) return samples.slice(0, Math.min(samples.length, Math.ceil(sampleRate * 0.01)));

  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < SILENCE) start++;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE) end--;

  const out = samples.slice(start, end);
  const n = out.length;
  if (n === 0) return out;

  let onset = 0;
  while (onset < n && Math.abs(out[onset]) < peak * ONSET) onset++;

  const fadeIn = Math.min(Math.round(sampleRate * FADE_IN), onset);
  const fadeOut = Math.min(Math.round(sampleRate * FADE_OUT), Math.floor(n / 4));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) out[n - 1 - i] *= i / fadeOut;
  return out;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, bytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}
