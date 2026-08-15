import { CATEGORIES, type Category } from "./categories";
import { hybridize } from "./compose";
import { castFrom, type Profile, type Vetoes } from "./craft";
import { createFrom, type OpStats } from "./create";
import { enforceLimits } from "./limits";
import { layersOf, type Layer, type Patch } from "./patch";
import { matchPercent, perceptualDistance } from "./similarity";
import {
  discovery,
  gentleShimmer,
  normalizeGains,
  ULTRA_GESTURES,
  ULTRA_SCALES,
  type UltraContract,
} from "./wild";

// PROSPECT: the category-agnostic discovery bench. One button, one sound, keep or move
// on. Named for what it is - panning, where most of what comes up is gravel and the
// point is that the gold pays for the sifting.
//
// It is NOT a sixth generator with new ideas, and it is not the Craft caster with the
// categories deleted (which is what it was first built as, and it sounded like it). It
// is a draw across FIVE different sources, each contributing something the others
// cannot, followed by one shared finishing pass that makes them arrive at a common
// standard:
//
//   remix   - a curated library sound put through the structural operations behind
//             Creations. The highest-quality source in the building, because it starts
//             from something a human already approved.
//   craft   - instrument x figure x space. Coherent physical objects; the source that
//             turned output from "mashed up" to "designed".
//   breed   - two library sounds crossed, skeleton from one and timbre from the other.
//             Produces shapes no single grammar contains.
//   deck    - the shared gesture deck on a consonant, register-bounded contract. This
//             is Invent's best path with its walls kept.
//   wildcard- the untrained discovery path. Kept deliberately small and always finished,
//             because raw it is noise, but it is the only source that can surprise.
//
// The finishing pass is what makes the mixture work. Whatever the source, the result is
// transposed down whole octaves until its highest partial clears the ceiling, fitted to
// a length budget, gain-levelled, and usually given a tail. Every quality complaint this
// project ever logged (piercing, harsh, drags, clipped, thin) was a failure of one of
// those four, so they are applied to everything rather than trusted per-engine.

export type Source = "remix" | "craft" | "breed" | "deck" | "wildcard";

export interface Prospected {
  patch: Patch;
  id: number;
  source: Source;
  label: string;
  // How close the draw landed to the nearest thing already in the library. Draws above
  // the rejection bar never reach here, so this reports the near misses: the band where
  // a sound is legitimately new but close enough to an existing one to be worth a look
  // before it is kept.
  nearestPct: number;
  nearestLabel: string;
  // The actual nearest library recipe, so a flagged draw can be A/B'd against the thing
  // it resembles instead of taken on trust.
  nearestPatch?: Patch;
}

// A library sound plus enough identity to name it back to the curator.
export interface ProspectSeed {
  patch: Patch;
  label: string;
}

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)];
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const logUniform = (rng: () => number, lo: number, hi: number) =>
  Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)));

// Shared standard, applied to every source.
const CEILING_HZ = 1050; // under the calibrated sineCeilingHz; nothing was ever rejected for being too low
const MAX_SECONDS = 0.85;
const GAIN_BUDGET = 0.5;

const REAL_CATEGORIES = CATEGORIES.filter((c) => c !== "hover");

// The craft slice keeps its own wide profile: families and figures that survived
// curation somewhere, minus the voices rejected everywhere they ever drew.
const CRAFT_PROFILE: Profile = {
  leadFamilies: ["wood", "tine", "metal", "string", "digital", "body", "air"],
  leadDecays: ["tight", "medium"],
  banned: ["bell-tubular", "gong-soft", "blip-square", "music-box", "glass-fm", "anvil", "pluck-steel"],
  bodies: ["sub-thump", "knock", "kick-body", "tom"],
  transients: ["click-latch", "click-soft", "tick-dry", "shaker"],
  figures: [
    "rise-two", "rise-two", "rise-three", "rise-three", "pair-quick",
    "transient-lead", "transient-lead", "transient-single",
    "body-and-light", "body-and-light", "blur-three", "accel-rise",
    "call-answer", "single", "cluster", "rise-four",
  ],
  intervals: ["major", "pentatonic", "fifths", "fourths"],
  root: [220, 620],
  ceilingHz: CEILING_HZ,
  maxSeconds: MAX_SECONDS,
  gainBudget: GAIN_BUDGET,
  spaces: { dry: 0.24, room: 0.24, trail: 0.36, wide: 0.16 },
};

const DECK_SCALES = ["pentatonic", "minor-pent", "lydian", "harmonics"] as const;

// Gestures whose character survived curation. The piercing-strike family and the
// alarm-shaped ones are absent on purpose.
const DECK_VOICES = [
  "boop", "pop", "dew", "wood", "marimba", "pluck", "liquid", "air", "hollow",
  "haptic", "duotone", "rise-bloom", "grace", "echo-note", "ripple", "tri-rise",
  "bounce", "zip", "glow", "formant",
].filter((n) => n in ULTRA_GESTURES);

function deckContract(rng: () => number): UltraContract {
  const scaleName = pick(DECK_SCALES, rng);
  return {
    root: round3(logUniform(rng, 220, 560)),
    scale: ULTRA_SCALES[scaleName],
    scaleName,
    wave: pick(["sine", "sine", "sine", "triangle"] as const, rng),
    ...(rng() < 0.08 ? { fm: { depth: Math.round(r(rng, 20, 90)), ratio: round3(r(rng, 0.5, 2)) } } : {}),
    attack: round3(rng() < 0.7 ? r(rng, 0.002, 0.008) : r(rng, 0.01, 0.03)),
    gap: round3(r(rng, 0.05, 0.12)),
    accel: rng() < 0.3 ? round3(r(rng, 0.75, 0.92)) : 1,
    ramp: rng() < 0.6,
  };
}

const topTonal = (layers: Layer[]): number => {
  let top = 0;
  for (const l of layers) {
    if (l.source.type === "noise") continue;
    const f = l.source.frequency;
    const hz = typeof f === "number" ? f : Math.max(f.start, f.end);
    if (hz > top) top = hz;
  }
  return top;
};

// THE FINISHING PASS. Source-blind on purpose: a rule that only some engines obey is a
// rule that leaks, and every leak in this project was found by ear rather than by test.
function finish(layers: Layer[], rng: () => number): void {
  // 1. Register. Whole-patch octave drops, so intervals and direction survive intact.
  let top = topTonal(layers);
  let guard = 0;
  while (top > CEILING_HZ && top > 0 && guard++ < 8) {
    for (const l of layers) {
      if (l.source.type === "noise") continue;
      const f = l.source.frequency;
      if (typeof f === "number") l.source.frequency = round3(f / 2);
      else {
        f.start = round3(f.start / 2);
        f.end = round3(f.end / 2);
      }
    }
    top /= 2;
  }

  // 2. Length, counting the envelope only. Ambience is budgeted separately below.
  const endOf = (l: Layer) =>
    (l.delay ?? 0) + (l.envelope ? (l.envelope.attack ?? 0) + l.envelope.decay + (l.envelope.release ?? 0) : 0.1);
  const end = Math.max(...layers.map(endOf));
  if (end > MAX_SECONDS) {
    const s = MAX_SECONDS / end;
    for (const l of layers) {
      if (l.delay) l.delay = round3(l.delay * s);
      if (l.envelope) {
        l.envelope.decay = round3(l.envelope.decay * s);
        if (l.envelope.release) l.envelope.release = round3(l.envelope.release * s);
      }
    }
  }

  // 3. A tail on most draws. This is the single change that most reliably reads as
  // "finished" rather than "raw".
  if (!layers.some((l) => l.effects) && rng() < 0.68) {
    const fx = gentleShimmer(rng);
    for (const l of layers) l.effects = [fx];
  }

  // 4. Level, then clamp. normalizeGains balances layers against each other; the budget
  // stops the sum from summing hot.
  normalizeGains(layers, rng);
  const sum = layers.reduce((a, l) => a + (l.gain ?? 0), 0);
  if (sum > GAIN_BUDGET && sum > 0) {
    const s = GAIN_BUDGET / sum;
    for (const l of layers) l.gain = round3(Math.max(0.015, (l.gain ?? 0) * s));
  }
  enforceLimits(layers);
}

interface Drawn {
  patch: Patch;
  source: Source;
  label: string;
}

function drawOnce(seeds: Patch[], opStats: OpStats, vetoes: Vetoes, rng: () => number): Drawn {
  // Weights: the two sources with a human already in the loop (remix from a curated
  // seed, craft from coherent objects) carry the batch; wildcard stays a garnish.
  const roll = rng();
  const canSeed = seeds.length > 0;
  const canBreed = seeds.length >= 2;

  if (roll < 0.3 && canSeed) {
    const cat = pick(REAL_CATEGORIES, rng) as Category;
    const seed = pick(seeds, rng);
    const res = createFrom(seed, cat, opStats, rng);
    return { patch: res.patch, source: "remix", label: `remix · ${res.ops.join(" + ")}` };
  }
  if (roll < 0.44 && canBreed) {
    const a = Math.floor(rng() * seeds.length);
    let b = Math.floor(rng() * seeds.length);
    if (b === a) b = (b + 1) % seeds.length;
    const res = hybridize(seeds[a], seeds[b], rng);
    return { patch: res.patch, source: "breed", label: "breed · two library parents" };
  }
  if (roll < 0.62) {
    const name = pick(DECK_VOICES, rng);
    const layers = ULTRA_GESTURES[name](deckContract(rng), rng);
    return { patch: layers.length === 1 ? layers[0] : { layers }, source: "deck", label: `deck · ${name}` };
  }
  if (roll < 0.9) {
    const res = castFrom(CRAFT_PROFILE, rng, vetoes);
    return { patch: res.patch, source: "craft", label: `craft · ${res.label}` };
  }
  const res = discovery(seeds, 0.6, rng);
  return { patch: res.patch, source: "wildcard", label: `wildcard · ${res.label}` };
}

export interface ProspectMemory {
  seen: Patch[];
  next: number;
}

export const newMemory = (): ProspectMemory => ({ seen: [], next: 1 });

const DISTINCT = 0.15;

export function prospect(
  memory: ProspectMemory,
  library: ProspectSeed[] = [],
  opStats: OpStats = {},
  vetoes: Vetoes = {},
  rng: () => number = Math.random,
): Prospected {
  const seeds = library.map((s) => s.patch);
  // Rejected against two things: what this sitting has already heard, and the WHOLE
  // library. The second matters because the remix path starts from a curated sound and
  // can land back within reach of its own parent, which is a duplicate rather than a
  // discovery. Measured at about 2 ms per draw over ~530 seeds, so the full sweep is
  // affordable and sampling would only let duplicates through.
  const against = [...memory.seen.slice(-160), ...seeds];

  let best: Drawn | null = null;
  let bestDistance = -1;

  for (let tries = 0; tries < 40; tries++) {
    const candidate = drawOnce(seeds, opStats, vetoes, rng);
    const layers = layersOf(candidate.patch);
    finish(layers, rng);
    const patch: Patch = layers.length === 1 ? layers[0] : { layers };
    const finished: Drawn = { ...candidate, patch };
    const nearest = against.reduce(
      (min, p) => Math.min(min, perceptualDistance(patch, p)),
      Number.POSITIVE_INFINITY,
    );
    if (nearest > DISTINCT) {
      best = finished;
      break;
    }
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = finished;
    }
  }

  const chosen = best!;
  memory.seen.push(chosen.patch);

  // Report the nearest LIBRARY relative, not the nearest thing in the session: the
  // question this answers is "would keeping this add a near-twin to the library".
  let nd = Number.POSITIVE_INFINITY;
  let nearest: ProspectSeed | undefined;
  for (const s of library) {
    const d = perceptualDistance(chosen.patch, s.patch);
    if (d < nd) {
      nd = d;
      nearest = s;
    }
  }

  return {
    ...chosen,
    id: memory.next++,
    nearestPct: Number.isFinite(nd) ? matchPercent(nd) : 0,
    nearestLabel: nearest?.label ?? "",
    ...(nearest ? { nearestPatch: nearest.patch } : {}),
  };
}
