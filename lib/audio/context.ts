/*
 * Adapted from @web-kits/audio (https://github.com/raphaelsalaja/audio),
 * commit 3a9fe941c589d26d3487db17f5183eb9cecf3258, packages/audio/src/context.ts.
 * Copyright (c) 2026 Raphael Salaja. MIT License. Full text: THIRD-PARTY-NOTICES.md.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

// iOS Safari hangs the page when an OfflineAudioContext is created while the live context is
// mid-sound (real device only; the simulator has no audio hardware and never shows it). The
// product must not construct one there. iPadOS reports as MacIntel with touch points.
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function getContext(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
    masterGain = null;
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export async function ensureReady(): Promise<AudioContext> {
  const audio = getContext();
  if (audio.state === "suspended") {
    await audio.resume();
  }
  return audio;
}

export function getMasterBus(): GainNode {
  const c = getContext();
  if (!masterGain || masterGain.context !== c) {
    masterGain = c.createGain();
    masterGain.connect(c.destination);
  }
  return masterGain;
}

export function getDestination(): AudioNode {
  const c = getContext();
  if (masterGain && masterGain.context === c) {
    return masterGain;
  }
  return c.destination;
}

export function setMasterVolume(volume: number): void {
  getMasterBus().gain.value = volume;
}
