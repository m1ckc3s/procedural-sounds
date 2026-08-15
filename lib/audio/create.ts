import type { Category } from "./categories";
import type { DelayEffect, Layer, Patch, Waveform } from "./patch";
import { layersOf } from "./patch";
import { enforceLimits } from "./limits";

// The CREATOR: structural/character generation, deliberately separate from the frozen
// variation engine (randomize.ts mutatePatch, which preserves seed structure and serves
// product-time freshness). This module MAY add/remove/re-time layers, swap waveforms,
// flip curves, and add effects - it makes new sounds in a seed's family, curated per
// category, and its dice are weighted by the curator's keep/delete history (see opWeight).

export type CreateOp =
  | "swap-waveform"
  | "transpose-wide"
  | "add-harmonic"
  | "add-noise-tick"
  | "add-echo-layer"
  | "add-shimmer"
  | "curve-flip"
  | "filter-add"
  | "filter-shift"
  | "sweepify"
  | "invert-direction"
  | "retime-layers"
  | "reshape-envelope";

// Per-category op palettes: which structural moves make sense for the aisle.
// (A hover must stay featherweight; an error may go harsh; shimmer suits ringing sounds.)
export const PALETTES: Record<Category, CreateOp[]> = {
  tap: ["swap-waveform", "transpose-wide", "add-harmonic", "add-noise-tick", "curve-flip", "filter-add", "filter-shift", "reshape-envelope"],
  hover: ["swap-waveform", "transpose-wide", "add-noise-tick", "curve-flip", "filter-shift", "reshape-envelope"],
  transition: ["sweepify", "invert-direction", "add-echo-layer", "add-shimmer", "filter-add", "filter-shift", "retime-layers", "reshape-envelope", "transpose-wide"],
  success: ["add-harmonic", "retime-layers", "add-shimmer", "curve-flip", "reshape-envelope", "transpose-wide"],
  error: ["swap-waveform", "sweepify", "add-noise-tick", "reshape-envelope", "transpose-wide", "filter-add"],
  warning: ["swap-waveform", "add-harmonic", "reshape-envelope", "transpose-wide", "filter-shift"],
  notification: ["add-harmonic", "add-shimmer", "retime-layers", "reshape-envelope", "transpose-wide", "curve-flip"],
};

// Keep/delete tallies per category+op, learned from the Creations review.
export type OpStats = Partial<Record<Category, Partial<Record<CreateOp, { k: number; d: number }>>>>;

// Laplace-smoothed acceptance: unseen ops start at 0.5 and move with the verdicts.
// No exploration floor (deletes must be able to kill a move): 5+ deletes with zero
// keeps MUTES the op entirely. The threshold sits at 5 because anomaly-weighted taste
// blame owns the WHY of a delete, leaving dice deletes a cleaner mold-level signal;
// higher thresholds effectively never fired. Revival = a keep tally edit in
// creations-feedback.json; a muted op is never drawn, so it cannot revive itself.
export function opWeight(stats: OpStats, cat: Category, op: CreateOp): number {
  const s = stats[cat]?.[op];
  if (!s) return 0.5;
  if (s.k === 0 && s.d >= 5) return 0;
  return (s.k + 1) / (s.k + s.d + 2);
}

const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Musical intervals for harmonic layers (semitones): octave, fifth, fourth, major third.
const INTERVALS = [12, 7, 5, 4, -12];
const WAVEFORMS: Waveform[] = ["sine", "triangle", "square", "sawtooth"];
const SOFT_WAVEFORMS: Waveform[] = ["sine", "triangle"];

const startFreq = (l: Layer): number => {
  const s = l.source;
  if (s.type === "noise") return 0;
  return typeof s.frequency === "number" ? s.frequency : s.frequency.start;
};

const scaleFreq = (l: Layer, ratio: number) => {
  const s = l.source;
  if (s.type === "noise") return;
  if (typeof s.frequency === "number") s.frequency = clamp(s.frequency * ratio, 80, 6000);
  else
    s.frequency = {
      ...s.frequency,
      start: clamp(s.frequency.start * ratio, 80, 6000),
      end: clamp(s.frequency.end * ratio, 60, 6000),
    };
};

const layerDur = (l: Layer): number =>
  l.envelope ? (l.envelope.attack ?? 0) + l.envelope.decay + (l.envelope.release ?? 0) : 0.5;

function applyOp(op: CreateOp, layers: Layer[], cat: Category, rng: () => number): void {
  const tonal = layers.filter((l) => l.source.type !== "noise");
  const anchor = tonal[0] ?? layers[0];
  switch (op) {
    case "swap-waveform": {
      const pool = cat === "hover" ? SOFT_WAVEFORMS : WAVEFORMS;
      for (const l of tonal) {
        const current = l.source.type as Waveform;
        const next = pick(pool.filter((w) => w !== current), rng);
        if (next) l.source.type = next;
      }
      break;
    }
    case "transpose-wide": {
      const semis = pick([-12, -7, -5, 5, 7, 12], rng);
      const ratio = Math.pow(2, semis / 12);
      for (const l of layers) scaleFreq(l, ratio);
      break;
    }
    case "add-harmonic": {
      if (anchor.source.type === "noise" || layers.length >= 6) break;
      const h = structuredClone(anchor);
      scaleFreq(h, Math.pow(2, pick(INTERVALS, rng) / 12));
      h.gain = (h.gain ?? 0.5) * 0.55;
      h.delay = (anchor.delay ?? 0) + (rng() < 0.5 ? 0 : 0.03 + rng() * 0.08);
      layers.push(h);
      break;
    }
    case "add-noise-tick": {
      if (layers.some((l) => l.source.type === "noise") || layers.length >= 6) break;
      layers.push({
        source: { type: "noise", color: "white" },
        envelope: { attack: 0.001, decay: 0.012 + rng() * 0.02, sustain: 0, release: 0, curve: "ramp" },
        gain: 0.04 + rng() * 0.05,
        filter: { type: "bandpass", frequency: 2000 + rng() * 3500, Q: 1.2 + rng() * 0.8 },
        delay: anchor.delay ?? 0,
      });
      break;
    }
    case "add-echo-layer": {
      if (layers.length >= 6) break;
      const echo = structuredClone(anchor);
      echo.gain = (echo.gain ?? 0.5) * 0.35;
      echo.delay = (anchor.delay ?? 0) + layerDur(anchor) * (0.5 + rng() * 0.5);
      layers.push(echo);
      break;
    }
    case "add-shimmer": {
      const fx: DelayEffect = {
        type: "delay",
        delay: 0.06 + rng() * 0.1,
        feedback: 0.18 + rng() * 0.2,
        wet: 0.1 + rng() * 0.12,
        lowpass: 2500 + rng() * 3000,
      };
      for (const l of layers) {
        const others = (l.effects ?? []).filter((e) => e.type !== "delay");
        l.effects = [...others, fx];
      }
      break;
    }
    case "curve-flip": {
      for (const l of layers) {
        if (!l.envelope) continue;
        if (l.envelope.curve === "ramp") delete l.envelope.curve;
        else l.envelope.curve = "ramp";
      }
      break;
    }
    case "filter-add": {
      for (const l of tonal) {
        if (l.filter) continue;
        l.filter = { type: "lowpass", frequency: clamp(startFreq(l) * (1.5 + rng() * 2), 300, 7000), Q: 1 + rng() * 5 };
      }
      break;
    }
    case "filter-shift": {
      for (const l of layers) {
        const f = Array.isArray(l.filter) ? l.filter[0] : l.filter;
        if (!f) continue;
        f.frequency = clamp(f.frequency * Math.pow(2, (rng() * 2 - 1) * 1.2), 200, 8000);
      }
      break;
    }
    case "sweepify": {
      for (const l of tonal) {
        const s = l.source;
        if (s.type === "noise" || typeof s.frequency !== "number") continue;
        const semis = pick([-12, -7, 7, 12], rng);
        s.frequency = { start: s.frequency, end: clamp(s.frequency * Math.pow(2, semis / 12), 60, 6000) };
      }
      break;
    }
    case "invert-direction": {
      const maxOnset = Math.max(...layers.map((l) => l.delay ?? 0));
      for (const l of layers) {
        const mirrored = maxOnset - (l.delay ?? 0);
        l.delay = mirrored > 0 ? mirrored : undefined;
        const s = l.source;
        if (s.type !== "noise" && typeof s.frequency === "object") {
          s.frequency = { ...s.frequency, start: s.frequency.end, end: s.frequency.start };
        }
      }
      break;
    }
    case "retime-layers": {
      if (layers.length < 2) break;
      layers.forEach((l, i) => {
        if (i === 0) return;
        const gap = 0.03 + rng() * 0.09;
        l.delay = Math.round(i * gap * 1000) / 1000;
      });
      break;
    }
    case "reshape-envelope": {
      for (const l of layers) {
        if (!l.envelope) continue;
        const stretch = 0.5 + rng() * 1.6;
        l.envelope.decay = clamp(l.envelope.decay * stretch, 0.01, cat === "hover" ? 0.12 : 0.9);
        if (l.envelope.attack !== undefined) {
          l.envelope.attack = clamp(l.envelope.attack * (0.3 + rng() * 2), 0, cat === "hover" ? 0.03 : 0.15);
        }
      }
      break;
    }
  }
}

export interface CreateResult {
  patch: Patch;
  ops: CreateOp[];
}

export function createFrom(seed: Patch, cat: Category, stats: OpStats, rng: () => number = Math.random): CreateResult {
  const layers = layersOf(seed).map((l) => structuredClone(l));
  const palette = PALETTES[cat];
  const opCount = 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
  const ops: CreateOp[] = [];
  let remaining = palette.filter((op) => opWeight(stats, cat, op) > 0);
  if (remaining.length === 0) remaining = [...palette];
  while (ops.length < opCount && remaining.length > 0) {
    const total = remaining.reduce((s, op) => s + opWeight(stats, cat, op), 0);
    let roll = rng() * total;
    let chosen = remaining[remaining.length - 1];
    for (const op of remaining) {
      roll -= opWeight(stats, cat, op);
      if (roll <= 0) {
        chosen = op;
        break;
      }
    }
    remaining.splice(remaining.indexOf(chosen), 1);
    ops.push(chosen);
  }
  for (const op of ops) applyOp(op, layers, cat, rng);
  enforceLimits(layers);
  return { patch: layers.length === 1 ? layers[0] : { layers }, ops };
}
