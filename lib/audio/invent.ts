import { CATEGORIES, type Category } from "./categories";
import {
  archetypeNames,
  archWeight,
  composeNamed,
  hybridize,
  type InventStats,
} from "./compose";
import { enforceLimits } from "./limits";
import { layersOf, type Layer, type Patch } from "./patch";
import {
  gentleShimmer,
  normalizeGains,
  strikeMotif,
  ULTRA_GESTURES,
  ULTRA_SCALES,
  type UltraContract,
} from "./wild";

// The Invent draw (code key stays "nebula"): within-category sources, all trained, none
// replaying the library. Two rebuilds shaped it. First (repetitiveness): the old fixed
// branches became ONE weighted lottery,
// hybrid's share scaling with its own dice. Second (the FUSION): the allocation walls
// came down - EVERY archetype and EVERY deck gesture is drawable in EVERY category.
// Sound-design judgment moved from binary eligibility into tiered starting PRIORS
// (natural 0.5 / plausible 0.35 / suspect 0.2) that apply only until the first verdict
// lands on that category x key cell - dice always override priors, both directions.
// Priors live here in code, never in invent-feedback.json: the feedback file stays
// pure human verdicts. Gestures still run the TAMED contract (consonant scales only,
// category register band); foreign archetypes get the category's gain/decay taming.
// Warps, exotic scales, cross-category breeding stay Singularity-only.

export interface InventSeed {
  patch: Patch;
  pack?: string;
}

export interface InventResult {
  patch: Patch;
  archetype: string;
  parentIndices?: [number, number];
}

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const logUniform = (rng: () => number, lo: number, hi: number) =>
  Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)));

export const NEBULA_SCALES = ["pentatonic", "minor-pent", "lydian", "harmonics"] as const;

export interface GestureSpec {
  root: readonly [number, number];
  shimmer: number; // probability of the gentle tail when the gesture brought none
  gainScale?: number;
  decayCap?: number;
  freqCap?: number; // whole-patch octave-down transpose until the highest tonal layer fits
  levelGains?: boolean; // summed simultaneous layers can clip; level them before taming
  lengthCap?: number; // seconds; delays and decays scale down together past this
  lengthFloor?: number; // seconds; too-short draws stretch up (probe: sub-0.4s reads as a tap, not a success)
  doubler?: number; // probability of a quiet detuned double of the loudest tone (complexity)
}

export const GESTURE_SPECS: Record<Category, GestureSpec> = {
  // Every category carries a freqCap. Only success did until the hybrid screech was
  // traced: without one, tame() has no register opinion at all and a draw is bounded
  // only by the 3500 Hz absolute ceiling, which is a dog whistle, not a UI sound.
  tap: { root: [200, 650], shimmer: 0.1, decayCap: 0.2, freqCap: 1300, levelGains: true },
  hover: { root: [300, 800], shimmer: 0, gainScale: 0.55, decayCap: 0.12, freqCap: 1400, levelGains: true },
  transition: { root: [250, 700], shimmer: 0.35, freqCap: 1200, levelGains: true },
  // Bands from the kept-success corpus (data/pool/success.json): notes p10-p90
  // 382-1579 Hz, duration p10-p90 0.27-0.52 s. Earlier tighter walls cut out half of
  // the taste the library itself proves.
  // freqCap sits under the calibrated sineCeilingHz (limits.json), not at the kept
  // corpus's p90: the corpus percentile counted sparkle partials the ear never asked for.
  success: { root: [300, 620], shimmer: 0.55, freqCap: 1150, levelGains: true, lengthCap: 0.55, lengthFloor: 0.25, doubler: 0.35 },
  error: { root: [140, 400], shimmer: 0.1, freqCap: 700, levelGains: true },
  warning: { root: [350, 800], shimmer: 0.2, freqCap: 1250, levelGains: true },
  notification: { root: [400, 820], shimmer: 0.6, freqCap: 1050, levelGains: true },
};

const NATURAL = 0.5;
const PLAUSIBLE = 0.35;
const SUSPECT = 0.2;

// The sound-design pass, as weights instead of walls. Natural = the fits the old
// allocation allowed plus the audit's obvious wins (bell/liquid in success,
// knock-knock in notification). Suspect = gesture energy that fights the category's
// job (celebration shapes in error, long/multi-note shapes on micro categories).
// Everything unlisted is plausible. Misc lists nothing: every voice natural there.
const GESTURE_NATURAL: Partial<Record<Category, readonly string[]>> = {
  tap: ["boop", "pop", "wood", "haptic", "air", "hollow", "pluck", "tick-tock", "marimba"],
  hover: ["air", "boop", "liquid", "pluck"],
  transition: ["liquid", "rise-bloom", "dew", "echo-note", "roll", "whoosh", "zip", "cascade", "harp"],
  success: ["tri-rise", "grace", "rise-bloom", "dew", "glass", "duotone", "harp", "pad", "ripple", "marimba", "bell", "liquid"],
  error: ["knock-knock", "pop", "wood", "hollow", "thump-sparkle", "bounce", "marimba", "tick-tock", "cascade"],
  warning: ["ding-dong", "call-response", "pair", "knock-knock", "tick-tock", "ripple", "pluck"],
  notification: ["bell", "ding-dong", "pair", "glass", "echo-note", "duotone", "crystal", "grace", "ripple", "pad", "marimba", "pluck", "harp", "knock-knock"],
};

// Hard closes (directed session misfiles, called twice or category-rule violations):
// these cells never draw for the category, regardless of dice.
const GESTURE_CLOSED: Partial<Record<Category, ReadonlySet<string>>> = {
  success: new Set(["trill", "cascade", "knock-knock", "glow", "thump-sparkle", "roll", "call-response", "formant", "echo-note", "hollow", "duotone", "crystal", "glass", "harp"]),
};

// Whole home grammars closed for a category (misfiles by identity, not by draw).
const ARCH_HOME_CLOSED: Partial<Record<Category, ReadonlySet<Category>>> = {
  success: new Set(["error", "warning", "tap", "hover", "transition"]),
};

// Named composer archetypes closed per category. The no-lone-strike success rule
// covers the composer path here (the gesture path runs through MOTIF_ONLY instead).
const ARCH_NAME_CLOSED: Partial<Record<Category, ReadonlySet<string>>> = {
  success: new Set(["strum", "single-ding", "bell", "thud-ping", "cha-ching"]),
};

const GESTURE_SUSPECT: Partial<Record<Category, readonly string[]>> = {
  tap: ["ding-dong", "tri-rise", "roll", "trill", "call-response", "cascade", "harp", "pad", "whoosh", "rise-bloom", "echo-note", "bounce", "ripple", "glow"],
  hover: ["bell", "glass", "knock-knock", "ding-dong", "thump-sparkle", "tri-rise", "roll", "trill", "call-response", "cascade", "harp", "pad", "ripple", "bounce", "echo-note", "crystal", "rise-bloom", "duotone", "glow", "whoosh"],
  transition: ["knock-knock", "wood", "haptic", "tick-tock", "thump-sparkle"],
  success: ["cascade", "tick-tock", "whoosh", "trill", "roll", "crystal"],
  error: ["tri-rise", "rise-bloom", "harp", "trill", "pad", "glass", "crystal", "bell", "dew", "zip", "ripple", "grace", "whoosh"],
  warning: ["pad", "harp", "glow", "whoosh"],
  notification: ["whoosh", "zip"],
};

export function gesturePrior(cat: Category, gesture: string): number {
  if (GESTURE_NATURAL[cat]?.includes(gesture)) return NATURAL;
  if (GESTURE_SUSPECT[cat]?.includes(gesture)) return SUSPECT;
  return PLAUSIBLE;
}

// Home category of every composer archetype.
export const ARCHETYPE_ORIGIN: Record<string, Category> = {};
for (const cat of CATEGORIES) {
  for (const name of archetypeNames(cat)) ARCHETYPE_ORIGIN[name] = cat;
}

// Foreign-archetype suspicion by the HOME grammar's energy: denial shapes fight
// success/notification, celebration shapes fight error, motion shapes fight the micro
// categories, and hover distrusts every foreign grammar except tap's micro family.
const ARCH_SUSPECT_TARGETS: Partial<Record<Category, readonly Category[]>> = {
  transition: ["tap", "hover"],
  success: ["error", "hover"],
  error: ["success", "notification", "hover"],
  warning: ["hover", "success"],
  notification: ["hover"],
};

export function archetypePrior(cat: Category, name: string): number {
  // The corpus-mirror experiment gets loud entry odds until its first verdicts land
  // (dice override this the moment a keep or delete is recorded).
  if (name === "mirror" && cat === "success") return 2;
  // The curator's ruling: naked swooshes belong to transition
  // only - elsewhere only ever as a quiet layer inside something, which no
  // single-recipe pull produces. Suspect everywhere else, overriding the plausible tier.
  if (name === "swoosh") return cat === "transition" ? NATURAL : SUSPECT;
  const home = ARCHETYPE_ORIGIN[name];
  if (!home || home === cat) return NATURAL;
  if (ARCH_SUSPECT_TARGETS[home]?.includes(cat)) return SUSPECT;
  return PLAUSIBLE;
}

// Dice override priors: the prior holds ONLY until the first verdict on that cell.
function cellWeight(stats: InventStats, cat: Category, key: string, prior: number): number {
  return stats[cat]?.[key] ? archWeight(stats, cat, key) : prior;
}

function nebulaContract(spec: GestureSpec, rng: () => number): UltraContract {
  const scaleName = pick(NEBULA_SCALES, rng);
  return {
    root: round3(logUniform(rng, spec.root[0], spec.root[1])),
    scale: ULTRA_SCALES[scaleName],
    scaleName,
    wave: pick(["sine", "sine", "sine", "triangle"] as const, rng),
    ...(rng() < 0.1 ? { fm: { depth: Math.round(r(rng, 20, 100)), ratio: round3(r(rng, 0.5, 2)) } } : {}),
    attack: round3(rng() < 0.7 ? r(rng, 0.002, 0.008) : r(rng, 0.01, 0.03)),
    gap: round3(r(rng, 0.05, 0.12)),
    accel: rng() < 0.3 ? round3(r(rng, 0.75, 0.92)) : 1,
    ramp: rng() < 0.6,
  };
}

// Success/notification never get a LONE crystal or glass strike (
// one ping of crystal reads piercing, not celebratory): there the gesture always arrives
// as an ascending double/triple motif (strikeMotif in wild.ts) on the consonant contract
// scale. Same dice key either way, so verdicts keep training the gesture itself.
// Success extension (directed rule: a lone strike is never a success, one beat is not
// enough): every single-strike gesture arrives as the ascending motif there.
const MOTIF_ONLY: Partial<Record<Category, ReadonlySet<string>>> = {
  success: new Set(["crystal", "glass", "bell", "marimba", "pluck", "liquid", "boop", "wood", "hollow", "duotone", "formant"]),
  notification: new Set(["crystal", "glass"]),
};

// Category taming shared by both de-novo paths: micro categories (hover, tap) squeeze
// gain and decay no matter which recipe produced the layers.
function tame(layers: Layer[], spec: GestureSpec, rng: () => number = Math.random): void {
  if (spec.gainScale) {
    for (const l of layers) l.gain = round3(Math.max(0.02, (l.gain ?? 0.1) * spec.gainScale));
  }
  if (spec.decayCap) {
    for (const l of layers) {
      if (l.envelope && l.envelope.decay > spec.decayCap) l.envelope.decay = spec.decayCap;
    }
  }
  if (spec.lengthCap || spec.lengthFloor) {
    const endOf = (l: Layer) => (l.delay ?? 0) + (l.envelope ? (l.envelope.attack ?? 0) + l.envelope.decay : 0.1);
    const end = Math.max(...layers.map(endOf));
    const target =
      spec.lengthCap && end > spec.lengthCap ? spec.lengthCap
      : spec.lengthFloor && end < spec.lengthFloor ? spec.lengthFloor
      : null;
    if (target) {
      const s = target / end;
      for (const l of layers) {
        if (l.delay) l.delay = round3(l.delay * s);
        if (l.envelope) l.envelope.decay = round3(l.envelope.decay * s);
      }
    }
  }
  if (spec.doubler && rng() < spec.doubler) {
    const tonal = layers.filter((l) => l.source.type !== "noise");
    if (tonal.length > 0) {
      const loudest = tonal.reduce((a, b) => ((a.gain ?? 0.1) >= (b.gain ?? 0.1) ? a : b));
      const double = structuredClone(loudest);
      double.gain = round3(Math.max(0.02, (loudest.gain ?? 0.1) * 0.5));
      if (double.source.type !== "noise") double.source.detune = Math.round(r(rng, 5, 12));
      layers.push(double);
    }
  }
  if (spec.freqCap) {
    // No quiet-layer exemption. A sparkle partial written at 0.03 gain also skips
    // limits.ts's prominence gate, and loudnessVolume rescales the whole patch at play
    // time, so "quiet" ones came back audible at 3kHz+. Every tonal layer counts.
    const topOf = (l: Layer): number =>
      l.source.type === "noise"
        ? 0
        : typeof l.source.frequency === "number"
          ? l.source.frequency
          : Math.max(l.source.frequency.start, l.source.frequency.end);
    let top = Math.max(...layers.map(topOf));
    // Whole-patch octave drops keep intervals and direction intact (no chord inversion).
    while (top > spec.freqCap && top > 0) {
      for (const l of layers) {
        if (l.source.type === "noise") continue;
        if (typeof l.source.frequency === "number") l.source.frequency = round3(l.source.frequency / 2);
        else {
          l.source.frequency.start = round3(l.source.frequency.start / 2);
          l.source.frequency.end = round3(l.source.frequency.end / 2);
        }
      }
      top /= 2;
    }
  }
}

function gestureCompose(cat: Category, name: string, rng: () => number, spec: GestureSpec = GESTURE_SPECS[cat]): InventResult {
  const c = nebulaContract(spec, rng);
  const layers: Layer[] = MOTIF_ONLY[cat]?.has(name)
    ? strikeMotif(name, c, rng, cat === "notification" ? 0.3 : 0)
    : ULTRA_GESTURES[name](c, rng);
  if (!layers.some((l) => l.effects) && rng() < spec.shimmer) {
    const fx = gentleShimmer(rng);
    for (const l of layers) l.effects = [fx];
  }
  enforceLimits(layers);
  normalizeGains(layers, rng);
  tame(layers, spec, rng);
  return { patch: layers.length === 1 ? layers[0] : { layers }, archetype: `g:${name}` };
}

export function invent(
  cat: Category,
  stats: InventStats,
  seeds: InventSeed[] = [],
  rng: () => number = Math.random,
  specOverride?: Partial<GestureSpec>,
): InventResult {
  const spec: GestureSpec = specOverride ? { ...GESTURE_SPECS[cat], ...specOverride } : GESTURE_SPECS[cat];
  // Success halved (directed session: hybrids read crammed/piercing/notification-ish).
  const hybridScale = cat === "success" ? 0.3 : 0.6;
  const hybridShare =
    seeds.length >= 2 ? Math.min(0.45, hybridScale * archWeight(stats, cat, "hybrid")) : 0;
  if (rng() < hybridShare) {
    const ai = Math.floor(rng() * seeds.length);
    const a = seeds[ai];
    const all = seeds.map((_, i) => i).filter((i) => i !== ai);
    const crossPack = all.filter((i) => seeds[i].pack !== a.pack);
    const from = crossPack.length > 0 ? crossPack : all;
    const bi = from[Math.floor(rng() * from.length)];
    const { patch } = hybridize(a.patch, seeds[bi].patch, rng);
    // Hybrids used to return here untamed, so they alone skipped the register cap, the
    // length cap and the gain fit that every other path gets. Measured at the time:
    // 71% of success hybrids sat above the category ceiling, p90 2827 Hz, topping out
    // at the absolute ceiling. That is the screech.
    const hLayers = layersOf(patch);
    if (spec.levelGains) normalizeGains(hLayers, rng);
    tame(hLayers, spec, rng);
    enforceLimits(hLayers);
    return { patch, archetype: "hybrid", parentIndices: [ai, bi] };
  }

  const entries: { gesture: boolean; name: string; w: number }[] = [
    ...Object.keys(ARCHETYPE_ORIGIN)
      .filter((a) => !ARCH_HOME_CLOSED[cat]?.has(ARCHETYPE_ORIGIN[a]) && !ARCH_NAME_CLOSED[cat]?.has(a))
      .map((a) => ({
        gesture: false,
        name: a,
        w: cellWeight(stats, cat, a, archetypePrior(cat, a)),
      })),
    ...Object.keys(ULTRA_GESTURES)
      .filter((g) => !GESTURE_CLOSED[cat]?.has(g))
      .map((g) => ({
        gesture: true,
        name: g,
        w: cellWeight(stats, cat, `g:${g}`, gesturePrior(cat, g)),
      })),
  ].filter((e) => e.w > 0);
  if (entries.length === 0) return gestureCompose(cat, pick(Object.keys(ULTRA_GESTURES), rng), rng, spec);
  const total = entries.reduce((s, e) => s + e.w, 0);
  let roll = rng() * total;
  let chosen = entries[entries.length - 1];
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) {
      chosen = e;
      break;
    }
  }
  if (chosen.gesture) return gestureCompose(cat, chosen.name, rng, spec);
  const composed = composeNamed(chosen.name, rng);
  if (!composed) return gestureCompose(cat, pick(Object.keys(ULTRA_GESTURES), rng), rng, spec);
  const layers = layersOf(composed.patch);
  // Summed simultaneous layers can clip (a draw read as a blown-out speaker). Keyed to
  // the category's own config, never the override, so a caller's spec tweak cannot
  // disable clip protection.
  if (GESTURE_SPECS[cat].levelGains) normalizeGains(layers, rng);
  tame(layers, spec, rng);
  return { patch: composed.patch, archetype: composed.archetype };
}
