import type { Category } from "./categories";
import { enforceLimits } from "./limits";
import type { DelayEffect, Layer, Patch } from "./patch";
import { layersOf } from "./patch";

// The COMPOSER: de-novo synthesis, the third engine. No seed - patches are written from
// first principles: per-category archetypes (design grammars with layer ROLES: body,
// transient, harmonic, air, tail) whose parameters randomize inside psychoacoustic
// constraints (consonant intervals, gesture-plausible durations, register limits measured
// from the library). NOT uniform RNG over the parameter space - that is the jsfxr garbage
// this project exists to escape; the randomness lives strictly inside the design rules.
// Second strategy: HYBRID - structural skeleton from parent A, timbre from parent B.
// Archetype dice are weighted by keep/delete history (data/pool/invent-feedback.json).

export interface ComposeResult {
  patch: Patch;
  archetype: string;
}

export type InventStats = Partial<Record<Category, Record<string, { k: number; d: number }>>>;

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const semi = (f: number, s: number) => f * Math.pow(2, s / 12);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Consonant chord shapes (semitones above root) for success/notification motifs.
const CONSONANT_SETS = [
  [0, 4, 7],
  [0, 5, 9],
  [0, 7, 12],
  [0, 4, 9],
  [0, 5, 12],
] as const;

function tone(
  rng: () => number,
  opts: {
    freq: number;
    sweepTo?: number;
    wave?: "sine" | "triangle" | "square" | "sawtooth";
    attack: number;
    decay: number;
    gain: number;
    delay?: number;
    ramp?: boolean;
    detune?: number;
  },
): Layer {
  const freq = round3(opts.freq);
  return {
    source: {
      type: opts.wave ?? "sine",
      frequency: opts.sweepTo ? { start: freq, end: round3(opts.sweepTo) } : freq,
      ...(opts.detune ? { detune: opts.detune } : {}),
    },
    envelope: {
      attack: round3(opts.attack),
      decay: round3(opts.decay),
      sustain: 0,
      release: 0,
      ...(opts.ramp !== false ? { curve: "ramp" as const } : {}),
    },
    gain: round3(opts.gain),
    ...(opts.delay ? { delay: round3(opts.delay) } : {}),
  };
}

function noise(
  rng: () => number,
  opts: {
    filterType: BiquadFilterType;
    filterFreq: number;
    Q?: number;
    filterPeak?: number;
    attack: number;
    decay: number;
    gain: number;
    delay?: number;
  },
): Layer {
  return {
    source: { type: "noise", color: "white" },
    envelope: { attack: round3(opts.attack), decay: round3(opts.decay), sustain: 0, release: 0, curve: "ramp" },
    gain: round3(opts.gain),
    filter: {
      type: opts.filterType,
      frequency: Math.round(opts.filterFreq),
      ...(opts.Q ? { Q: round3(opts.Q) } : {}),
      ...(opts.filterPeak
        ? { envelope: { attack: round3(opts.attack), peak: Math.round(opts.filterPeak), decay: round3(opts.decay) } }
        : {}),
    },
    ...(opts.delay ? { delay: round3(opts.delay) } : {}),
  };
}

function shimmer(rng: () => number): DelayEffect {
  return {
    type: "delay",
    delay: round3(r(rng, 0.06, 0.14)),
    feedback: round3(r(rng, 0.18, 0.32)),
    wet: round3(r(rng, 0.1, 0.2)),
    lowpass: Math.round(r(rng, 2500, 5500)),
  };
}

const withShimmer = (layers: Layer[], rng: () => number): Layer[] => {
  const fx = shimmer(rng);
  return layers.map((l) => ({ ...l, effects: [fx] }));
};

// Archetype builders per category. Each returns the layers of one composed sound.
// Archetypes are keyed by grammar scope: the seven real categories plus `all`, the merged
// set. A scope is NOT a category; nothing here can become a membership.
export type ArchetypeScope = Category | "all";

const ARCHETYPES: Record<ArchetypeScope, Record<string, (rng: () => number) => Layer[]>> = {
  tap: {
    "clean-blip": (rng) => {
      const f = r(rng, 400, 1400);
      const down = rng() < 0.5;
      return [
        tone(rng, {
          freq: f,
          sweepTo: rng() < 0.6 ? semi(f, down ? -r(rng, 2, 5) : r(rng, 2, 5)) : undefined,
          wave: pick(["sine", "triangle"] as const, rng),
          attack: r(rng, 0.001, 0.006),
          decay: r(rng, 0.04, 0.11),
          gain: r(rng, 0.15, 0.28),
        }),
      ];
    },
    thock: (rng) => [
      noise(rng, { filterType: "bandpass", filterFreq: r(rng, 800, 2500), Q: r(rng, 1, 2), attack: 0.001, decay: r(rng, 0.008, 0.025), gain: r(rng, 0.06, 0.12) }),
      tone(rng, { freq: r(rng, 120, 350), attack: 0.002, decay: r(rng, 0.04, 0.09), gain: r(rng, 0.15, 0.3) }),
    ],
    "double-tick": (rng) => {
      const f = r(rng, 350, 1600);
      const gap = r(rng, 0.025, 0.1);
      const wave = pick(["sine", "triangle"] as const, rng);
      const layers = [
        tone(rng, { freq: f, wave, attack: 0.001, decay: r(rng, 0.015, 0.07), gain: r(rng, 0.12, 0.2) }),
        tone(rng, { freq: semi(f, pick([-12, -7, -5, 2, 5, 7, 12] as const, rng)), wave, attack: 0.001, decay: r(rng, 0.02, 0.08), gain: r(rng, 0.08, 0.2), delay: gap }),
      ];
      if (rng() < 0.25) {
        layers.push(tone(rng, { freq: semi(f, pick([4, 7, 12] as const, rng)), wave, attack: 0.001, decay: r(rng, 0.02, 0.06), gain: r(rng, 0.07, 0.14), delay: gap * 2 }));
      }
      return layers;
    },
  },
  hover: {
    "air-whisper": (rng) => [
      noise(rng, { filterType: "lowpass", filterFreq: r(rng, 800, 2500), Q: r(rng, 0.5, 1), attack: r(rng, 0.01, 0.04), decay: r(rng, 0.03, 0.08), gain: r(rng, 0.04, 0.09) }),
    ],
    "micro-blip": (rng) => {
      const f = r(rng, 500, 1600);
      return [
        tone(rng, { freq: f, sweepTo: rng() < 0.5 ? semi(f, r(rng, 2, 5)) : undefined, attack: r(rng, 0.002, 0.008), decay: r(rng, 0.02, 0.05), gain: r(rng, 0.05, 0.11) }),
      ];
    },
  },
  transition: {
    swoosh: (rng) => {
      const up = rng() < 0.5;
      const base = r(rng, 300, 900);
      return [
        noise(rng, {
          filterType: pick(["lowpass", "bandpass"] as const, rng),
          filterFreq: up ? base : base * r(rng, 4, 7),
          Q: r(rng, 0.7, 2),
          filterPeak: up ? base * r(rng, 4, 7) : base,
          attack: r(rng, 0.02, 0.08),
          decay: r(rng, 0.12, 0.3),
          gain: r(rng, 0.1, 0.2),
        }),
      ];
    },
    glide: (rng) => {
      const f = r(rng, 250, 900);
      const s = pick([-19, -12, -7, 7, 12, 19] as const, rng);
      const layers = [
        tone(rng, { freq: f, sweepTo: semi(f, s), wave: pick(["sine", "triangle"] as const, rng), attack: r(rng, 0.01, 0.05), decay: r(rng, 0.14, 0.3), gain: r(rng, 0.12, 0.22) }),
      ];
      return rng() < 0.35 ? withShimmer(layers, rng) : layers;
    },
    stairs: (rng) => {
      const f = r(rng, 350, 800);
      const up = rng() < 0.5;
      const step = pick([3, 4, 5] as const, rng) * (up ? 1 : -1);
      const gap = r(rng, 0.04, 0.07);
      return [0, 1, 2].map((i) =>
        tone(rng, { freq: semi(f, step * i), attack: 0.003, decay: r(rng, 0.04, 0.08), gain: r(rng, 0.1, 0.16), delay: i * gap }),
      );
    },
  },
  success: {
    arpeggio: (rng) => {
      const root = r(rng, 300, 650);
      const wave = pick(["sine", "sine", "triangle"] as const, rng);
      const count = pick([2, 3, 3, 4] as const, rng);
      const base = [...pick(CONSONANT_SETS, rng)];
      // Always ascending (directed session rule: success never descends).
      const notes = count === 2 ? base.slice(0, 2) : count === 4 ? [...base, base[0] + 12] : base;
      const gap = r(rng, 0.04, 0.1);
      const accel = rng() < 0.4 ? r(rng, 0.75, 0.9) : 1; // accelerating runs, not always even
      let t = 0;
      const layers = notes.map((s, i) => {
        const d = t;
        t += gap * Math.pow(accel, i);
        return tone(rng, {
          freq: semi(root, s),
          wave,
          attack: r(rng, 0.002, 0.006),
          decay: i === notes.length - 1 ? r(rng, 0.15, 0.35) : r(rng, 0.06, 0.15),
          gain: r(rng, 0.12, 0.2),
          delay: d,
        });
      });
      return rng() < 0.25 ? withShimmer(layers, rng) : layers;
    },
    "single-ding": (rng) => {
      const f = r(rng, 300, 1000);
      const layers = [
        tone(rng, { freq: f, wave: pick(["sine", "triangle"] as const, rng), attack: r(rng, 0.002, 0.01), decay: r(rng, 0.12, 0.35), gain: r(rng, 0.14, 0.22) }),
        ...(rng() < 0.5
          ? [tone(rng, { freq: f * 2, attack: r(rng, 0.002, 0.01), decay: r(rng, 0.08, 0.2), gain: r(rng, 0.04, 0.09) })]
          : []),
      ];
      return rng() < 0.15 ? withShimmer(layers, rng) : layers;
    },
    "chord-stab": (rng) => {
      const root = r(rng, 300, 750);
      const setPick = pick(CONSONANT_SETS, rng);
      const layers = setPick.map((s, i) =>
        tone(rng, {
          freq: semi(root, s),
          attack: r(rng, 0.002, 0.008),
          decay: r(rng, 0.14, 0.3),
          gain: r(rng, 0.08, 0.14) * (i === 0 ? 1.3 : 1),
        }),
      );
      return rng() < 0.3 ? withShimmer(layers, rng) : layers;
    },
    resolve: (rng) => {
      const root = r(rng, 350, 850);
      // Ascending resolutions only (success never descends; the falling pairs read error).
      const [from, to] = pick([[11, 12], [7, 12], [9, 12]] as const, rng);
      const gap = r(rng, 0.07, 0.14);
      return [
        tone(rng, { freq: semi(root, from), attack: r(rng, 0.003, 0.008), decay: r(rng, 0.06, 0.12), gain: r(rng, 0.11, 0.17) }),
        tone(rng, { freq: semi(root, to), attack: r(rng, 0.003, 0.008), decay: r(rng, 0.16, 0.32), gain: r(rng, 0.13, 0.2), delay: gap }),
      ];
    },
    "tick-then-ding": (rng) => {
      const f = r(rng, 450, 1100);
      return [
        noise(rng, { filterType: "bandpass", filterFreq: r(rng, 1500, 4000), Q: r(rng, 1.5, 3), attack: 0.001, decay: r(rng, 0.008, 0.02), gain: r(rng, 0.05, 0.1) }),
        tone(rng, { freq: f, wave: pick(["sine", "triangle"] as const, rng), attack: 0.003, decay: r(rng, 0.12, 0.28), gain: r(rng, 0.13, 0.2), delay: r(rng, 0.02, 0.05) }),
      ];
    },
    "thud-ping": (rng) => {
      const low = r(rng, 150, 300);
      return [
        tone(rng, { freq: low, attack: r(rng, 0.002, 0.006), decay: r(rng, 0.07, 0.14), gain: r(rng, 0.16, 0.26) }),
        tone(rng, { freq: r(rng, 700, 1600), attack: r(rng, 0.002, 0.006), decay: r(rng, 0.1, 0.22), gain: r(rng, 0.06, 0.11), delay: r(rng, 0.03, 0.08) }),
      ];
    },
    strum: (rng) => {
      const root = r(rng, 300, 800);
      const setPick = pick(CONSONANT_SETS, rng);
      const gap = r(rng, 0.008, 0.025); // rolled, reads as one hit
      const layers = setPick.map((s, i) =>
        tone(rng, {
          freq: semi(root, s),
          attack: r(rng, 0.002, 0.005),
          decay: r(rng, 0.12, 0.28),
          gain: r(rng, 0.09, 0.15),
          delay: i * gap,
        }),
      );
      return rng() < 0.3 ? withShimmer(layers, rng) : layers;
    },
    "fall-settle": (rng) => {
      const f = r(rng, 600, 1400);
      const landing = semi(f, -pick([5, 7, 12] as const, rng));
      return [
        tone(rng, { freq: f, sweepTo: landing, wave: pick(["sine", "triangle"] as const, rng), attack: r(rng, 0.003, 0.01), decay: r(rng, 0.05, 0.1), gain: r(rng, 0.1, 0.16) }),
        tone(rng, { freq: landing, attack: 0.004, decay: r(rng, 0.15, 0.3), gain: r(rng, 0.12, 0.18), delay: r(rng, 0.05, 0.09) }),
      ];
    },
    mirror: (rng) => {
      // Every distribution below is measured from the kept-success corpus
      // (data/pool/success.json, 159 patches): onsets 3@67%/4@17%/2@11%, gaps
      // 0.04-0.11, ascending intervals weighted {5:83,4:66,7:65,12:54,3:39,2:34},
      // notes 380-1150 Hz after the register correction, sine 89%/triangle 11%, attack ~4 ms, decay med 0.144 with
      // the last note ringing ~2x, shimmer on ~55% (applied by the invent spec).
      const wPick = <T,>(pairs: readonly (readonly [T, number])[]): T => {
        let roll = rng() * pairs.reduce((s, [, w]) => s + w, 0);
        for (const [v, w] of pairs) if ((roll -= w) <= 0) return v;
        return pairs[pairs.length - 1][0];
      };
      // Stratified: each draw commits to one corner of the corpus (register band,
      // pace, contour) so draws stop clustering around the medians and sounding alike.
      const count = wPick([[2, 30], [3, 35], [4, 25], [5, 10]] as const);
      const register = wPick([[[300, 380], 1], [[380, 480], 1], [[480, 600], 1]] as const);
      const gap = wPick([[r(rng, 0.04, 0.065), 1], [r(rng, 0.08, 0.11), 1]] as const);
      // Rhythm: even pulse, accelerating run, or short-short-LONG phrasing.
      const rhythm = wPick([["even", 40], ["accel", 30], ["ssl", 30]] as const);
      const gapAt = (i: number): number =>
        rhythm === "accel" ? gap * Math.pow(0.8, i) : rhythm === "ssl" && i === count - 2 ? gap * 1.7 : rhythm === "ssl" ? gap * 0.6 : gap;
      const contour = wPick([["steady", 40], ["leap", 30], ["octave-cap", 30]] as const);
      const step = (): number =>
        contour === "steady" ? wPick([[4, 66], [5, 83], [3, 39], [2, 34]] as const) : wPick([[5, 83], [7, 65], [4, 66]] as const);
      const wave = rng() < 0.89 ? ("sine" as const) : ("triangle" as const);
      let f = r(rng, register[0], register[1]);
      const layers: Layer[] = [];
      let t = 0;
      for (let i = 0; i < count; i++) {
        const last = i === count - 1;
        layers.push(
          tone(rng, {
            freq: Math.min(f, 1150),
            wave,
            attack: r(rng, 0.002, 0.006),
            decay: last ? r(rng, 0.2, 0.34) : r(rng, 0.09, 0.19),
            gain: r(rng, 0.11, 0.16),
            delay: t,
            ramp: rng() < 0.5,
          }),
        );
        if (last && rng() < 0.3) {
          layers.push(tone(rng, { freq: Math.min(semi(f, -wPick([[5, 1], [7, 1], [12, 1]] as const)), 1150), wave, attack: r(rng, 0.002, 0.006), decay: r(rng, 0.16, 0.28), gain: r(rng, 0.06, 0.1), delay: t, ramp: rng() < 0.5 }));
        }
        if (last && rng() < 0.25) {
          layers.push(tone(rng, { freq: Math.min(semi(f, 7), 1150), wave: "sine", attack: 0.004, decay: r(rng, 0.14, 0.24), gain: r(rng, 0.03, 0.05), delay: t, ramp: false }));
        }
        if (!last && rng() < 0.2) {
          layers.push(tone(rng, { freq: Math.min(semi(f, wPick([[4, 1], [7, 1]] as const)), 1150), wave, attack: r(rng, 0.002, 0.006), decay: r(rng, 0.08, 0.16), gain: r(rng, 0.06, 0.09), delay: t, ramp: rng() < 0.5 }));
        }
        const jump = contour === "leap" && i === count - 2 ? 12 : contour === "octave-cap" && last ? 0 : step();
        f = semi(f, contour === "octave-cap" && i === count - 2 ? 12 : jump);
        t += gapAt(i);
      }
      return layers;
    },
    relay: (rng) => {
      // Multi-voice sequence: each stage a DIFFERENT timbre, overlapping into one flow
      // (directed session: a success is not one bell repeating a pattern). Confirmed by
      // ear; variability lives inside the builder rather than as sibling archetypes.
      const f = r(rng, 260, 400);
      const gap = r(rng, 0.06, 0.11);
      const stages = pick([2, 3, 3] as const, rng);
      const steps = [0];
      for (let i = 1; i <= stages; i++) steps.push(steps[i - 1] + pick([3, 4, 5, 7] as const, rng));
      const layers: Layer[] = [
        tone(rng, { freq: f, attack: 0.004, decay: r(rng, 0.07, 0.11), gain: r(rng, 0.1, 0.14), ramp: false }),
      ];
      if (rng() < 0.4) {
        layers.push(tone(rng, { freq: f / 2, attack: 0.006, decay: r(rng, 0.14, 0.22), gain: r(rng, 0.04, 0.07), ramp: false }));
      }
      for (let i = 1; i <= stages; i++) {
        const last = i === stages;
        const wave = pick(last ? (["sine"] as const) : (["triangle", "sine"] as const), rng);
        layers.push(
          tone(rng, {
            freq: semi(f, steps[i]),
            wave,
            attack: last ? 0.005 : 0.004,
            decay: last ? r(rng, 0.22, 0.34) : r(rng, 0.1, 0.18),
            gain: last ? r(rng, 0.12, 0.16) : r(rng, 0.09, 0.13),
            delay: gap * i,
            ramp: false,
          }),
        );
        if (!last && rng() < 0.6) {
          layers.push(tone(rng, { freq: semi(f, steps[i]), detune: Math.round(r(rng, 5, 11)), attack: 0.006, decay: r(rng, 0.1, 0.16), gain: r(rng, 0.04, 0.06), delay: gap * i, ramp: false }));
        }
      }
      layers.push(tone(rng, { freq: Math.min(semi(f, steps[stages] + 7), 1150), attack: 0.008, decay: r(rng, 0.16, 0.26), gain: r(rng, 0.03, 0.05), delay: gap * stages, ramp: false }));
      return rng() < 0.8 ? withShimmer(layers, rng) : layers;
    },
    coin: (rng) => {
      const f = r(rng, 600, 820);
      const up = pick([5, 7] as const, rng);
      const gap = r(rng, 0.05, 0.08);
      const layers = [
        tone(rng, { freq: f, attack: 0.005, decay: r(rng, 0.04, 0.07), gain: r(rng, 0.06, 0.09), ramp: false }),
        tone(rng, { freq: semi(f, up), attack: 0.004, decay: r(rng, 0.22, 0.35), gain: r(rng, 0.12, 0.17), delay: gap, ramp: false }),
        tone(rng, { freq: semi(f, up - 12), attack: 0.006, decay: r(rng, 0.18, 0.3), gain: r(rng, 0.05, 0.08), delay: gap, ramp: false }),
        tone(rng, { freq: semi(f, up + 12), attack: 0.003, decay: r(rng, 0.15, 0.28), gain: r(rng, 0.03, 0.05), delay: gap, ramp: false }),
      ];
      return rng() < 0.85 ? withShimmer(layers, rng) : layers;
    },
    "sparkle-rise": (rng) => {
      const f = r(rng, 360, 500);
      const degrees = pick([[0, 4, 9], [0, 4, 7, 9], [0, 7, 9]] as const, rng);
      const gap = r(rng, 0.045, 0.07);
      const accel = r(rng, 0.8, 0.92);
      let t = 0;
      const layers = degrees.map((d, i) => {
        const last = i === degrees.length - 1;
        const delay = t;
        t += gap * Math.pow(accel, i);
        return tone(rng, {
          freq: semi(f, d),
          attack: 0.003,
          decay: last ? r(rng, 0.22, 0.38) : r(rng, 0.05, 0.09),
          gain: r(rng, 0.09, 0.13) * (last ? 1.25 : 1),
          delay,
          ramp: false,
        });
      });
      layers.push(tone(rng, { freq: Math.min(semi(f, degrees[degrees.length - 1] + 7), 1150), attack: 0.005, decay: r(rng, 0.18, 0.3), gain: r(rng, 0.03, 0.05), delay: t, ramp: false }));
      return rng() < 0.7 ? withShimmer(layers, rng) : layers;
    },
    lift: (rng) => {
      const f = r(rng, 260, 480);
      const rise = r(rng, 0.1, 0.18);
      const layers = [
        noise(rng, { filterType: "lowpass", filterFreq: r(rng, 900, 1800), attack: rise, decay: r(rng, 0.06, 0.12), gain: r(rng, 0.04, 0.07) }),
        tone(rng, { freq: f, attack: r(rng, 0.01, 0.03), decay: r(rng, 0.2, 0.35), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: semi(f, pick([4, 7] as const, rng)), attack: 0.004, decay: r(rng, 0.18, 0.3), gain: r(rng, 0.1, 0.15), delay: rise }),
        tone(rng, { freq: semi(f, 12), attack: 0.004, decay: r(rng, 0.14, 0.24), gain: r(rng, 0.05, 0.08), delay: rise + r(rng, 0.04, 0.08) }),
      ];
      return rng() < 0.5 ? withShimmer(layers, rng) : layers;
    },
    "cha-ching": (rng) => {
      const f = r(rng, 700, 1050);
      const gap = r(rng, 0.06, 0.11);
      const up = pick([5, 7] as const, rng);
      const layers = [
        noise(rng, { filterType: "bandpass", filterFreq: r(rng, 2000, 3500), Q: r(rng, 1, 2), attack: 0.002, decay: r(rng, 0.015, 0.035), gain: r(rng, 0.03, 0.06) }),
        tone(rng, { freq: f, attack: 0.003, decay: r(rng, 0.05, 0.09), gain: r(rng, 0.09, 0.14), ramp: false }),
        tone(rng, { freq: semi(f, up), attack: 0.003, decay: r(rng, 0.18, 0.32), gain: r(rng, 0.11, 0.16), delay: gap, ramp: false }),
        tone(rng, { freq: semi(f, up), detune: Math.round(r(rng, 5, 10)), attack: 0.003, decay: r(rng, 0.15, 0.28), gain: r(rng, 0.04, 0.08), delay: gap, ramp: false }),
      ];
      return rng() < 0.5 ? withShimmer(layers, rng) : layers;
    },
    bloom: (rng) => {
      const f = r(rng, 200, 700);
      const layers = [
        tone(rng, { freq: f, attack: r(rng, 0.03, 0.09), decay: r(rng, 0.2, 0.4), gain: r(rng, 0.1, 0.16) }),
        tone(rng, { freq: f, detune: Math.round(r(rng, 5, 14)), attack: r(rng, 0.03, 0.09), decay: r(rng, 0.24, 0.42), gain: r(rng, 0.08, 0.14) }),
        ...(rng() < 0.4
          ? [tone(rng, { freq: f * pick([1.5, 2] as const, rng), attack: r(rng, 0.05, 0.1), decay: r(rng, 0.2, 0.35), gain: r(rng, 0.04, 0.08) })]
          : []),
      ];
      return rng() < 0.5 ? withShimmer(layers, rng) : layers;
    },
  },
  error: {
    "double-low": (rng) => {
      const f = r(rng, 150, 450);
      const wave = pick(["triangle", "triangle", "sine"] as const, rng);
      const drop = pick([-1, -2, -5, -6] as const, rng);
      const gap = r(rng, 0.07, 0.16);
      const layers = [
        tone(rng, { freq: f, wave, attack: 0.004, decay: r(rng, 0.06, 0.14), gain: r(rng, 0.14, 0.22) }),
        tone(rng, { freq: semi(f, drop), wave, attack: 0.004, decay: r(rng, 0.12, 0.22), gain: r(rng, 0.14, 0.22), delay: gap }),
      ];
      if (rng() < 0.2) {
        layers.push(tone(rng, { freq: semi(f, drop * 2), wave, attack: 0.004, decay: r(rng, 0.14, 0.24), gain: r(rng, 0.12, 0.18), delay: gap * 2 }));
      }
      return layers;
    },
    "single-thud": (rng) => {
      const f = r(rng, 110, 280);
      return [
        tone(rng, { freq: f, wave: pick(["sine", "triangle"] as const, rng), attack: r(rng, 0.002, 0.008), decay: r(rng, 0.08, 0.2), gain: r(rng, 0.16, 0.26) }),
        ...(rng() < 0.4
          ? [noise(rng, { filterType: "lowpass", filterFreq: r(rng, 300, 800), attack: 0.001, decay: r(rng, 0.02, 0.06), gain: r(rng, 0.04, 0.08) })]
          : []),
      ];
    },
    "dissonant-pair": (rng) => {
      const f = r(rng, 200, 500);
      const clash = pick([1, 2, 6] as const, rng); // minor 2nd / major 2nd / tritone
      return [
        tone(rng, { freq: f, wave: "triangle", attack: 0.004, decay: r(rng, 0.1, 0.22), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: semi(f, clash), wave: "triangle", attack: 0.004, decay: r(rng, 0.1, 0.22), gain: r(rng, 0.1, 0.16) }),
      ];
    },
    fall: (rng) => {
      const f = r(rng, 300, 700);
      return [
        tone(rng, { freq: f, sweepTo: semi(f, -pick([5, 7, 10, 12] as const, rng)), wave: pick(["sine", "triangle"] as const, rng), attack: r(rng, 0.004, 0.012), decay: r(rng, 0.12, 0.28), gain: r(rng, 0.12, 0.2) }),
      ];
    },
    "head-shake": (rng) => {
      const f = r(rng, 200, 450);
      const gap = r(rng, 0.05, 0.09);
      return [
        tone(rng, { freq: f, wave: "sine", attack: 0.003, decay: r(rng, 0.04, 0.08), gain: r(rng, 0.14, 0.2) }),
        tone(rng, { freq: semi(f, -pick([1, 2] as const, rng)), wave: "sine", attack: 0.003, decay: r(rng, 0.05, 0.1), gain: r(rng, 0.14, 0.2), delay: gap }),
      ];
    },
    "triple-deny": (rng) => {
      const f = r(rng, 180, 400);
      const gap = r(rng, 0.05, 0.08);
      return [0, 1, 2].map((i) =>
        tone(rng, { freq: f, wave: pick(["sine", "triangle"] as const, rng), attack: 0.002, decay: r(rng, 0.02, 0.05), gain: r(rng, 0.12, 0.18), delay: i * gap }),
      );
    },
    "dull-knock": (rng) => {
      const f = r(rng, 130, 300);
      return [
        noise(rng, { filterType: "lowpass", filterFreq: r(rng, 400, 1100), Q: r(rng, 0.7, 1.5), attack: 0.001, decay: r(rng, 0.015, 0.04), gain: r(rng, 0.07, 0.13) }),
        tone(rng, { freq: f, attack: 0.002, decay: r(rng, 0.06, 0.13), gain: r(rng, 0.14, 0.24), delay: r(rng, 0.002, 0.01) }),
      ];
    },
    "descend-steps": (rng) => {
      const f = r(rng, 350, 700);
      const step = -pick([2, 3, 4] as const, rng);
      const gap = r(rng, 0.06, 0.1);
      const count = pick([2, 3] as const, rng);
      return Array.from({ length: count }, (_, i) =>
        tone(rng, { freq: semi(f, step * i), wave: pick(["sine", "triangle"] as const, rng), attack: 0.003, decay: i === count - 1 ? r(rng, 0.12, 0.24) : r(rng, 0.05, 0.1), gain: r(rng, 0.12, 0.18), delay: i * gap }),
      );
    },
  },
  warning: {
    "double-ping": (rng) => {
      const f = r(rng, 400, 1000);
      const gap = r(rng, 0.08, 0.18);
      const wave = pick(["triangle", "triangle", "square", "sine"] as const, rng);
      return [0, 1].map((i) =>
        tone(rng, { freq: f, wave, attack: 0.003, decay: r(rng, 0.05, 0.13), gain: r(rng, 0.1, 0.16), delay: i * gap }),
      );
    },
    "minor-alarm": (rng) => {
      const f = r(rng, 400, 850);
      const gap = r(rng, 0.08, 0.15);
      const wave = pick(["sine", "triangle"] as const, rng);
      return [
        tone(rng, { freq: semi(f, pick([3, 4] as const, rng)), wave, attack: 0.004, decay: r(rng, 0.06, 0.12), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: f, wave, attack: 0.004, decay: r(rng, 0.1, 0.18), gain: r(rng, 0.12, 0.18), delay: gap }),
      ];
    },
    "single-caution": (rng) => {
      const f = r(rng, 350, 750);
      return [
        tone(rng, { freq: f, wave: pick(["triangle", "sine"] as const, rng), attack: r(rng, 0.003, 0.01), decay: r(rng, 0.12, 0.28), gain: r(rng, 0.13, 0.2) }),
        ...(rng() < 0.35
          ? [tone(rng, { freq: semi(f, 6), attack: r(rng, 0.003, 0.01), decay: r(rng, 0.08, 0.16), gain: r(rng, 0.04, 0.08) })]
          : []),
      ];
    },
    "rising-ask": (rng) => {
      const f = r(rng, 350, 700);
      const gap = r(rng, 0.07, 0.13);
      return [
        tone(rng, { freq: f, wave: pick(["sine", "triangle"] as const, rng), attack: 0.004, decay: r(rng, 0.06, 0.11), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: semi(f, pick([2, 3, 5] as const, rng)), wave: pick(["sine", "triangle"] as const, rng), attack: 0.004, decay: r(rng, 0.12, 0.22), gain: r(rng, 0.12, 0.18), delay: gap }),
      ];
    },
    "tick-tock": (rng) => {
      const f = r(rng, 500, 950);
      const gap = r(rng, 0.09, 0.15);
      const drop = pick([-3, -5] as const, rng);
      return [
        tone(rng, { freq: f, wave: "triangle", attack: 0.002, decay: r(rng, 0.03, 0.06), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: semi(f, drop), wave: "triangle", attack: 0.002, decay: r(rng, 0.03, 0.06), gain: r(rng, 0.12, 0.18), delay: gap }),
        tone(rng, { freq: f, wave: "triangle", attack: 0.002, decay: r(rng, 0.04, 0.08), gain: r(rng, 0.1, 0.16), delay: gap * 2 }),
      ];
    },
  },
  notification: {
    "two-note": (rng) => {
      const f = r(rng, 600, 1100);
      const layers = [
        tone(rng, { freq: f, attack: r(rng, 0.003, 0.008), decay: r(rng, 0.1, 0.18), gain: r(rng, 0.12, 0.18) }),
        tone(rng, { freq: semi(f, pick([5, 7, 12] as const, rng)), attack: r(rng, 0.003, 0.008), decay: r(rng, 0.15, 0.28), gain: r(rng, 0.11, 0.17), delay: r(rng, 0.06, 0.1) }),
      ];
      return rng() < 0.6 ? withShimmer(layers, rng) : layers;
    },
    bell: (rng) => {
      const f = r(rng, 500, 900);
      return withShimmer(
        [
          tone(rng, { freq: f, attack: 0.004, decay: r(rng, 0.2, 0.4), gain: r(rng, 0.12, 0.18) }),
          tone(rng, { freq: f * 2, attack: 0.004, decay: r(rng, 0.15, 0.3), gain: r(rng, 0.06, 0.1) }),
          tone(rng, { freq: f * 3, attack: 0.004, decay: r(rng, 0.1, 0.2), gain: r(rng, 0.03, 0.06) }),
        ],
        rng,
      );
    },
  },
  all: {}, // filled below
};
// The merged set: every category's archetypes under one key, so an archetype can be
// composed by name regardless of its home grammar. Named `all` rather than sharing a key
// with a category, which is what it used to do.
ARCHETYPES.all = Object.fromEntries(
  Object.entries(ARCHETYPES)
    .filter(([scope]) => scope !== "all")
    .flatMap(([, archs]) => Object.entries(archs)),
);

// No exploration floor, same mute rule as create.ts opWeight: 5+ deletes with zero
// keeps mutes the archetype; revival = an invent-feedback.json edit. The threshold is
// 5 because anomaly-weighted taste blame captures the WHY, so a straight-delete run is
// a clean mold signal, and with ~70 keys per category a threshold of 10 effectively
// never fired.
// Shared with invent.ts, whose gesture keys ("g:*") and "hybrid" live in the same stats.
export function archWeight(stats: InventStats, cat: ArchetypeScope, arch: string): number {
  // "all" has no dice of its own: the merged scope always falls through to the prior.
  const s = cat === "all" ? undefined : stats[cat]?.[arch];
  if (!s) return 0.5;
  if (s.k === 0 && s.d >= 5) return 0;
  return (s.k + 1) / (s.k + s.d + 2);
}

export function archetypeNames(cat: ArchetypeScope): string[] {
  return Object.keys(ARCHETYPES[cat]);
}

// Cross-category composition: ARCHETYPES.all is the merged set, so any archetype can be
// composed by name regardless of its home grammar.
export function composeNamed(name: string, rng: () => number = Math.random): ComposeResult | null {
  const build = ARCHETYPES.all[name];
  if (!build) return null;
  const layers = build(rng);
  enforceLimits(layers);
  return { patch: layers.length === 1 ? layers[0] : { layers }, archetype: name };
}

export function compose(cat: ArchetypeScope, stats: InventStats, rng: () => number = Math.random, force?: string): ComposeResult {
  if (force && ARCHETYPES[cat][force]) {
    const layers = ARCHETYPES[cat][force](rng);
    enforceLimits(layers);
    return { patch: layers.length === 1 ? layers[0] : { layers }, archetype: force };
  }
  let archs = Object.keys(ARCHETYPES[cat]).filter((a) => archWeight(stats, cat, a) > 0);
  if (archs.length === 0) archs = Object.keys(ARCHETYPES[cat]);
  const total = archs.reduce((s, a) => s + archWeight(stats, cat, a), 0);
  let roll = rng() * total;
  let chosen = archs[archs.length - 1];
  for (const a of archs) {
    roll -= archWeight(stats, cat, a);
    if (roll <= 0) {
      chosen = a;
      break;
    }
  }
  const layers = ARCHETYPES[cat][chosen](rng);
  enforceLimits(layers);
  return { patch: layers.length === 1 ? layers[0] : { layers }, archetype: chosen };
}

// HYBRID: structural skeleton (layer count, onsets, envelope timing, curve) from parent A;
// timbre (waveform, register, filter character) from parent B. Cross-pack breeding.
export function hybridize(a: Patch, b: Patch, rng: () => number = Math.random): ComposeResult {
  const A = layersOf(a);
  const B = layersOf(b);
  const bTonal = B.filter((l) => l.source.type !== "noise");
  const bRegister =
    bTonal.length > 0
      ? bTonal.reduce((s, l) => {
          const f = l.source.type === "noise" ? 0 : typeof l.source.frequency === "number" ? l.source.frequency : l.source.frequency.start;
          return s + f;
        }, 0) / bTonal.length
      : 600;
  const bWave = bTonal.length > 0 ? bTonal[0].source.type : "sine";
  const bFilter = B.map((l) => (Array.isArray(l.filter) ? l.filter[0] : l.filter)).find(Boolean);

  const freqOf = (l: Layer): number | null =>
    l.source.type === "noise" ? null : typeof l.source.frequency === "number" ? l.source.frequency : l.source.frequency.start;
  const anchorFreq = A.map(freqOf).find((f): f is number => f !== null) ?? 440;

  const layers: Layer[] = A.map((skel, i) => {
    const env = skel.envelope ? { ...skel.envelope } : { decay: 0.1, sustain: 0, release: 0 };
    if (skel.source.type === "noise") {
      return { ...structuredClone(skel), source: { type: "noise" as const, color: "white" as const }, envelope: env };
    }
    const skelFreq = freqOf(skel) ?? anchorFreq;
    const ratio = skelFreq / anchorFreq;
    const f = round3(Math.min(6000, Math.max(80, bRegister * ratio * r(rng, 0.9, 1.12))));
    const sweep = typeof skel.source.frequency === "object" ? skel.source.frequency : null;
    return {
      source: {
        type: bWave as "sine" | "triangle" | "square" | "sawtooth",
        frequency: sweep ? { start: f, end: round3(Math.min(6000, Math.max(60, f * (sweep.end / skelFreq)))) } : f,
      },
      envelope: env,
      gain: skel.gain,
      ...(skel.delay ? { delay: skel.delay } : {}),
      ...(bFilter ? { filter: { ...bFilter } } : {}),
      ...(i === 0 && skel.effects ? { effects: structuredClone(skel.effects) } : {}),
    };
  });
  enforceLimits(layers);
  return { patch: layers.length === 1 ? layers[0] : { layers }, archetype: "hybrid" };
}
