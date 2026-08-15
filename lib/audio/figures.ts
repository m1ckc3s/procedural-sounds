import type { DelayEffect, Effect, ReverbEffect } from "./patch";

// THE FIGURE BANK: the gesture half of the instrument-first inventor (craft.ts).
//
// A figure decides WHAT IS PLAYED - how many notes, at which intervals, how far apart,
// how hard - and says nothing about what plays it. Instruments (instruments.ts) supply
// the timbre. Keeping the two apart is the point: it is why one gesture can be a wooden
// bar, a thumb piano or a struck tube without any of the three sounding mashed together.
//
// ROLES exist because the hand-authored sounds that survived curation were rarely one
// object. A low body under two bright notes, or a noise click in front of a tone, reads
// as a designed sound; the same notes from a single voice reads as a scale. So a figure
// emits role-tagged events and the caster assigns a DIFFERENT instrument to each role.

export type Role = "lead" | "body" | "transient";

export interface NoteEvent {
  role: Role;
  semitone: number; // offset from the draw's root; ignored for unpitched roles
  delay: number; // seconds from the start of the sound
  energy: number; // 0..1, how hard this note is struck
  hold: number; // decay multiplier, >1 lets a landing note ring
}

export type Motion = "rise" | "fall" | "flat" | "mixed";

export interface Figure {
  name: string;
  motion: Motion;
  // Rough count of pitched events, used to keep batches structurally varied.
  weight: number;
  build: (rng: () => number, iv: readonly number[]) => NoteEvent[];
}

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)];
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Interval pools a category can hand to a figure. The figure walks whichever it is given,
// so the same shape reads as celebratory, neutral or wrong depending on the pool.
export const INTERVALS = {
  major: [4, 7, 12] as const,
  pentatonic: [2, 4, 7, 9, 12] as const,
  fourths: [5, 10, 12] as const,
  fifths: [7, 12] as const,
  minor: [3, 7, 10] as const,
  narrow: [1, 2, 3] as const,
  tritone: [1, 2, 6] as const,
};

const up = (rng: () => number, iv: readonly number[], n: number): number[] => {
  const out = [0];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + pick(iv, rng));
  return out;
};

const lead = (semitone: number, delay: number, energy: number, hold: number): NoteEvent => ({
  role: "lead",
  semitone,
  delay: round3(delay),
  energy: round3(energy),
  hold: round3(hold),
});

export const FIGURES: Figure[] = [
  {
    name: "single",
    motion: "flat",
    weight: 1,
    build: (rng) => [lead(0, 0, r(rng, 0.85, 1), r(rng, 1.2, 1.6))],
  },
  {
    name: "rise-two",
    motion: "rise",
    weight: 2,
    build: (rng, iv) => {
      const gap = r(rng, 0.06, 0.11);
      return [lead(0, 0, r(rng, 0.8, 0.95), 0.8), lead(pick(iv, rng), gap, 1, r(rng, 1.3, 1.7))];
    },
  },
  {
    name: "rise-three",
    motion: "rise",
    weight: 3,
    build: (rng, iv) => {
      const gap = r(rng, 0.06, 0.1);
      const s = up(rng, iv, 3);
      return s.map((n, i) => lead(n, i * gap, i === 2 ? 1 : r(rng, 0.8, 0.95), i === 2 ? r(rng, 1.3, 1.7) : 0.8));
    },
  },
  {
    name: "rise-four",
    motion: "rise",
    weight: 4,
    build: (rng, iv) => {
      const gap = r(rng, 0.05, 0.085);
      const s = up(rng, iv, 4);
      return s.map((n, i) => lead(n, i * gap, i === 3 ? 1 : r(rng, 0.75, 0.9), i === 3 ? r(rng, 1.3, 1.7) : 0.7));
    },
  },
  {
    name: "run-five",
    motion: "rise",
    weight: 5,
    build: (rng, iv) => {
      const gap = r(rng, 0.032, 0.05);
      const s = up(rng, iv.filter((x) => x <= 4).length ? iv.filter((x) => x <= 4) : iv, 5);
      return s.map((n, i) => lead(n, i * gap, i === 4 ? 1 : r(rng, 0.7, 0.85), i === 4 ? r(rng, 1.4, 1.8) : 0.6));
    },
  },
  {
    name: "pair-quick",
    motion: "rise",
    weight: 2,
    // A tap's only legal second beat: close enough to read as one elegant gesture
    // rather than two events, and never a third.
    build: (rng, iv) => {
      const gap = r(rng, 0.028, 0.045);
      const step = pick(iv.filter((x) => x <= 5).length ? iv.filter((x) => x <= 5) : iv, rng);
      return [lead(0, 0, 1, 0.7), lead(step, gap, r(rng, 0.8, 0.95), r(rng, 0.9, 1.2))];
    },
  },
  {
    name: "blur-three",
    motion: "rise",
    weight: 3,
    // Tight enough that the ear hears one gesture rather than counted notes.
    build: (rng, iv) => {
      const gap = r(rng, 0.016, 0.026);
      const s = up(rng, iv, 3);
      return s.map((n, i) => lead(n, i * gap, i === 2 ? 1 : 0.85, i === 2 ? r(rng, 1.3, 1.6) : 0.9));
    },
  },
  {
    name: "cluster",
    motion: "flat",
    weight: 3,
    build: (rng, iv) => {
      const s = up(rng, iv, 3);
      return s.map((n, i) => lead(n, 0, i === 0 ? 1 : r(rng, 0.6, 0.8), r(rng, 1.1, 1.4)));
    },
  },
  {
    name: "accel-rise",
    motion: "rise",
    weight: 4,
    build: (rng, iv) => {
      const s = up(rng, iv, 4);
      let t = 0;
      let gap = r(rng, 0.085, 0.12);
      return s.map((n, i) => {
        const e = lead(n, t, i === 3 ? 1 : r(rng, 0.75, 0.9), i === 3 ? r(rng, 1.4, 1.8) : 0.7);
        t += gap;
        gap *= r(rng, 0.68, 0.8);
        return e;
      });
    },
  },
  {
    name: "body-and-light",
    motion: "rise",
    weight: 3,
    build: (rng, iv) => {
      const gap = r(rng, 0.045, 0.075);
      const s = up(rng, iv, 2);
      return [
        { role: "body", semitone: 0, delay: 0, energy: 1, hold: round3(r(rng, 1, 1.3)) },
        lead(12 + s[0], gap, r(rng, 0.55, 0.72), 0.9),
        lead(12 + s[1], gap * 2, r(rng, 0.5, 0.68), r(rng, 1.3, 1.7)),
      ];
    },
  },
  {
    name: "body-alone",
    motion: "flat",
    weight: 1,
    build: (rng) => [{ role: "body", semitone: 0, delay: 0, energy: 1, hold: round3(r(rng, 1.2, 1.6)) }],
  },
  {
    name: "transient-lead",
    motion: "rise",
    weight: 2,
    build: (rng, iv) => {
      const gap = r(rng, 0.065, 0.1);
      return [
        { role: "transient", semitone: 0, delay: 0, energy: 1, hold: 1 },
        lead(0, round3(r(rng, 0.008, 0.016)), r(rng, 0.85, 1), 0.75),
        lead(pick(iv, rng), gap, 1, r(rng, 1.3, 1.7)),
      ];
    },
  },
  {
    name: "transient-single",
    motion: "flat",
    weight: 1,
    build: (rng) => [
      { role: "transient", semitone: 0, delay: 0, energy: 1, hold: 1 },
      lead(0, round3(r(rng, 0.008, 0.018)), 1, r(rng, 1.2, 1.6)),
    ],
  },
  {
    name: "call-answer",
    motion: "rise",
    weight: 2,
    build: (rng, iv) => [
      lead(0, 0, r(rng, 0.85, 1), 0.9),
      lead(pick(iv, rng), round3(r(rng, 0.17, 0.24)), 1, r(rng, 1.3, 1.7)),
    ],
  },
  {
    name: "fall-two",
    motion: "fall",
    weight: 2,
    build: (rng, iv) => {
      const gap = r(rng, 0.07, 0.12);
      return [lead(0, 0, 1, 0.8), lead(-pick(iv, rng), gap, r(rng, 0.9, 1), r(rng, 1.3, 1.7))];
    },
  },
  {
    name: "fall-three",
    motion: "fall",
    weight: 3,
    build: (rng, iv) => {
      const gap = r(rng, 0.06, 0.1);
      const s = up(rng, iv, 3).map((n) => -n);
      return s.map((n, i) => lead(n, i * gap, i === 2 ? r(rng, 0.9, 1) : 1, i === 2 ? r(rng, 1.3, 1.7) : 0.8));
    },
  },
  {
    name: "wobble",
    motion: "fall",
    weight: 2,
    // The head-shake: the same note twice, the second fractionally flat.
    build: (rng, iv) => {
      const gap = r(rng, 0.05, 0.085);
      const drop = -pick(iv.filter((x) => x <= 3).length ? iv.filter((x) => x <= 3) : [1, 2], rng);
      return [lead(0, 0, 1, 0.8), lead(drop, gap, 1, r(rng, 1.2, 1.5))];
    },
  },
  {
    name: "double-alert",
    motion: "flat",
    weight: 2,
    build: (rng) => {
      const gap = r(rng, 0.1, 0.16);
      return [lead(0, 0, 1, 0.85), lead(0, gap, 1, r(rng, 1.2, 1.5))];
    },
  },
  {
    name: "triple-alert",
    motion: "flat",
    weight: 3,
    build: (rng) => {
      const gap = r(rng, 0.085, 0.13);
      return [0, 1, 2].map((i) => lead(0, i * gap, 1, i === 2 ? r(rng, 1.2, 1.5) : 0.8));
    },
  },
];

export const FIGURE_BY_NAME: Record<string, Figure> = Object.fromEntries(FIGURES.map((f) => [f.name, f]));

// ---------------------------------------------------------------- spaces

export type SpaceName = "dry" | "room" | "trail" | "wide";

export interface Space {
  name: SpaceName;
  // `tail` scales the ambience to the category's own length budget: a category that
  // wants sounds gone in a quarter second must not be handed a two-second echo.
  build: (rng: () => number, tail: number) => Effect[] | undefined;
}

const reverb = (rng: () => number, tail: number): ReverbEffect => ({
  type: "reverb",
  decay: round3(r(rng, 0.18, 0.36) * tail),
  damping: round3(r(rng, 0.4, 0.6)),
  mix: round3(r(rng, 0.07, 0.13)),
});

const delayFx = (rng: () => number, slow: boolean, tail: number): DelayEffect => ({
  type: "delay",
  delay: round3((slow ? r(rng, 0.15, 0.2) : r(rng, 0.085, 0.13)) * Math.min(1, tail * 1.15)),
  feedback: round3(r(rng, 0.16, 0.27) * Math.min(1, tail)),
  wet: round3(r(rng, 0.16, 0.26)),
  lowpass: Math.round(r(rng, 1400, 3000)),
});

export const SPACES: Record<SpaceName, Space> = {
  dry: { name: "dry", build: () => undefined },
  room: { name: "room", build: (rng, tail) => [reverb(rng, tail)] },
  trail: { name: "trail", build: (rng, tail) => [delayFx(rng, false, tail)] },
  wide: { name: "wide", build: (rng, tail) => [delayFx(rng, true, tail)] },
};
