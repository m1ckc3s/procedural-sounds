import { compose, hybridize } from "./compose";
import { enforceLimits, LIMITS } from "./limits";
import type { Filter, Layer, Patch, Waveform } from "./patch";
import { layersOf } from "./patch";

// The WILDCARD: a deliberately untrained path.
// No feedback, no taste, no learning anywhere - discovery only. Two dials:
// wild() = remix off-leash: archetypes drawn uniformly across ALL categories ("all" = the
// merged set, empty stats = flat dice), cross-category hybrids, then WARPS with ops the
// grammars would never allow together. Still rooted in library DNA.
// ultraWild() = de-novo chaos: no archetypes, no parents, no library DNA - every
// parameter rolled fresh inside the player surface; only ear-safety clamps survive.
// wild() output runs through finishWild() - ultra's finishing pass
// (2400Hz ceiling, guaranteed tail, gain window, lowpass on bright saw/square) applied
// to the remixes; harshness was the reason wild lost its own product stop. Product +
// workbench draw both through discovery(parents, ultraShare): one dial, 0 = all wild,
// 1 = all ultra, default 0.7 (the shipped Singularity blend).

export interface WildResult {
  patch: Patch;
  label: string;
}

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const WAVES: readonly Waveform[] = ["sine", "triangle", "square", "sawtooth"];

const clampFreq = (f: number) => round3(clamp(f, 60, 6000));

function scaleFreqs(layer: Layer, ratio: number) {
  if (layer.source.type === "noise") return;
  const f = layer.source.frequency;
  layer.source.frequency =
    typeof f === "number"
      ? clampFreq(f * ratio)
      : { ...f, start: clampFreq(f.start * ratio), end: clampFreq(f.end * ratio) };
}

// Each warp takes the layer array (already a private clone) and returns the next array;
// most mutate in place and return the same reference.
type Warp = (layers: Layer[], rng: () => number) => Layer[];

const WARPS: Record<string, Warp> = {
  transpose: (layers, rng) => {
    const ratio = 2 ** (r(rng, -12, 12) / 12);
    for (const l of layers) scaleFreqs(l, ratio);
    return layers;
  },
  "time-stretch": (layers, rng) => {
    const s = rng() < 0.5 ? r(rng, 0.45, 0.8) : r(rng, 1.3, 2.2);
    for (const l of layers) {
      if (l.envelope) {
        l.envelope.decay = round3(clamp(l.envelope.decay * s, 0.008, 0.7));
        if (l.envelope.attack) l.envelope.attack = round3(clamp(l.envelope.attack * s, 0.001, 0.12));
      }
      if (l.delay) l.delay = round3(clamp(l.delay * s, 0, 0.4));
    }
    return layers;
  },
  "wave-swap": (layers, rng) => {
    const tonal = layers.filter((l) => l.source.type !== "noise");
    if (tonal.length > 0) pick(tonal, rng).source.type = pick(WAVES, rng);
    return layers;
  },
  "fm-inject": (layers, rng) => {
    const tonal = layers.filter((l) => l.source.type !== "noise");
    if (tonal.length > 0) {
      const l = pick(tonal, rng);
      if (l.source.type !== "noise") {
        l.source.fm = { depth: Math.round(r(rng, 30, 300)), ratio: round3(r(rng, 0.5, 3)) };
      }
    }
    return layers;
  },
  shimmer: (layers, rng) => {
    const fx = {
      type: "delay" as const,
      delay: round3(r(rng, 0.05, 0.2)),
      feedback: round3(r(rng, 0.15, 0.4)),
      wet: round3(r(rng, 0.1, 0.28)),
      lowpass: Math.round(r(rng, 2000, 6000)),
    };
    for (const l of layers) l.effects = [fx];
    return layers;
  },
  "sweep-flip": (layers) => {
    for (const l of layers) {
      if (l.source.type !== "noise" && typeof l.source.frequency === "object") {
        const { start, end } = l.source.frequency;
        l.source.frequency = { ...l.source.frequency, start: end, end: start };
      }
    }
    return layers;
  },
  "ghost-double": (layers, rng) => {
    if (layers.length >= 5) return layers;
    const ghost = structuredClone(pick(layers, rng));
    if (ghost.source.type !== "noise") {
      scaleFreqs(ghost, 2 ** (pick([-12, -7, 7, 12] as const, rng) / 12));
    }
    ghost.gain = round3(clamp((ghost.gain ?? 0.1) * r(rng, 0.4, 0.7), 0.02, 0.3));
    ghost.delay = round3(clamp((ghost.delay ?? 0) + r(rng, 0.02, 0.12), 0, 0.4));
    return [...layers, ghost];
  },
  "filter-drama": (layers, rng) => {
    const l = pick(layers, rng);
    const base = Math.round(r(rng, 250, 1200));
    const filter: Filter = {
      type: pick(["lowpass", "bandpass", "highpass"] as const, rng),
      frequency: base,
      Q: round3(r(rng, 0.7, 4)),
      envelope: {
        attack: round3(r(rng, 0.002, 0.03)),
        peak: Math.round(base * r(rng, 3, 8)),
        decay: round3(r(rng, 0.05, 0.3)),
      },
    };
    l.filter = filter;
    return layers;
  },
  "curve-flip": (layers) => {
    for (const l of layers) {
      if (!l.envelope) continue;
      if (l.envelope.curve === "ramp") delete l.envelope.curve;
      else l.envelope.curve = "ramp";
    }
    return layers;
  },
  "layer-drop": (layers, rng) => {
    if (layers.length < 2) return layers;
    const drop = Math.floor(rng() * layers.length);
    return layers.filter((_, i) => i !== drop);
  },
};

export const WARP_NAMES = Object.keys(WARPS);

function warp(
  patch: Patch,
  rng: () => number,
  count = 2 + Math.floor(rng() * 3),
): { patch: Patch; ops: string[] } {
  let layers = layersOf(structuredClone(patch));
  const ops: string[] = [];
  const names = [...WARP_NAMES];
  for (let i = 0; i < count && names.length > 0; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0];
    layers = WARPS[name](layers, rng);
    ops.push(name);
  }
  for (const l of layers) {
    if (l.gain !== undefined) l.gain = round3(clamp(l.gain, 0.02, 0.3));
    if (l.envelope) {
      l.envelope.attack = round3(clamp(l.envelope.attack ?? 0.002, 0.001, 0.12));
      l.envelope.decay = round3(clamp(l.envelope.decay, 0.008, 0.7));
    }
  }
  return { patch: layers.length === 1 ? layers[0] : { layers }, ops };
}

// ULTRA WILD. Earlier designs failed in instructive ways: independent rolls were
// incoherent junk, a musical contract alone gave all grid sequences, character singles
// sat high-pitched, tail-less and unevenly loud. This version designs against the spam
// test ("what wouldn't I mind being spammed with" - a notification-sound spec) and real
// reference marks (rising two-note purchase chime, tuned double knock, ding-dong):
// - REGISTER: warm mid band dominates (280-700 root, 60%); nothing above 1100 root and a
//   hard 2400 Hz ceiling on ANY partial (was: roots to 1600, partials to 6000 = "caps out").
// - TAIL: a tasteful reference-pack-style shimmer is the DEFAULT (~2/3 of sounds; delay .08-.14,
//   feedback .18-.3, wet .12-.2, lowpass 2.8-4.5k) and final notes decay >= 0.15 - kills
//   both "stops really hard" and "missing the beautiful trail".
// - LOUDNESS: per-patch gain normalization (loudest layer lands 0.15-0.2, total capped) -
//   kills the "empty" rolls and evens the batch.
// - DECK: iconic one/two/three-beat marks only (boop, pop, dew, wood, knock-knock, bell,
//   glass, ding-dong, pair, grace, tri-rise, thump-sparkle, echo-note; roll/trill/
//   call-response rare). Cut entirely: bend and run (transition smell), bubble and bare
//   hit (the mid filler), long noise anything.
// - WARMTH: long final notes may gain a detuned unison ghost (+6-14 cents, ~55% gain).
// v4.1 same day ("more variety, futuristic, not retro"): +9 futurist voices at ~half the
// deck (liquid, crystal, formant, glow, air, hollow, duotone, rise-bloom, haptic) using
// the previously untouched synth tools: FM timbre, filter envelopes on tonal layers,
// glide-with-hold, un-ramped natural ring-out, detuned duos, noise as breath.
const logUniform = (rng: () => number, lo: number, hi: number) =>
  Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)));

// Interval palettes (semitones above root). Deliberately NOT the composer's consonant
// chord sets - these are the flavors the library does not have yet.
export const ULTRA_SCALES: Record<string, readonly number[]> = {
  pentatonic: [0, 2, 4, 7, 9, 12],
  "whole-tone": [0, 2, 4, 6, 8, 10, 12],
  quartal: [0, 5, 10, 15],
  hirajoshi: [0, 2, 3, 7, 8, 12],
  "minor-pent": [0, 3, 5, 7, 10, 12],
  lydian: [0, 2, 4, 6, 7, 11, 12],
  harmonics: [0, 12, 19, 24, 28, 31],
};

const ULTRA_CEILING = Math.min(2400, LIMITS.sineCeilingHz);
const uClamp = (f: number) => round3(clamp(f, 60, ULTRA_CEILING));

export interface UltraContract {
  root: number;
  scale: readonly number[];
  scaleName: string;
  wave: Waveform;
  fm?: { depth: number; ratio: number };
  attack: number;
  gap: number;
  accel: number;
  ramp: boolean;
}

function ultraContract(rng: () => number): UltraContract {
  const scaleName = pick(Object.keys(ULTRA_SCALES), rng);
  // Register bands: warm mid dominates; the old high band (to 1600) read as piercing.
  const band = rng();
  const root =
    band < 0.15 ? logUniform(rng, 150, 280) : band < 0.75 ? logUniform(rng, 280, 700) : logUniform(rng, 700, 1100);
  return {
    root: round3(root),
    scale: ULTRA_SCALES[scaleName],
    scaleName,
    wave: pick(["sine", "sine", "sine", "sine", "triangle", "triangle"] as const, rng),
    ...(rng() < 0.15 ? { fm: { depth: Math.round(r(rng, 20, 120)), ratio: round3(r(rng, 0.5, 2.5)) } } : {}),
    attack: round3(rng() < 0.7 ? r(rng, 0.002, 0.008) : r(rng, 0.01, 0.03)),
    gap: round3(r(rng, 0.05, 0.12)),
    accel: rng() < 0.3 ? round3(r(rng, 0.75, 0.92)) : 1,
    ramp: rng() < 0.6,
  };
}

// One note of the contract: pitch from the scale, timbre and articulation shared.
function ultraNote(
  c: UltraContract,
  rng: () => number,
  opts: { degree: number; delay: number; decay: number; gain: number; sweepToDegree?: number },
): Layer {
  const freq = uClamp(c.root * 2 ** (opts.degree / 12));
  return {
    source: {
      type: c.wave,
      frequency:
        opts.sweepToDegree !== undefined
          ? { start: freq, end: uClamp(c.root * 2 ** (opts.sweepToDegree / 12)) }
          : freq,
      ...(c.fm ? { fm: { ...c.fm } } : {}),
    },
    envelope: {
      attack: c.attack,
      decay: round3(clamp(opts.decay, 0.02, 0.6)),
      sustain: 0,
      release: 0,
      ...(c.ramp ? { curve: "ramp" as const } : {}),
    },
    gain: round3(clamp(opts.gain, 0.03, 0.26)),
    ...(opts.delay > 0 ? { delay: round3(opts.delay) } : {}),
  };
}

// A degree from the scale, octave-folded so motifs can leave the base octave coherently.
const deg = (c: UltraContract, i: number) => {
  const n = c.scale.length - 1; // last entry is the octave
  const oct = Math.floor(i / n);
  return c.scale[i % n] + 12 * oct;
};

// Warmth: a detuned unison ghost under a long note (chorus-thick, the "expensive" body).
const warmed = (note: Layer, rng: () => number): Layer[] => {
  const ghost = structuredClone(note);
  if (ghost.source.type !== "noise") ghost.source.detune = Math.round(r(rng, 6, 14));
  ghost.gain = round3((note.gain ?? 0.1) * 0.55);
  return [note, ghost];
};

// Gestures: iconic articulation marks (no category semantics). Each speaks the
// contract's scale on the contract's grid. Weighted deck below.
// Exported for invent.ts (the Galaxy stop), which speaks this deck through a tamed contract.
export const ULTRA_GESTURES: Record<string, (c: UltraContract, rng: () => number) => Layer[]> = {
  // --- singles
  boop: (c, rng) => {
    const base = ultraNote(c, rng, {
      degree: 0,
      delay: 0,
      decay: r(rng, 0.1, 0.22),
      gain: r(rng, 0.14, 0.2),
      ...(rng() < 0.55 ? { sweepToDegree: -r(rng, 1, 2.5) } : {}),
    });
    return rng() < 0.35
      ? [base, ultraNote(c, rng, { degree: 12, delay: 0, decay: r(rng, 0.06, 0.12), gain: r(rng, 0.03, 0.06) })]
      : [base];
  },
  pop: (c, rng) => [
    // Fast octave drop: körperlich, sub-warm, spam-proof.
    ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.09, 0.16), gain: r(rng, 0.16, 0.22), sweepToDegree: -12 }),
    ...(rng() < 0.4
      ? [ultraNote(c, rng, { degree: -12, delay: r(rng, 0.01, 0.03), decay: r(rng, 0.1, 0.18), gain: r(rng, 0.05, 0.09) })]
      : []),
  ],
  dew: (c, rng) =>
    // Soft up-flick into a held tone: gentle, bright without height.
    warmed(
      ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.18, 0.32), gain: r(rng, 0.13, 0.18), sweepToDegree: r(rng, 1.5, 3) }),
      rng,
    ),
  wood: (c, rng) => {
    // Tuned knock: low register forced, triangle through a lowpass, dead short.
    const f = clamp(c.root, 130, 380);
    const hit = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.07, 0.14), gain: r(rng, 0.16, 0.24) });
    if (hit.source.type !== "noise") {
      hit.source.frequency = round3(f);
      hit.source.type = "triangle";
    }
    hit.filter = { type: "lowpass", frequency: Math.round(r(rng, 700, 1400)), Q: round3(r(rng, 0.7, 1.4)) };
    return [hit];
  },
  bell: (c, rng) => {
    // Partial stack (glockenspiel/bell), gains falling with height, ceiling-capped.
    const partials = rng() < 0.5 ? [1, 2.76, 5.4] : [1, 2, 3];
    const detune = rng() < 0.4 ? Math.round(r(rng, 4, 12)) : 0;
    return partials.map((p, i) => {
      const l = ultraNote(c, rng, {
        degree: 0,
        delay: 0,
        decay: r(rng, 0.28, 0.45) / (i + 1),
        gain: r(rng, 0.13, 0.18) / (i * 1.8 + 1),
      });
      if (l.source.type !== "noise") {
        l.source.frequency = uClamp(c.root * p);
        l.source.type = "sine";
        if (detune && i > 0) l.source.detune = detune;
      }
      return l;
    });
  },
  glass: (c, rng) => {
    const f = clamp(c.root * 1.6, 600, 1400);
    return [1, 1.5, 2].slice(0, pick([2, 3] as const, rng)).map((p, i) => {
      const l = ultraNote(c, rng, {
        degree: 0,
        delay: i * r(rng, 0.004, 0.012),
        decay: r(rng, 0.16, 0.3),
        gain: r(rng, 0.1, 0.14) / (i * 1.1 + 1),
      });
      if (l.source.type !== "noise") {
        l.source.frequency = uClamp(f * p);
        l.source.type = "sine";
      }
      return l;
    });
  },
  "echo-note": (c, rng) => {
    // The tail IS the gesture: one note, generous but tasteful feedback echo.
    const l = ultraNote(c, rng, { degree: pick([0, 0, 2, 4] as const, rng), delay: 0, decay: r(rng, 0.08, 0.15), gain: r(rng, 0.14, 0.19) });
    l.effects = [
      {
        type: "delay",
        delay: round3(r(rng, 0.1, 0.18)),
        feedback: round3(r(rng, 0.3, 0.42)),
        wet: round3(r(rng, 0.22, 0.32)),
        lowpass: Math.round(r(rng, 2200, 4000)),
      },
    ];
    return [l];
  },
  // --- doubles
  "knock-knock": (c, rng) => {
    // Two tuned knocks (the workplace-notification double).
    const f = clamp(c.root, 140, 400);
    const gap = r(rng, 0.09, 0.15);
    const drop = pick([0, -2, -3] as const, rng);
    return [0, 1].map((i) => {
      const hit = ultraNote(c, rng, {
        degree: i === 0 ? 0 : drop,
        delay: i * gap,
        decay: i === 0 ? r(rng, 0.06, 0.1) : r(rng, 0.15, 0.25),
        gain: r(rng, 0.16, 0.22) * (i === 0 ? 1 : 0.92),
      });
      if (hit.source.type !== "noise") {
        hit.source.frequency = round3(f * 2 ** ((i === 0 ? 0 : drop) / 12));
        hit.source.type = "triangle";
      }
      hit.filter = { type: "lowpass", frequency: Math.round(r(rng, 800, 1500)), Q: round3(r(rng, 0.7, 1.3)) };
      return hit;
    });
  },
  "ding-dong": (c, rng) => {
    // Two-note doorbell descend: instantly familiar, endlessly spammable.
    const down = pick([3, 4, 5] as const, rng);
    const gap = c.gap * r(rng, 1.8, 2.6);
    const first = ultraNote(c, rng, { degree: down, delay: 0, decay: r(rng, 0.12, 0.2), gain: r(rng, 0.13, 0.18) });
    const second = ultraNote(c, rng, { degree: 0, delay: gap, decay: r(rng, 0.22, 0.38), gain: r(rng, 0.14, 0.19) });
    return rng() < 0.5 ? [first, ...warmed(second, rng)] : [first, second];
  },
  pair: (c, rng) => {
    const a = Math.floor(r(rng, 0, 3));
    const b = a + Math.floor(r(rng, 1, 4));
    const rising = rng() < 0.6;
    const [d1, d2] = rising ? [a, b] : [b, a];
    return [
      ultraNote(c, rng, { degree: deg(c, d1), delay: 0, decay: r(rng, 0.06, 0.12), gain: r(rng, 0.12, 0.17) }),
      ultraNote(c, rng, { degree: deg(c, d2), delay: c.gap * r(rng, 1.4, 2.2), decay: r(rng, 0.18, 0.34), gain: r(rng, 0.13, 0.19) }),
    ];
  },
  grace: (c, rng) => {
    const main = Math.floor(r(rng, 1, 4));
    return [
      ultraNote(c, rng, { degree: deg(c, main - 1), delay: 0, decay: r(rng, 0.025, 0.045), gain: r(rng, 0.06, 0.1) }),
      ultraNote(c, rng, { degree: deg(c, main), delay: r(rng, 0.03, 0.055), decay: r(rng, 0.18, 0.34), gain: r(rng, 0.14, 0.19) }),
    ];
  },
  "thump-sparkle": (c, rng) => {
    const thump = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.08, 0.14), gain: r(rng, 0.17, 0.24) });
    if (thump.source.type !== "noise") {
      thump.source.frequency = round3(clamp(c.root / 4, 85, 200));
      thump.source.type = "sine";
    }
    const spark = ultraNote(c, rng, { degree: 0, delay: r(rng, 0.04, 0.1), decay: r(rng, 0.14, 0.24), gain: r(rng, 0.06, 0.1) });
    if (spark.source.type !== "noise") {
      spark.source.frequency = uClamp(clamp(c.root * r(rng, 2.5, 4), 800, 2200));
      spark.source.type = "sine";
    }
    return [thump, spark];
  },
  // --- triples
  "tri-rise": (c, rng) => {
    // Two quick steps into a held third note (the purchase-success shape).
    const steps = pick([[0, 1, 3], [0, 2, 4], [0, 1, 2]] as const, rng);
    const gap = c.gap * r(rng, 0.9, 1.3);
    let t = 0;
    const layers: Layer[] = [];
    steps.forEach((s, i) => {
      const last = i === steps.length - 1;
      const note = ultraNote(c, rng, {
        degree: deg(c, s),
        delay: t,
        decay: last ? r(rng, 0.24, 0.4) : r(rng, 0.05, 0.09),
        gain: r(rng, 0.12, 0.17) * (last ? 1.15 : 1),
      });
      t += gap * Math.pow(c.accel, i);
      if (last && rng() < 0.5) layers.push(...warmed(note, rng));
      else layers.push(note);
    });
    return layers;
  },
  roll: (c, rng) => {
    const d = Math.floor(r(rng, 0, 3));
    const hits = pick([3, 4] as const, rng);
    const alt = rng() < 0.4;
    let t = 0;
    return Array.from({ length: hits }, (_, i) => {
      const delay = t;
      t += c.gap * Math.pow(c.accel, i);
      const last = i === hits - 1;
      return ultraNote(c, rng, {
        degree: deg(c, d) + (alt && i % 2 === 1 ? 12 : 0),
        delay,
        decay: last ? r(rng, 0.16, 0.3) : r(rng, 0.03, 0.06),
        gain: r(rng, 0.1, 0.16),
      });
    });
  },
  trill: (c, rng) => {
    const hits = pick([5, 6] as const, rng);
    const g = r(rng, 0.028, 0.045);
    const a = Math.floor(r(rng, 0, 2));
    const b = a + pick([1, 2] as const, rng);
    return Array.from({ length: hits }, (_, i) =>
      ultraNote(c, rng, {
        degree: deg(c, i % 2 === 0 ? a : b),
        delay: i * g,
        decay: i === hits - 1 ? r(rng, 0.14, 0.24) : r(rng, 0.025, 0.045),
        gain: r(rng, 0.08, 0.13),
      }),
    );
  },
  "call-response": (c, rng) => {
    const call = Math.floor(r(rng, 2, 5));
    const answer = rng() < 0.5 ? 0 : call + pick([-1, 1, 2] as const, rng);
    return [
      ultraNote(c, rng, { degree: deg(c, call), delay: 0, decay: r(rng, 0.06, 0.12), gain: r(rng, 0.12, 0.17) }),
      ultraNote(c, rng, { degree: deg(c, Math.max(0, answer)), delay: c.gap * r(rng, 2.2, 3.2), decay: r(rng, 0.2, 0.36), gain: r(rng, 0.13, 0.19) }),
    ];
  },

  // --- v4.1 futurist voices (added on request: "half of these should be a new sound
  // altogether - futuristic, modern, clean, not retro"). These reach for the synth tools
  // the classic gestures never touch: FM timbre, filter envelopes on TONAL layers,
  // glide-with-hold, un-ramped natural ring-out, detuned duos, noise as breath.
  liquid: (c, rng) => {
    // FM droplet-in-glass: small down-glide that lands and holds, FM smoothing the edge.
    const l = ultraNote(c, rng, { degree: 2, delay: 0, decay: r(rng, 0.18, 0.3), gain: r(rng, 0.15, 0.2) });
    if (l.source.type !== "noise") {
      l.source.type = "sine";
      l.source.frequency = { start: uClamp(c.root * 2 ** (2 / 12)), end: uClamp(c.root), time: round3(r(rng, 0.05, 0.1)) };
      l.source.fm = { depth: Math.round(r(rng, 40, 120)), ratio: round3(r(rng, 1.3, 2.6)) };
    }
    return [l];
  },
  crystal: (c, rng) => {
    // FM bell: inharmonic like a real bell but glassy-smooth, one strike, long ring.
    const l = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.3, 0.45), gain: r(rng, 0.15, 0.2) });
    if (l.source.type !== "noise") {
      l.source.type = "sine";
      l.source.frequency = uClamp(clamp(c.root * 2, 500, 1600));
      l.source.fm = { depth: Math.round(r(rng, 60, 140)), ratio: pick([2.76, 3.53, 4.16] as const, rng) };
    }
    return [l];
  },
  formant: (c, rng) => {
    // Vowel-ish "bwoop": a tonal layer whose bandpass OPENS via filter envelope.
    const l = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.14, 0.24), gain: r(rng, 0.16, 0.22) });
    if (l.source.type !== "noise") l.source.type = "triangle";
    const base = Math.round(clamp(c.root * r(rng, 1, 1.4), 250, 1200));
    l.filter = {
      type: "bandpass",
      frequency: base,
      Q: round3(r(rng, 2.5, 5)),
      envelope: {
        attack: round3(r(rng, 0.004, 0.012)),
        peak: Math.round(clamp(base * r(rng, 2, 3.5), 600, 2800)),
        decay: round3(r(rng, 0.08, 0.18)),
      },
    };
    return [l];
  },
  glow: (c, rng) => {
    // Soft orb: un-ramped envelopes ring out naturally; a low octave breathes underneath.
    const main = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.25, 0.4), gain: r(rng, 0.14, 0.18) });
    const sub = ultraNote(c, rng, { degree: -12, delay: 0, decay: r(rng, 0.3, 0.45), gain: r(rng, 0.05, 0.08) });
    for (const l of [main, sub]) {
      if (l.envelope) {
        l.envelope.attack = round3(r(rng, 0.008, 0.02));
        delete l.envelope.curve;
      }
      if (l.source.type !== "noise") l.source.type = "sine";
    }
    return [main, sub];
  },
  air: (c, rng) => {
    // Breath-tap: pink/brown air puff with a quiet fundamental inside (laptop-key soft).
    const breath: Layer = {
      source: { type: "noise", color: pick(["pink", "brown"] as const, rng) },
      envelope: { attack: round3(r(rng, 0.002, 0.006)), decay: round3(r(rng, 0.04, 0.08)), sustain: 0, release: 0, curve: "ramp" },
      gain: round3(r(rng, 0.1, 0.14)),
      filter: { type: "lowpass", frequency: Math.round(r(rng, 600, 1100)), Q: round3(r(rng, 0.6, 1)) },
    };
    return [breath, ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.08, 0.15), gain: r(rng, 0.12, 0.16) })];
  },
  hollow: (c, rng) => {
    // Resonant tube: triangle squeezed through a high-Q bandpass at its own pitch.
    const l = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.15, 0.28), gain: r(rng, 0.17, 0.23) });
    if (l.source.type !== "noise") l.source.type = "triangle";
    l.filter = { type: "bandpass", frequency: Math.round(clamp(c.root * r(rng, 0.9, 1.3), 200, 1400)), Q: round3(r(rng, 6, 10)) };
    return rng() < 0.35
      ? [l, ultraNote(c, rng, { degree: 12, delay: r(rng, 0.005, 0.02), decay: r(rng, 0.08, 0.14), gain: r(rng, 0.03, 0.05) })]
      : [l];
  },
  duotone: (c, rng) => {
    // Brand-tone: sine + triangle an octave apart, gently detuned, un-ramped long ring.
    const low = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.22, 0.36), gain: r(rng, 0.14, 0.18) });
    const high = ultraNote(c, rng, { degree: 12, delay: 0, decay: r(rng, 0.2, 0.32), gain: r(rng, 0.06, 0.09) });
    if (low.source.type !== "noise") low.source.type = "sine";
    if (high.source.type !== "noise") {
      high.source.type = "triangle";
      high.source.detune = Math.round(r(rng, 5, 10));
    }
    for (const l of [low, high]) if (l.envelope) delete l.envelope.curve;
    return [low, high];
  },
  "rise-bloom": (c, rng) => {
    // Unlock: a fifth-up glide that lands and holds while a soft upper voice fades in.
    const glide = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.25, 0.4), gain: r(rng, 0.14, 0.19) });
    if (glide.source.type !== "noise") {
      glide.source.type = "sine";
      glide.source.frequency = { start: uClamp(c.root), end: uClamp(c.root * 2 ** (7 / 12)), time: round3(r(rng, 0.05, 0.09)) };
    }
    const bloom = ultraNote(c, rng, { degree: pick([12, 7] as const, rng), delay: r(rng, 0.03, 0.06), decay: r(rng, 0.25, 0.4), gain: r(rng, 0.06, 0.1) });
    if (bloom.envelope) bloom.envelope.attack = round3(r(rng, 0.05, 0.09));
    return [glide, bloom];
  },
  // --- broadened vocabulary: physics, plucked strings,
  // filtered-air motion, descending shapes, chordal pads - the families the deck lacked.
  // Same contract discipline as v4; all inside the player whitelist.
  bounce: (c, rng) => {
    // Ball-drop settle: same note repeated with geometrically shrinking gap and gain.
    const f = clamp(c.root, 160, 500);
    const hits = pick([4, 5] as const, rng);
    const g0 = r(rng, 0.1, 0.16);
    const shrink = r(rng, 0.58, 0.7);
    let t = 0;
    return Array.from({ length: hits }, (_, i) => {
      const delay = t;
      t += g0 * shrink ** i;
      const last = i === hits - 1;
      const hit = ultraNote(c, rng, {
        degree: 0,
        delay,
        decay: last ? r(rng, 0.12, 0.2) : r(rng, 0.04, 0.07),
        gain: r(rng, 0.15, 0.2) * 0.85 ** i,
      });
      if (hit.source.type !== "noise") {
        hit.source.frequency = round3(f * (1 + i * 0.015));
        hit.source.type = "triangle";
      }
      hit.filter = { type: "lowpass", frequency: Math.round(r(rng, 900, 1600)), Q: round3(r(rng, 0.7, 1.2)) };
      return hit;
    });
  },
  pluck: (c, rng) => {
    // Karplus-ish string: bright saw/triangle attack darkening fast through a closing lowpass.
    const l = ultraNote(c, rng, { degree: pick([0, 2, 4] as const, rng), delay: 0, decay: r(rng, 0.16, 0.3), gain: r(rng, 0.14, 0.19) });
    if (l.source.type !== "noise") l.source.type = rng() < 0.6 ? "sawtooth" : "triangle";
    const f = l.source.type === "noise" ? c.root : (typeof l.source.frequency === "number" ? l.source.frequency : l.source.frequency.start);
    l.filter = {
      type: "lowpass",
      frequency: Math.round(clamp(f * r(rng, 1.2, 1.8), 300, 1600)),
      Q: round3(r(rng, 0.8, 1.6)),
      envelope: {
        attack: 0.001,
        peak: Math.round(clamp(f * r(rng, 4, 7), 1200, 5000)),
        decay: round3(r(rng, 0.05, 0.12)),
      },
    };
    return [l];
  },
  whoosh: (c, rng) => {
    // Filtered-air swish: pink breath whose bandpass sweeps, a quiet glide inside. Short
    // on purpose - long noise stays cut from the deck (v4 call).
    const up = rng() < 0.55;
    const base = Math.round(clamp(c.root * (up ? 1 : 3), 300, 1800));
    const breath: Layer = {
      source: { type: "noise", color: pick(["pink", "brown"] as const, rng) },
      envelope: { attack: round3(r(rng, 0.02, 0.05)), decay: round3(r(rng, 0.12, 0.22)), sustain: 0, release: 0, curve: "ramp" },
      gain: round3(r(rng, 0.12, 0.17)),
      filter: {
        type: "bandpass",
        frequency: base,
        Q: round3(r(rng, 1.2, 2.4)),
        envelope: { attack: round3(r(rng, 0.06, 0.14)), peak: Math.round(clamp(base * (up ? r(rng, 2.5, 4) : r(rng, 0.25, 0.45)), 200, 4000)), decay: round3(r(rng, 0.08, 0.16)) },
      },
    };
    if (rng() < 0.5) {
      const glide = ultraNote(c, rng, { degree: 0, delay: 0.01, decay: r(rng, 0.14, 0.22), gain: r(rng, 0.05, 0.08), sweepToDegree: up ? 7 : -7 });
      return [breath, glide];
    }
    return [breath];
  },
  cascade: (c, rng) => {
    // Waterfall: 3-4 scale steps DOWN, earlier notes damped, last held. The deck's only
    // committed descending run (ding-dong is a two-note nod, this is the full gesture).
    const steps = pick([[4, 2, 0], [5, 3, 1, 0], [3, 1, 0]] as const, rng);
    const gap = c.gap * r(rng, 1, 1.4);
    let t = 0;
    return steps.map((s, i) => {
      const last = i === steps.length - 1;
      const note = ultraNote(c, rng, {
        degree: deg(c, s),
        delay: t,
        decay: last ? r(rng, 0.2, 0.34) : r(rng, 0.05, 0.09),
        gain: r(rng, 0.11, 0.16) * (last ? 1.1 : 1),
      });
      t += gap * Math.pow(c.accel, i);
      return note;
    });
  },
  harp: (c, rng) => {
    // Gliss: 4-5 ascending scale notes at grace-note spacing, soft, last one rings.
    const hits = pick([4, 5] as const, rng);
    const g = r(rng, 0.02, 0.038);
    return Array.from({ length: hits }, (_, i) => {
      const last = i === hits - 1;
      return ultraNote(c, rng, {
        degree: deg(c, i),
        delay: i * g,
        decay: last ? r(rng, 0.24, 0.4) : r(rng, 0.08, 0.14),
        gain: r(rng, 0.07, 0.11) * (last ? 1.5 : 1),
      });
    });
  },
  pad: (c, rng) => {
    // Chordal swell: root + fifth/fourth + soft detuned octave, slow attack, natural
    // ring-out. The deck's only simultaneous chord - everything else is sequential.
    const mid = pick([5, 7] as const, rng);
    const attack = round3(r(rng, 0.03, 0.07));
    const notes = [
      ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.28, 0.42), gain: r(rng, 0.13, 0.17) }),
      ultraNote(c, rng, { degree: mid, delay: 0, decay: r(rng, 0.26, 0.38), gain: r(rng, 0.07, 0.1) }),
      ultraNote(c, rng, { degree: 12, delay: 0, decay: r(rng, 0.24, 0.36), gain: r(rng, 0.05, 0.08) }),
    ];
    for (const n of notes) {
      if (n.envelope) {
        n.envelope.attack = attack;
        delete n.envelope.curve;
      }
      if (n.source.type !== "noise") n.source.type = "sine";
    }
    const last = notes[2];
    if (last.source.type !== "noise") last.source.detune = Math.round(r(rng, 5, 11));
    return notes;
  },
  zip: (c, rng) => {
    // Fast rise-and-land: octave-up glide with a tiny arrival blip. Energetic micro-transition.
    const glide = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.09, 0.15), gain: r(rng, 0.13, 0.18) });
    if (glide.source.type !== "noise") {
      glide.source.frequency = { start: uClamp(c.root), end: uClamp(c.root * 2), time: round3(r(rng, 0.05, 0.09)) };
    }
    return rng() < 0.6
      ? [glide, ultraNote(c, rng, { degree: 12, delay: r(rng, 0.06, 0.1), decay: r(rng, 0.1, 0.18), gain: r(rng, 0.05, 0.08) })]
      : [glide];
  },
  "tick-tock": (c, rng) => {
    // Clock pair: two dry high woody ticks, second a step down. Drier, higher, and
    // shorter than knock-knock - a wristwatch, not a door.
    const f = clamp(c.root * 2, 500, 1200);
    const drop = pick([-2, -3, -4] as const, rng);
    const gap = r(rng, 0.11, 0.17);
    return [0, 1].map((i) => {
      const tick = ultraNote(c, rng, {
        degree: 0,
        delay: i * gap,
        decay: r(rng, 0.025, 0.05),
        gain: r(rng, 0.13, 0.18),
      });
      if (tick.source.type !== "noise") {
        tick.source.frequency = round3(f * 2 ** ((i === 0 ? 0 : drop) / 12));
        tick.source.type = "triangle";
      }
      tick.filter = { type: "bandpass", frequency: Math.round(f * r(rng, 1.1, 1.5)), Q: round3(r(rng, 2, 4)) };
      return tick;
    });
  },
  ripple: (c, rng) => {
    // Spreading rings: a strike plus two quieter echoes each a scale step up - discrete
    // pitched repeats, where echo-note is one pitch on a feedback tail.
    const g = r(rng, 0.08, 0.13);
    return [0, 1, 2].map((i) =>
      ultraNote(c, rng, {
        degree: deg(c, i),
        delay: i === 0 ? 0 : g * i * r(rng, 1, 1.25),
        decay: r(rng, 0.14, 0.24) * (1 - i * 0.15),
        gain: r(rng, 0.14, 0.18) * 0.6 ** i,
      }),
    );
  },
  marimba: (c, rng) => {
    // Warm wooden bar: low triangle fundamental + quiet 4x sine partial, lowpassed.
    const f = clamp(c.root, 150, 420);
    const bar = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.16, 0.28), gain: r(rng, 0.16, 0.21) });
    if (bar.source.type !== "noise") {
      bar.source.frequency = round3(f);
      bar.source.type = "triangle";
    }
    bar.filter = { type: "lowpass", frequency: Math.round(r(rng, 1000, 1800)), Q: round3(r(rng, 0.7, 1.2)) };
    const partial = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.05, 0.09), gain: r(rng, 0.04, 0.06) });
    if (partial.source.type !== "noise") {
      partial.source.frequency = uClamp(f * 4);
      partial.source.type = "sine";
    }
    return [bar, partial];
  },

  haptic: (c, rng) => {
    // Premium click: micro tick + sub thump + faint high sheen, tight as a solenoid.
    const tick: Layer = {
      source: { type: "noise", color: "white" },
      envelope: { attack: 0.001, decay: round3(r(rng, 0.008, 0.015)), sustain: 0, release: 0, curve: "ramp" },
      gain: round3(r(rng, 0.06, 0.09)),
      filter: { type: "bandpass", frequency: Math.round(clamp(c.root * 3, 900, 2000)), Q: round3(r(rng, 1.2, 2.2)) },
    };
    const thump = ultraNote(c, rng, { degree: 0, delay: 0, decay: r(rng, 0.05, 0.09), gain: r(rng, 0.16, 0.22) });
    if (thump.source.type !== "noise") {
      thump.source.type = "sine";
      thump.source.frequency = round3(clamp(c.root / 3, 90, 170));
    }
    const sheen = ultraNote(c, rng, { degree: 12, delay: r(rng, 0.004, 0.012), decay: r(rng, 0.06, 0.12), gain: r(rng, 0.03, 0.05) });
    return [tick, thump, sheen];
  },
};

// Uniform draw across every gesture (equal distribution for all;
// the weighted deck era ended once the voice set itself was strong enough).
const ULTRA_GESTURE_DECK: readonly string[] = Object.keys(ULTRA_GESTURES);

// Motif elaboration: a single-strike gesture becomes a 2-3 note motif on
// the contract scale, earlier strikes damped. Shared with invent.ts, which calls it on
// consonant scales; here it runs on the exotic ones. Root capped so the TOP strike stays
// inside the gesture's internal freq clamp - else high roots collapse the transposed
// strikes onto one clamped pitch.
const MOTIF_INNER_MAX: Record<string, number> = { crystal: 1600 / 2, glass: 1400 / 1.6, wood: 380, marimba: 420 };

export function strikeMotif(
  name: string,
  c: UltraContract,
  rng: () => number,
  descendChance = 0,
): Layer[] {
  const ups = c.scale.filter((s) => s > 0 && s <= 12);
  const degreePool = ups.length >= 2 ? ups : [5, 7, 12];
  let degrees: number[];
  if (rng() < 0.4) {
    const i1 = Math.floor(rng() * (degreePool.length - 1));
    const i2 = i1 + 1 + Math.floor(rng() * (degreePool.length - 1 - i1));
    degrees = [0, degreePool[i1], degreePool[i2]];
  } else {
    const up = pick(degreePool, rng);
    degrees = rng() < descendChance ? [up, 0] : [0, up];
  }
  const innerMax = MOTIF_INNER_MAX[name] ?? 1100;
  const root = Math.min(c.root, round3(innerMax / 2 ** (Math.max(...degrees) / 12)));
  const gap = r(rng, 0.09, 0.15);
  const layers: Layer[] = [];
  degrees.forEach((d, i) => {
    const last = i === degrees.length - 1;
    const strike = ULTRA_GESTURES[name]({ ...c, root: round3(root * 2 ** (d / 12)) }, rng);
    for (const l of strike) {
      l.delay = round3((l.delay ?? 0) + i * gap);
      if (!last) {
        if (l.envelope) l.envelope.decay = round3(l.envelope.decay * r(rng, 0.5, 0.7));
        l.gain = round3(Math.max(0.02, (l.gain ?? 0.1) * r(rng, 0.75, 0.9)));
      }
    }
    layers.push(...strike);
  });
  return layers;
}

// The single-strike voices ultra may elaborate into motifs; multi-note gestures already
// carry their own phrasing and stay untouched.
export const MOTIF_ABLE = new Set([
  "boop", "dew", "wood", "bell", "glass", "crystal", "echo-note",
  "liquid", "formant", "glow", "hollow", "duotone", "pluck", "marimba",
]);

// Reference-pack-tasteful shimmer: the default tail (the missing "beautiful trail").
export const gentleShimmer = (rng: () => number) => ({
  type: "delay" as const,
  delay: round3(r(rng, 0.08, 0.14)),
  feedback: round3(r(rng, 0.18, 0.3)),
  wet: round3(r(rng, 0.12, 0.2)),
  lowpass: Math.round(r(rng, 2800, 4500)),
});

// Even out perceived loudness across the batch: loudest layer lands in a fixed window,
// and CONCURRENT energy is capped (layers grouped by ~30ms onset bucket - a 6-hit trill
// is quiet notes in sequence, not one loud chord, so a whole-patch sum would wrongly
// crush every sequence gesture).
export function normalizeGains(layers: Layer[], rng: () => number): void {
  const maxG = Math.max(...layers.map((l) => l.gain ?? 0.1));
  const s = r(rng, 0.15, 0.2) / maxG;
  for (const l of layers) l.gain = round3(clamp((l.gain ?? 0.1) * s, 0.02, 0.24));
  const buckets = new Map<number, number>();
  for (const l of layers) {
    const b = Math.floor((l.delay ?? 0) / 0.03);
    buckets.set(b, (buckets.get(b) ?? 0) + (l.gain ?? 0));
  }
  const concurrent = Math.max(...buckets.values());
  if (concurrent > 0.45) {
    const k = 0.45 / concurrent;
    for (const l of layers) l.gain = round3((l.gain ?? 0.1) * k);
  }
}

// Duet pool: short single-strike voices that can
// stack under ONE shared contract without mud. The duet is what keeps it coherent:
// same root family (partner transposed a scale-consonant interval), same wave, same
// articulation - two characters speaking one sentence, not two sounds colliding.
const DUET_ABLE = new Set([
  "boop", "pop", "dew", "wood", "bell", "glass", "crystal",
  "liquid", "formant", "glow", "hollow", "duotone", "pluck", "marimba",
  "haptic", "thump-sparkle",
]);

export function ultraWild(rng: () => number = Math.random): WildResult {
  const c = ultraContract(rng);
  const gestureName = pick(ULTRA_GESTURE_DECK, rng);
  const motif = MOTIF_ABLE.has(gestureName) && rng() < 0.35;
  let layers = motif ? strikeMotif(gestureName, c, rng, 0.25) : ULTRA_GESTURES[gestureName](c, rng);
  let voiceLabel = `${gestureName}${motif ? " motif" : ""}`;

  // ~20% of non-motif single-strike pulls become a duet: a second voice answers on the
  // same contract, damped and delayed, partner root moved a consonant interval.
  if (!motif && DUET_ABLE.has(gestureName) && rng() < 0.2) {
    const partner = pick([...DUET_ABLE].filter((g) => g !== gestureName), rng);
    const shift = pick([0, 5, 7, 12] as const, rng);
    const second = ULTRA_GESTURES[partner]({ ...c, root: round3(c.root * 2 ** (shift / 12)) }, rng);
    const offset = round3(r(rng, 0.06, 0.16));
    for (const l of second) {
      l.delay = round3((l.delay ?? 0) + offset);
      l.gain = round3(Math.max(0.02, (l.gain ?? 0.1) * 0.6));
    }
    if (layers.length + second.length <= 7) {
      layers = [...layers, ...second];
      voiceLabel = `${gestureName}+${partner}`;
    }
  }

  // 20%: one shared transient tick at onset 0 (an articulation, not a competing voice).
  if (rng() < 0.2) {
    layers.unshift({
      source: { type: "noise", color: pick(["white", "pink"] as const, rng) },
      envelope: { attack: 0.001, decay: round3(r(rng, 0.008, 0.02)), sustain: 0, release: 0, curve: "ramp" },
      gain: round3(r(rng, 0.04, 0.07)),
      filter: { type: "bandpass", frequency: Math.round(clamp(c.root * r(rng, 1.5, 3), 500, 2400)), Q: round3(r(rng, 1, 2.5)) },
    });
  }

  // The trail: unless the gesture brought its own echo, most sounds get the gentle
  // reference-pack-style shimmer; a few get a small reverb; the rest stay dry on purpose.
  if (!layers.some((l) => l.effects)) {
    const roll = rng();
    if (roll < 0.65) {
      const fx = gentleShimmer(rng);
      for (const l of layers) l.effects = [fx];
    } else if (roll < 0.75) {
      const fx = { type: "reverb" as const, decay: round3(r(rng, 0.35, 0.8)), mix: round3(r(rng, 0.08, 0.18)) };
      for (const l of layers) l.effects = [fx];
    }
  }

  enforceLimits(layers);
  normalizeGains(layers, rng);

  return {
    patch: layers.length === 1 ? layers[0] : { layers },
    label: `${c.scaleName} · ${voiceLabel}`,
  };
}

// Ultra's finish applied to a remix: calibrated limits (ceiling per timbre, lowpass on
// bright saw/square, Q cap - lib/audio/limits.ts), then a wild-only ultra ceiling,
// guaranteed tail, and the loudness window. Remix character untouched.
function finishWild(patch: Patch, rng: () => number): Patch {
  const layers = layersOf(patch).map((l) => structuredClone(l));
  enforceLimits(layers);
  for (const l of layers) {
    if (l.source.type === "noise") continue;
    const f = l.source.frequency;
    l.source.frequency =
      typeof f === "number" ? uClamp(f) : { ...f, start: uClamp(f.start), end: uClamp(f.end) };
  }
  const last = layers.reduce((a, b) => ((b.delay ?? 0) >= (a.delay ?? 0) ? b : a));
  if (last.envelope && last.envelope.decay + (last.envelope.release ?? 0) < 0.15) {
    last.envelope.decay = round3(0.15 - (last.envelope.release ?? 0));
  }
  normalizeGains(layers, rng);
  return layers.length === 1 ? layers[0] : { layers };
}

export function wild(parents: Patch[], rng: () => number = Math.random): WildResult {
  const roll = rng();
  if (roll < 0.4 || parents.length < 2) {
    const { patch, archetype } = compose("all", {}, rng);
    const w = warp(patch, rng);
    return { patch: finishWild(w.patch, rng), label: `${archetype} → ${w.ops.join("+")}` };
  }
  const a = parents[Math.floor(rng() * parents.length)];
  let b = parents[Math.floor(rng() * parents.length)];
  for (let i = 0; i < 5 && b === a; i++) b = parents[Math.floor(rng() * parents.length)];
  const hybrid = hybridize(a, b, rng);
  // The "sounds like it almost belongs" tail: half of these plain cross-breeds take
  // exactly ONE warp op (settled by A/B ear test, replacing the old
  // always-off workbench toggle). Keeping half plain preserves the familiar end of
  // Singularity's range; the deeper 2-4 warp branch below is untouched.
  if (roll < 0.7) {
    if (rng() < 0.5) return { patch: finishWild(hybrid.patch, rng), label: "cross-breed" };
    const w = warp(hybrid.patch, rng, 1);
    return { patch: finishWild(w.patch, rng), label: `cross-breed → ${w.ops[0]}` };
  }
  const w = warp(hybrid.patch, rng);
  return { patch: finishWild(w.patch, rng), label: `cross-breed → ${w.ops.join("+")}` };
}

// The single discovery draw (product Singularity stop + workbench dial).
export function discovery(
  parents: Patch[],
  ultraShare = 0.7,
  rng: () => number = Math.random,
): WildResult {
  return rng() < ultraShare ? ultraWild(rng) : wild(parents, rng);
}

