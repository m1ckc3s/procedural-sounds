import type { Category, PoolBucket } from "./categories";
import { gateCategories } from "./gates";
import { LIMITS } from "./limits";
import type { Frequency, Layer, Patch } from "./patch";
import { layersOf } from "./patch";

const PLAYABLE_TYPES = new Set(["sine", "triangle", "square", "sawtooth", "noise"]);

export function isPlayable(patch: Patch): boolean {
  return layersOf(patch).every((l) => PLAYABLE_TYPES.has(l.source.type));
}

export interface PoolSound {
  id: string;
  pack: string;
  event: string;
  categories: Category[];
  patch: Patch;
  playable: boolean;
  favorite?: boolean;
}

export interface Pool {
  all: PoolSound[];
  byCategory: Map<Category, PoolSound[]>;
}

export interface GenerateResult {
  patch: Patch;
  seed: PoolSound;
  mutated: boolean;
}

export type ReferenceData = Record<
  string,
  { description?: string; sounds: Record<string, Patch> }
>;

export type SlotOverrides = Record<string, Category[]>;
// Keyed by BUCKET (the file a keep was written to), never by membership.
export type ApprovedPools = Partial<Record<PoolBucket, Patch[]>>;
export type Exclusions = Record<string, string[]>;

const ORIGINAL_DRAW_CHANCE = 0.25;

export function soundCategories(id: string, slots?: SlotOverrides): Category[] {
  return slots?.[id] ?? [];
}

// KEEPS: manual slots, full stop. IMPORTS: manual slots UNION gates MINUS vetoes.
//
// A keep belongs to NOTHING until it is signed off in the to-sort inbox. That gate lives
// here, inside the one formula, rather than as a filter on each surface: Library chips,
// aisle contents, seed pools and product draws all read membership through this function,
// so gating here is what makes them agree. Returning [] also drops the sound into the
// zero-category safety net, which is the to-sort view.
//
// Gates no longer cast keeps. They earn their keep on IMPORTS, which arrive with no
// categories at all, so a machine guess is all that stands between them and invisibility. A
// keep is placed by hand, and with seven categories a guess cost more than it saved: stating
// "this is a notification" took one tick, undoing three wrong guesses took three vetoes.
//
// Flipping this rule DIRECTLY was tried once and reverted within minutes, because it deletes
// memberships with no record of what they were (notification fell 181 to 88 in one render).
// What made it safe was migrating first: every gate-cast membership was confirmed into a
// manual slot through Library's gate-cast queue, so when this landed every category count was
// byte-identical before and after. Vetoes on keeps went inert at the same moment and are no
// longer read here or rendered in the inspector. Never change a membership rule without a
// migration that empties first.
export function effectiveCategories(
  id: string,
  patch: Patch,
  slots?: SlotOverrides,
  exclusions?: Exclusions,
  awaitingSort?: ReadonlySet<string>,
): Category[] {
  if (awaitingSort?.has(id)) return [];
  const manual = soundCategories(id, slots);
  if (id.startsWith("pool/")) return manual;
  const vetoed = new Set(exclusions?.[id] ?? []);
  const event = id.slice(id.indexOf("/") + 1);
  const gated = gateCategories(patch, event).categories.filter((c) => !vetoed.has(c));
  return [...new Set([...manual, ...gated])];
}

export function buildPool(
  reference: ReferenceData,
  slots?: SlotOverrides,
  approved?: ApprovedPools,
  deleted?: string[],
  duplicates?: string[],
  exclusions?: Exclusions,
  favorites?: string[],
  awaitingSort?: string[],
): Pool {
  const gone = new Set([...(deleted ?? []), ...(duplicates ?? [])]);
  const faves = new Set(favorites ?? []);
  const unsorted = new Set(awaitingSort ?? []);
  const all: PoolSound[] = [];
  const byCategory = new Map<Category, PoolSound[]>();

  const add = (sound: PoolSound) => {
    all.push(sound);
    if (!sound.playable) return;
    for (const cat of sound.categories) {
      const list = byCategory.get(cat) ?? [];
      list.push(sound);
      byCategory.set(cat, list);
    }
  };

  for (const [pack, { sounds }] of Object.entries(reference)) {
    for (const [event, patch] of Object.entries(sounds)) {
      const id = `${pack}/${event}`;
      if (gone.has(id)) continue;
      add({
        id,
        pack,
        event,
        categories: effectiveCategories(id, patch, slots, exclusions, unsorted),
        patch,
        playable: isPlayable(patch),
        favorite: faves.has(id),
      });
    }
  }

  // Curated saves are full cast-and-veto citizens under the SAME formula as imports:
  // manual slots (the keep wrote its save category there) UNION gates MINUS vetoes.
  // Do NOT force-include the save category here - vetoing strips the manual slot, and a
  // hardcoded save cat would be a second, veto-proof authority (caused pool counts to
  // disagree with the Slot/Review surfaces).
  for (const [cat, patches] of Object.entries(approved ?? {})) {
    (patches ?? []).forEach((patch, i) => {
      const id = `pool/${cat}/${i}`;
      if (gone.has(id)) return;
      add({
        id,
        pack: "pool",
        event: cat,
        categories: effectiveCategories(id, patch, slots, exclusions, unsorted),
        patch,
        playable: isPlayable(patch),
        favorite: faves.has(id),
      });
    });
  }

  return { all, byCategory };
}

// Curator taste: favorited seeds draw 1.5x by default. Pass favoriteWeight=1 for a uniform
// draw (the batch Variations queue does: it optimizes diversity, not taste).
// Lowered from 3: favorites are ear-picked while dupes still exist, so 3x
// over-weighted whole categories. Revisit once the library is deduped (see TODO.md).
export const FAVORITE_WEIGHT = 1.5;

export function generate(
  pool: Pool,
  category?: Category,
  variationRate = 1 - ORIGINAL_DRAW_CHANCE,
  rng: () => number = Math.random,
  favoriteWeight = FAVORITE_WEIGHT,
): GenerateResult | null {
  const candidates = category
    ? (pool.byCategory.get(category) ?? [])
    : pool.all.filter((s) => s.playable);
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, s) => sum + (s.favorite ? favoriteWeight : 1), 0);
  let roll = rng() * totalWeight;
  let seed = candidates[candidates.length - 1];
  for (const s of candidates) {
    roll -= s.favorite ? favoriteWeight : 1;
    if (roll <= 0) {
      seed = s;
      break;
    }
  }
  if (rng() >= variationRate) {
    return { patch: structuredClone(seed.patch), seed, mutated: false };
  }
  return { patch: mutatePatch(seed.patch, rng), seed, mutated: true };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const vary = (rng: () => number, pct: number) => 1 + (rng() * 2 - 1) * pct;

function scaleFrequency(freq: Frequency, ratio: number): Frequency {
  if (typeof freq === "number") return clamp(freq * ratio, 150, 5200);
  return {
    start: clamp(freq.start * ratio, 150, 5200),
    end: clamp(freq.end * ratio, 60, 5200),
  };
}

// One pitch ratio and one delay factor shared across layers keeps the seed's
// musical intervals and rhythm intact; only per-layer texture params vary independently.
export function mutatePatch(source: Patch, rng: () => number = Math.random): Patch {
  const patch = structuredClone(source);
  const pitchRatio = 2 ** (((rng() * 2 - 1) * 3) / 12);
  const delayFactor = vary(rng, 0.2);

  const mutateLayer = (layer: Layer) => {
    const src = layer.source;
    if (src.type !== "noise") {
      src.frequency = scaleFrequency(src.frequency, pitchRatio);
      if (src.fm) {
        src.fm.depth = clamp(src.fm.depth * vary(rng, 0.25), 20, 450);
        src.fm.ratio = clamp(src.fm.ratio * vary(rng, 0.1), 0.4, 4);
      }
    }

    if (layer.envelope) {
      layer.envelope.decay = clamp(layer.envelope.decay * vary(rng, 0.2), 0.01, 0.7);
      if (layer.envelope.release !== undefined) {
        layer.envelope.release = clamp(layer.envelope.release * vary(rng, 0.2), 0.004, 0.3);
      }
    }

    if (layer.gain !== undefined) {
      layer.gain = clamp(layer.gain * vary(rng, 0.15), 0.03, 0.3);
    }

    if (layer.delay !== undefined) {
      layer.delay = clamp(layer.delay * delayFactor, 0, 0.25);
    }

    const filters = layer.filter
      ? Array.isArray(layer.filter)
        ? layer.filter
        : [layer.filter]
      : [];
    for (const f of filters) {
      f.frequency = clamp(f.frequency * vary(rng, 0.15), 200, 3500);
      if (f.envelope) {
        f.envelope.peak = clamp(f.envelope.peak * vary(rng, 0.15), 1000, 8000);
      }
    }

    for (const effect of layer.effects ?? []) {
      if (effect.type !== "reverb") continue;
      effect.decay = clamp((effect.decay ?? 0.5) * vary(rng, 0.15), 0.3, 1);
      effect.mix = clamp((effect.mix ?? 0.3) * vary(rng, 0.2), 0.05, 0.2);
    }
  };

  for (const layer of layersOf(patch)) mutateLayer(layer);
  capUpwardDrift(patch, source);
  return patch;
}

// Frequency may drift, but never UPWARD past the ceiling, and never past the seed when the
// seed is already over it. A rail bolted to the output, NOT a change to the nudge math, which
// stays frozen: every value here still comes from mutatePatch, this only refuses to publish
// one that climbed.
//
// The variation pass was the only generator with no frequency ceiling at all. create,
// compose, invent and wild all run enforceLimits; this one never did, so a +3 semitone bump
// on a 2400Hz partial shipped at 2855Hz. Capping against the SEED as well as the ceiling
// matters because the library still holds outliers above it: without that term, varying one
// would clamp it down and read as the variation engine quietly retuning the library.
function capUpwardDrift(patch: Patch, seed: Patch): void {
  const ceiling = LIMITS.absoluteCeilingHz;
  const seeds = layersOf(seed);
  layersOf(patch).forEach((layer, i) => {
    const src = layer.source;
    const from = seeds[i]?.source;
    if (src.type === "noise" || !from || from.type === "noise") return;
    const cap = (mutated: number, original: number) =>
      Math.min(mutated, Math.max(original, ceiling));
    if (typeof src.frequency === "number") {
      if (typeof from.frequency === "number") src.frequency = cap(src.frequency, from.frequency);
      return;
    }
    const base = typeof from.frequency === "number"
      ? { start: from.frequency, end: from.frequency }
      : from.frequency;
    src.frequency = {
      ...src.frequency,
      start: cap(src.frequency.start, base.start),
      end: cap(src.frequency.end, base.end),
    };
  });
}
