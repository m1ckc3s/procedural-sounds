// The one door out of the app for a sound. WAV today; the JS snippet and the raw JSON join
// it here rather than beside it, so usage gating has a single place to live.

import { invertPatch } from "../invert";
import { bakeVolume } from "../loudness";
import { renderToBuffer } from "../offline";
import type { Patch } from "../patch";
import { toSnippet, toSoundJs } from "./snippet";
import { encodeWav, trimAndFade } from "./wav";

export { PLAYER_JS, parseSound, toSnippet, toSoundJs, type ParsedSound } from "./snippet";

export interface WavOptions {
  /** The play-time loudness multiplier (loudness.ts). Baked in so the file is the sound that was heard. */
  volume?: number;
  sampleRate?: number;
}

// A noise layer draws fresh grains every render, so an exported file is the same recipe but
// not the same sample stream as the click that played it.
export async function patchToWav(patch: Patch, opts: WavOptions = {}): Promise<Blob> {
  const rate = opts.sampleRate ?? 44100;
  const buffer = await renderToBuffer(bakeVolume(patch, opts.volume ?? 1), rate);
  const samples = trimAndFade(buffer.getChannelData(0).slice(), buffer.sampleRate);
  return new Blob([encodeWav(samples, buffer.sampleRate)], { type: "audio/wav" });
}

export function wavFilename(name: string | undefined): string {
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "sound"}.wav`;
}

export async function downloadPatchWav(
  patch: Patch,
  name: string | undefined,
  opts: WavOptions = {},
): Promise<void> {
  const blob = await patchToWav(patch, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = wavFilename(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking in the same tick cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ExportableSound {
  patch: Patch;
  name?: string;
  category?: string | null;
  volume?: number;
}

// A transition is a PAIR: the send and the return are the same asset, and an interface that
// only got the send would have to invent the way back. Every surface exports through here so
// they cannot disagree about that.
export async function downloadSoundWav(sound: ExportableSound): Promise<void> {
  const opts = { volume: sound.volume };
  await downloadPatchWav(sound.patch, sound.name, opts);
  if (sound.category !== "transition") return;
  await downloadPatchWav(invertPatch(sound.patch), `${sound.name ?? "sound"} reverse`, opts);
}

// The copy button gives the SOUND. The player is a separate, one-time copy.
export function soundToSnippet(sound: ExportableSound): string {
  return toSoundJs(sound.patch, { volume: sound.volume, name: sound.name });
}

export function soundToStandaloneSnippet(sound: ExportableSound): string {
  return toSnippet(sound.patch, { volume: sound.volume, name: sound.name });
}
