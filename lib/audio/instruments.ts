import type { Filter, Layer } from "./patch";

// THE INSTRUMENT BANK: the timbre half of the instrument-first inventor (craft.ts).
//
// Why this exists. The older path (compose.ts grammars + wild.ts gestures, cast by
// invent.ts) composes at the PARAMETER level: pick a shape, randomize numbers inside
// psychoacoustic bounds, then clamp whatever escapes. Nothing in that pipeline holds a
// draw together as a plausible physical object, which is why its output reads as
// mashed-up rather than designed, and why the clamps then flatten what survives.
//
// Here a draw is Voice x Figure x Space instead. An instrument renders ONE note of one
// coherent object; a figure decides the pitches and timing; a space decides the
// ambience. Every combination is therefore "a real object playing a real gesture in a
// real room" by construction, so nothing needs rescuing afterwards.
//
// The decisive detail, learned by ear: a struck object uses `curve: "ramp"` with zero
// sustain (the energy leaves and does not come back), while a ringing or bowed object
// uses the natural exponential envelope with a small sustain and release. Getting that
// one distinction wrong is what made earlier output sound synthetic.

export type Family =
  | "wood"
  | "tine"
  | "metal"
  | "string"
  | "body"
  | "transient"
  | "air"
  | "digital"
  | "sustained";

// How the object gives up its energy. Drives envelope curve, sustain and ring length.
export type Decay = "tight" | "medium" | "ring";

export interface VoiceContext {
  freq: number;
  energy: number; // 0..1, scales this note's gain within the instrument's own range
  hold: number; // 1 = normal, >1 for a figure's final note
  rng: () => number;
}

export interface Instrument {
  name: string;
  family: Family;
  register: readonly [number, number]; // pitches this object is plausible at
  decay: Decay;
  // True when the voice is a noise burst with no pitch of its own, so a figure must
  // pair it with something tonal rather than let it carry a melody.
  unpitched?: boolean;
  // Highest multiple of the fundamental this object actually sounds. The caster divides
  // the category ceiling by it when placing the root, so a bell's third partial lands
  // under the ceiling instead of being discovered above it afterwards.
  topRatio?: number;
  render: (c: VoiceContext) => Layer[];
}

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const semi = (f: number, s: number) => f * Math.pow(2, s / 12);

// Struck: ramps to silence, nothing held. Ringing: natural exponential with a tail.
const struck = (attack: number, decay: number) => ({
  attack: round3(attack),
  decay: round3(decay),
  sustain: 0,
  release: round3(decay * 0.2),
  curve: "ramp" as const,
});
const ringing = (attack: number, decay: number, sustain = 0.03) => ({
  attack: round3(attack),
  decay: round3(decay),
  sustain,
  release: round3(decay * 0.35),
});

const lp = (frequency: number, Q?: number): Filter => ({
  type: "lowpass",
  frequency: Math.round(frequency),
  ...(Q ? { Q: round3(Q) } : {}),
});
const bp = (frequency: number, Q: number): Filter => ({
  type: "bandpass",
  frequency: Math.round(frequency),
  Q: round3(Q),
});

type Wave = "sine" | "triangle" | "square" | "sawtooth";

const osc = (
  freq: number,
  wave: Wave,
  envelope: Layer["envelope"],
  gain: number,
  extra: { fm?: { ratio: number; depth: number }; detune?: number; filter?: Filter; sweepTo?: number } = {},
): Layer => ({
  source: {
    type: wave,
    frequency: extra.sweepTo ? { start: round3(freq), end: round3(extra.sweepTo) } : round3(freq),
    ...(extra.fm ? { fm: { ratio: round3(extra.fm.ratio), depth: Math.round(extra.fm.depth) } } : {}),
    ...(extra.detune ? { detune: Math.round(extra.detune) } : {}),
  },
  envelope,
  gain: round3(gain),
  ...(extra.filter ? { filter: extra.filter } : {}),
});

const noise = (
  color: "white" | "pink" | "brown",
  envelope: Layer["envelope"],
  gain: number,
  filter?: Filter,
): Layer => ({
  source: { type: "noise", color },
  envelope,
  gain: round3(gain),
  ...(filter ? { filter } : {}),
});

// Gain is stated per instrument at a nominal energy of 1 and scaled by the figure.
const g = (c: VoiceContext, lo: number, hi: number) => r(c.rng, lo, hi) * (0.55 + 0.45 * c.energy);

export const INSTRUMENTS: Instrument[] = [
  // ---------------------------------------------------------------- wood
  {
    name: "wood-bar",
    family: "wood",
    register: [200, 700],
    decay: "tight",
    render: (c) => [osc(c.freq, "triangle", struck(0.001, r(c.rng, 0.09, 0.14) * c.hold), g(c, 0.16, 0.21), { filter: lp(c.freq * 3.4) })],
  },
  {
    name: "wood-block",
    family: "wood",
    register: [300, 900],
    decay: "tight",
    render: (c) => [
      noise("white", struck(0.001, 0.008), g(c, 0.04, 0.06), bp(c.freq * 4, 1.2)),
      osc(c.freq, "triangle", struck(0.001, r(c.rng, 0.05, 0.08) * c.hold), g(c, 0.15, 0.2), { filter: lp(c.freq * 2.6) }),
    ],
  },
  {
    name: "marimba",
    family: "wood",
    register: [180, 620],
    decay: "tight",
    topRatio: 4,
    render: (c) => [
      osc(c.freq, "triangle", struck(0.001, r(c.rng, 0.12, 0.18) * c.hold), g(c, 0.15, 0.2), { filter: lp(c.freq * 3) }),
      osc(c.freq * 4, "sine", struck(0.001, r(c.rng, 0.05, 0.09)), g(c, 0.03, 0.05)),
    ],
  },
  {
    name: "temple-block",
    family: "wood",
    register: [250, 800],
    decay: "tight",
    render: (c) => [osc(c.freq, "triangle", struck(0.001, r(c.rng, 0.07, 0.11) * c.hold), g(c, 0.16, 0.21), { filter: bp(c.freq * 1.6, 3.5) })],
  },
  {
    name: "claves",
    family: "wood",
    register: [400, 1000],
    decay: "tight",
    render: (c) => [
      noise("white", struck(0.001, 0.007), g(c, 0.05, 0.08), bp(c.freq * 3, 1.6)),
      osc(c.freq, "triangle", struck(0.001, r(c.rng, 0.035, 0.06) * c.hold), g(c, 0.14, 0.18), { filter: lp(c.freq * 3) }),
    ],
  },
  {
    name: "log-drum",
    family: "wood",
    register: [140, 420],
    decay: "medium",
    render: (c) => [
      osc(c.freq, "triangle", struck(0.002, r(c.rng, 0.16, 0.24) * c.hold), g(c, 0.17, 0.22), { filter: lp(c.freq * 2.4) }),
      osc(c.freq, "triangle", ringing(0.004, r(c.rng, 0.12, 0.18)), g(c, 0.04, 0.07), { detune: 11, filter: lp(c.freq * 2) }),
    ],
  },
  // ---------------------------------------------------------------- tines
  {
    name: "kalimba",
    family: "tine",
    register: [280, 800],
    decay: "medium",
    render: (c) => [osc(c.freq, "triangle", ringing(0.001, r(c.rng, 0.18, 0.26) * c.hold, 0.02), g(c, 0.15, 0.19), { fm: { ratio: 2, depth: r(c.rng, 22, 34) }, filter: bp(c.freq * 2, 1.4) })],
  },
  {
    name: "tine-soft",
    family: "tine",
    register: [260, 760],
    decay: "medium",
    render: (c) => [osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.2, 0.28) * c.hold, 0.02), g(c, 0.15, 0.19), { fm: { ratio: 2, depth: r(c.rng, 10, 18) }, filter: bp(c.freq * 2, 0.9) })],
  },
  {
    name: "music-box",
    family: "tine",
    register: [400, 1000],
    decay: "ring",
    render: (c) => [osc(c.freq, "sine", ringing(0.001, r(c.rng, 0.28, 0.38) * c.hold), g(c, 0.12, 0.15), { fm: { ratio: 3, depth: r(c.rng, 70, 100) } })],
  },
  {
    name: "celesta",
    family: "tine",
    register: [380, 950],
    decay: "medium",
    topRatio: 2,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.001, r(c.rng, 0.2, 0.28) * c.hold), g(c, 0.12, 0.16), { fm: { ratio: 4, depth: r(c.rng, 40, 65) } }),
      osc(c.freq * 2, "sine", ringing(0.002, r(c.rng, 0.12, 0.18)), g(c, 0.03, 0.05)),
    ],
  },
  {
    name: "tongue-drum",
    family: "tine",
    register: [220, 620],
    decay: "medium",
    render: (c) => [
      osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.22, 0.3) * c.hold), g(c, 0.15, 0.19), { fm: { ratio: 2, depth: r(c.rng, 14, 22) }, filter: bp(c.freq * 2, 1.1) }),
      osc(c.freq, "triangle", ringing(0.003, r(c.rng, 0.18, 0.24)), g(c, 0.06, 0.09), { detune: 12, filter: lp(c.freq * 4) }),
    ],
  },
  // ---------------------------------------------------------------- metal
  {
    name: "glock",
    family: "metal",
    register: [400, 1000],
    decay: "medium",
    topRatio: 3,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.001, r(c.rng, 0.18, 0.26) * c.hold), g(c, 0.13, 0.17)),
      osc(c.freq * 3, "sine", ringing(0.001, r(c.rng, 0.08, 0.13)), g(c, 0.03, 0.05)),
    ],
  },
  {
    name: "bell-small",
    family: "metal",
    register: [300, 850],
    decay: "ring",
    topRatio: 3,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.003, r(c.rng, 0.3, 0.42) * c.hold, 0.04), g(c, 0.13, 0.17)),
      osc(c.freq * 2, "sine", ringing(0.003, r(c.rng, 0.2, 0.3)), g(c, 0.05, 0.08)),
      osc(c.freq * 3, "sine", ringing(0.003, r(c.rng, 0.12, 0.2)), g(c, 0.025, 0.04)),
    ],
  },
  {
    name: "bell-tubular",
    family: "metal",
    register: [180, 520],
    decay: "ring",
    // Inharmonic partial ratios: a struck tube clangs rather than ringing pure.
    topRatio: 3.9,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.003, r(c.rng, 0.34, 0.46) * c.hold, 0.04), g(c, 0.13, 0.17)),
      osc(c.freq * 2.76, "sine", ringing(0.003, r(c.rng, 0.22, 0.32)), g(c, 0.05, 0.07)),
      osc(c.freq * 3.9, "sine", ringing(0.003, r(c.rng, 0.14, 0.22)), g(c, 0.025, 0.04)),
    ],
  },
  {
    name: "metal-ping",
    family: "metal",
    register: [320, 850],
    decay: "medium",
    render: (c) => [osc(c.freq, "triangle", ringing(0.001, r(c.rng, 0.22, 0.3) * c.hold), g(c, 0.15, 0.19), { filter: bp(c.freq, 8) })],
  },
  {
    name: "glass-fm",
    family: "metal",
    register: [300, 800],
    decay: "ring",
    render: (c) => [osc(c.freq, "sine", ringing(0.002, r(c.rng, 0.3, 0.44) * c.hold, 0.04), g(c, 0.11, 0.15), { fm: { ratio: 3.5, depth: r(c.rng, 200, 300) } })],
  },
  {
    name: "gong-soft",
    family: "metal",
    register: [130, 340],
    decay: "ring",
    topRatio: 2.4,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.006, r(c.rng, 0.36, 0.5) * c.hold, 0.05), g(c, 0.15, 0.19), { filter: lp(c.freq * 6) }),
      osc(c.freq * 2.4, "sine", ringing(0.008, r(c.rng, 0.24, 0.34)), g(c, 0.04, 0.07), { filter: lp(c.freq * 8) }),
    ],
  },
  {
    name: "anvil",
    family: "metal",
    register: [300, 700],
    decay: "medium",
    render: (c) => [
      noise("white", struck(0.001, 0.012), g(c, 0.05, 0.08), bp(c.freq * 5, 2)),
      osc(c.freq, "triangle", ringing(0.001, r(c.rng, 0.16, 0.24) * c.hold), g(c, 0.13, 0.17), { filter: bp(c.freq * 1.4, 4) }),
    ],
  },
  // ---------------------------------------------------------------- strings
  {
    name: "pluck-nylon",
    family: "string",
    register: [220, 620],
    decay: "medium",
    render: (c) => {
      const peak = Math.min(3200, c.freq * 5);
      return [
        osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.2, 0.28) * c.hold), g(c, 0.15, 0.19), {
          filter: { type: "lowpass", frequency: Math.round(peak), Q: 2, envelope: { attack: 0.004, peak: Math.round(peak), decay: round3(r(c.rng, 0.12, 0.18)) } },
        }),
      ];
    },
  },
  {
    name: "pluck-steel",
    family: "string",
    // Sawtooth stays inside the calibrated harsh band (limits.json 320-600 Hz).
    register: [330, 590],
    decay: "medium",
    render: (c) => {
      const peak = Math.min(3000, c.freq * 6);
      return [
        osc(c.freq, "sawtooth", ringing(0.002, r(c.rng, 0.22, 0.3) * c.hold), g(c, 0.13, 0.17), {
          filter: { type: "lowpass", frequency: Math.round(peak), Q: 3, envelope: { attack: 0.004, peak: Math.round(peak), decay: round3(r(c.rng, 0.14, 0.2)) } },
        }),
      ];
    },
  },
  {
    name: "harp",
    family: "string",
    register: [240, 780],
    decay: "medium",
    render: (c) => [osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.2, 0.3) * c.hold), g(c, 0.13, 0.17), { filter: lp(c.freq * 4.5) })],
  },
  {
    name: "koto",
    family: "string",
    register: [260, 700],
    decay: "medium",
    render: (c) => [
      osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.18, 0.26) * c.hold), g(c, 0.14, 0.18), { fm: { ratio: 1, depth: r(c.rng, 12, 22) }, filter: bp(c.freq * 2.4, 1.8) }),
    ],
  },
  // ---------------------------------------------------------------- body
  {
    name: "sub-thump",
    family: "body",
    register: [45, 150],
    decay: "medium",
    render: (c) => [osc(c.freq, "sine", ringing(0.004, r(c.rng, 0.22, 0.32) * c.hold), g(c, 0.2, 0.25), { filter: lp(Math.max(260, c.freq * 3.2)) })],
  },
  {
    name: "kick-body",
    family: "body",
    register: [50, 140],
    decay: "tight",
    topRatio: 2.2,
    render: (c) => [osc(c.freq * 2.2, "sine", struck(0.002, r(c.rng, 0.14, 0.2) * c.hold), g(c, 0.21, 0.26), { sweepTo: c.freq, filter: lp(320) })],
  },
  {
    name: "knock",
    family: "body",
    register: [90, 300],
    decay: "tight",
    render: (c) => [
      noise("brown", struck(0.001, 0.026), g(c, 0.05, 0.08), lp(700, 1.1)),
      osc(c.freq, "sine", struck(0.002, r(c.rng, 0.12, 0.18) * c.hold), g(c, 0.19, 0.24), { filter: lp(Math.max(420, c.freq * 3)) }),
    ],
  },
  {
    name: "tom",
    family: "body",
    register: [100, 320],
    decay: "medium",
    topRatio: 1.5,
    render: (c) => [osc(c.freq * 1.5, "sine", struck(0.002, r(c.rng, 0.18, 0.26) * c.hold), g(c, 0.18, 0.23), { sweepTo: c.freq, filter: lp(c.freq * 5) })],
  },
  // ---------------------------------------------------------------- transients
  {
    name: "click-latch",
    family: "transient",
    register: [1, 1],
    decay: "tight",
    unpitched: true,
    render: (c) => [noise("white", struck(0.001, r(c.rng, 0.016, 0.026)), g(c, 0.09, 0.13), bp(r(c.rng, 1900, 2600), 1.2))],
  },
  {
    name: "click-soft",
    family: "transient",
    register: [1, 1],
    decay: "tight",
    unpitched: true,
    render: (c) => [noise("pink", struck(0.001, r(c.rng, 0.014, 0.022)), g(c, 0.06, 0.09), bp(r(c.rng, 1300, 1900), 1))],
  },
  {
    name: "tick-dry",
    family: "transient",
    register: [1, 1],
    decay: "tight",
    unpitched: true,
    render: (c) => [noise("white", struck(0.001, r(c.rng, 0.006, 0.012)), g(c, 0.06, 0.1), bp(r(c.rng, 2800, 3600), 1.6))],
  },
  {
    name: "shaker",
    family: "transient",
    register: [1, 1],
    decay: "tight",
    unpitched: true,
    render: (c) => [noise("white", struck(0.004, r(c.rng, 0.03, 0.05)), g(c, 0.05, 0.08), bp(r(c.rng, 4000, 5500), 1.1))],
  },
  // ---------------------------------------------------------------- air
  {
    name: "air-puff",
    family: "air",
    register: [1, 1],
    decay: "medium",
    unpitched: true,
    render: (c) => [noise("pink", ringing(r(c.rng, 0.02, 0.05), r(c.rng, 0.1, 0.18) * c.hold), g(c, 0.07, 0.1), lp(r(c.rng, 900, 1700), 0.8))],
  },
  {
    name: "breath",
    family: "air",
    register: [1, 1],
    decay: "medium",
    unpitched: true,
    render: (c) => {
      const peak = Math.round(r(c.rng, 2200, 3200));
      return [
        {
          source: { type: "noise", color: "pink" },
          envelope: ringing(r(c.rng, 0.04, 0.07), r(c.rng, 0.16, 0.24) * c.hold),
          gain: round3(g(c, 0.07, 0.1)),
          filter: { type: "lowpass", frequency: 1200, Q: 0.8, envelope: { attack: round3(r(c.rng, 0.05, 0.09)), peak, decay: round3(r(c.rng, 0.14, 0.2)) } },
        },
      ];
    },
  },
  {
    name: "swish",
    family: "air",
    register: [1, 1],
    decay: "medium",
    unpitched: true,
    render: (c) => {
      const peak = Math.round(r(c.rng, 2600, 4200));
      return [
        {
          source: { type: "noise", color: "white" },
          envelope: ringing(r(c.rng, 0.015, 0.035), r(c.rng, 0.12, 0.2) * c.hold),
          gain: round3(g(c, 0.06, 0.09)),
          filter: { type: "bandpass", frequency: 700, Q: 1.4, envelope: { attack: round3(r(c.rng, 0.04, 0.08)), peak, decay: round3(r(c.rng, 0.1, 0.16)) } },
        },
      ];
    },
  },
  // ---------------------------------------------------------------- digital
  {
    name: "blip-sine",
    family: "digital",
    register: [300, 900],
    decay: "tight",
    render: (c) => [osc(c.freq, "sine", struck(0.002, r(c.rng, 0.05, 0.09) * c.hold), g(c, 0.15, 0.2))],
  },
  {
    name: "blip-square",
    family: "digital",
    register: [330, 590],
    decay: "tight",
    render: (c) => [osc(c.freq, "square", struck(0.001, r(c.rng, 0.045, 0.08) * c.hold), g(c, 0.09, 0.12))],
  },
  {
    name: "boop",
    family: "digital",
    register: [280, 800],
    decay: "tight",
    render: (c) => [osc(c.freq, "sine", struck(0.002, r(c.rng, 0.07, 0.12) * c.hold), g(c, 0.15, 0.19), { sweepTo: semi(c.freq, -r(c.rng, 2, 5)) })],
  },
  {
    name: "zap",
    family: "digital",
    register: [260, 700],
    decay: "tight",
    topRatio: 2,
    render: (c) => [osc(c.freq, "sine", struck(0.002, r(c.rng, 0.08, 0.13) * c.hold), g(c, 0.14, 0.18), { sweepTo: semi(c.freq, 12) })],
  },
  {
    // The dominant open idiom across the reference packs: one sine, a short glide up,
    // nothing else. Envelope stated by hand so the release stays proportionally longer
    // than `struck` gives (the reference recipes sit near release = decay / 3).
    name: "swoop-up",
    family: "digital",
    register: [360, 540],
    decay: "tight",
    topRatio: 2,
    render: (c) => {
      const decay = round3(r(c.rng, 0.07, 0.11) * c.hold);
      return [
        osc(c.freq, "sine", { attack: 0.002, decay, sustain: 0, release: round3(decay / 3) }, g(c, 0.3, 0.42), {
          sweepTo: semi(c.freq, r(c.rng, 8, 12)),
        }),
      ];
    },
  },
  {
    name: "drop",
    family: "digital",
    register: [280, 780],
    decay: "medium",
    // A pitch that falls fast and lands, the way a droplet does.
    topRatio: 2.25,
    render: (c) => [
      {
        source: { type: "sine", frequency: { start: round3(semi(c.freq, 14)), end: round3(c.freq), time: round3(r(c.rng, 0.05, 0.08)) }, fm: { ratio: 1.4, depth: Math.round(r(c.rng, 40, 80)) } },
        envelope: ringing(0.001, round3(r(c.rng, 0.18, 0.26) * c.hold)),
        gain: round3(g(c, 0.14, 0.18)),
      },
    ],
  },
  {
    name: "hollow-tube",
    family: "digital",
    register: [240, 700],
    decay: "medium",
    render: (c) => [osc(c.freq, "triangle", ringing(0.002, r(c.rng, 0.18, 0.26) * c.hold), g(c, 0.14, 0.18), { filter: bp(c.freq, 6) })],
  },
  // ---------------------------------------------------------------- sustained
  {
    name: "pad-swell",
    family: "sustained",
    register: [180, 520],
    decay: "ring",
    render: (c) => [
      osc(c.freq, "sine", ringing(r(c.rng, 0.07, 0.12), r(c.rng, 0.3, 0.42) * c.hold, 0.08), g(c, 0.13, 0.17)),
      osc(c.freq, "sine", ringing(r(c.rng, 0.08, 0.13), r(c.rng, 0.3, 0.42), 0.08), g(c, 0.07, 0.11), { detune: Math.round(r(c.rng, 7, 14)) }),
    ],
  },
  {
    name: "organ",
    family: "sustained",
    register: [200, 560],
    decay: "medium",
    topRatio: 3,
    render: (c) => [
      osc(c.freq, "sine", ringing(0.012, r(c.rng, 0.24, 0.34) * c.hold, 0.1), g(c, 0.13, 0.16)),
      osc(c.freq * 2, "sine", ringing(0.012, r(c.rng, 0.24, 0.34), 0.1), g(c, 0.06, 0.09)),
      osc(c.freq * 3, "sine", ringing(0.014, r(c.rng, 0.2, 0.3), 0.1), g(c, 0.03, 0.05)),
    ],
  },
  {
    name: "bowed",
    family: "sustained",
    register: [160, 480],
    decay: "ring",
    render: (c) => [osc(c.freq, "triangle", ringing(r(c.rng, 0.1, 0.16), r(c.rng, 0.3, 0.4) * c.hold, 0.1), g(c, 0.14, 0.18), { filter: lp(c.freq * 5) })],
  },
];

export const INSTRUMENT_BY_NAME: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.name, i]),
);

export const instrumentsOfFamily = (f: Family): Instrument[] => INSTRUMENTS.filter((i) => i.family === f);
