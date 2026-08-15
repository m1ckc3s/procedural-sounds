import type { Category } from "./categories";
import type { Patch } from "./patch";
import { layersOf } from "./patch";
import { perceptualDistance } from "./similarity";

// Feature-level taste learning for the Invent tab. The archetype dice (compose.ts) only
// learn WHICH mold is liked; these buckets learn WHY a verdict happened (register,
// harshness, duration, ...) across all molds at once, from the full patch logged with
// every keep/delete (data/pool/taste.json). A bucket needs MIN_BUCKET_N verdicts before
// it influences anything - one piercing delete is noise, five is a pattern.

export interface BucketTally {
  k: number;
  d: number;
}

export interface TasteData {
  buckets: Record<string, BucketTally>;
  deleted: Patch[];
}

export type TasteStore = Partial<Record<Category, TasteData>>;

const MIN_BUCKET_N = 4;
// Between the identical (0.05) and family (0.45) dedup tiers: near enough that the ear
// says "that thing I already rejected".
export const DELETED_TWIN_DISTANCE = 0.3;
export const DELETED_RING_CAP = 200;

const WAVE_HARSHNESS: Record<string, number> = { sine: 0, triangle: 0.25, square: 0.7, sawtooth: 1 };

export function extractBuckets(patch: Patch): string[] {
  const layers = layersOf(patch);
  let maxPitch = 0;
  let harshness = 0;
  let dur = 0;
  let minAttack = Infinity;
  let filterType = "none";
  let hasNoise = false;
  let hasSweep = false;
  let hasShimmer = false;
  for (const l of layers) {
    const e = l.envelope;
    dur = Math.max(dur, (l.delay ?? 0) + (e ? (e.attack ?? 0) + e.decay + (e.release ?? 0) : 0.5));
    minAttack = Math.min(minAttack, e?.attack ?? 0);
    if ((l.effects ?? []).some((fx) => fx.type === "delay")) hasShimmer = true;
    const filt = Array.isArray(l.filter) ? l.filter[0] : l.filter;
    if (filt && filterType === "none") filterType = filt.type;
    if (l.source.type === "noise") {
      hasNoise = true;
      continue;
    }
    harshness = Math.max(harshness, WAVE_HARSHNESS[l.source.type] ?? 0);
    const f = l.source.frequency;
    if (typeof f === "object") {
      hasSweep = true;
      maxPitch = Math.max(maxPitch, f.start, f.end);
    } else {
      maxPitch = Math.max(maxPitch, f);
    }
  }
  const pitch = maxPitch === 0 ? "none" : maxPitch < 400 ? "lo" : maxPitch < 800 ? "mid" : maxPitch < 1500 ? "hi" : "piercing";
  const wave = harshness < 0.3 ? "soft" : harshness < 0.7 ? "mid" : "harsh";
  const durB = dur < 0.1 ? "xs" : dur < 0.25 ? "s" : dur < 0.5 ? "m" : "l";
  const layersB = layers.length === 1 ? "1" : layers.length === 2 ? "2" : "3+";
  const attB = !isFinite(minAttack) || minAttack < 0.005 ? "instant" : minAttack < 0.025 ? "soft" : "slow";
  return [
    `pitch:${pitch}`,
    `wave:${wave}`,
    `dur:${durB}`,
    `att:${attB}`,
    `filter:${filterType}`,
    `layers:${layersB}`,
    `shimmer:${hasShimmer ? "y" : "n"}`,
    `noise:${hasNoise ? "y" : "n"}`,
    `sweep:${hasSweep ? "y" : "n"}`,
  ];
}

// Mean keep-rate over the patch's matured buckets; 0.5 = neutral (no data / young buckets).
export function tasteScore(taste: TasteData | undefined, patch: Patch): number {
  if (!taste) return 0.5;
  let sum = 0;
  let n = 0;
  for (const b of extractBuckets(patch)) {
    const t = taste.buckets[b];
    if (!t || t.k + t.d < MIN_BUCKET_N) continue;
    sum += (t.k + 1) / (t.k + t.d + 2);
    n++;
  }
  return n === 0 ? 0.5 : sum / n;
}

export function isDeletedTwin(taste: TasteData | undefined, patch: Patch): boolean {
  if (!taste) return false;
  return taste.deleted.some((d) => perceptualDistance(patch, d) < DELETED_TWIN_DISTANCE);
}

// Anomaly-weighted delete blame. A delete used to hit all buckets equally,
// so a half-good sound killed for one piercing layer also punished its innocent
// features (the "wave:soft took 40 delete hits" problem) - collateral damage that
// converged the survivors toward one flavor. Now a delete distributes its blame by how
// ABNORMAL each feature value is among this category's own keeps: if 90% of kept
// success sounds are wave:soft, a deleted soft sound puts almost no blame on wave:soft
// and shifts it onto its rare features (the piercing pitch that actually got it
// killed). Keeps still credit every bucket fully - a keep means the whole combination
// worked. Total delete mass stays = bucket count, so tallies remain comparable across
// eras. A feature with <MIN_BUCKET_N total keeps is cold and takes ZERO blame: without
// keep data there is no notion of "abnormal", and letting cold features default to
// full blame made them soak up the mass that belonged to the guilty features (first
// migration run: filter:none absorbed 92 deletes in success purely because filter was
// a brand-new feature). Cold features mature through keeps first, then join blame.
export function deleteBlame(t: TasteData, buckets: string[]): number[] {
  const raw = buckets.map((b) => {
    const feature = b.slice(0, b.indexOf(":") + 1);
    let featKeeps = 0;
    for (const [key, tally] of Object.entries(t.buckets)) {
      if (key.startsWith(feature)) featKeeps += tally.k;
    }
    if (featKeeps < MIN_BUCKET_N) return 0;
    return 1 - (t.buckets[b]?.k ?? 0) / featKeeps;
  });
  const sum = raw.reduce((a, x) => a + x, 0);
  if (sum <= 0) return raw.map(() => 1);
  return raw.map((x) => (x * raw.length) / sum);
}

// Shared by the API route and the workbench's optimistic local copy.
export function recordTasteVerdict(store: TasteStore, cat: Category, patch: Patch, verdict: "keep" | "delete"): void {
  const t = (store[cat] ??= { buckets: {}, deleted: [] });
  const buckets = extractBuckets(patch);
  if (verdict === "keep") {
    for (const b of buckets) {
      const tally = (t.buckets[b] ??= { k: 0, d: 0 });
      tally.k += 1;
    }
    return;
  }
  const blame = deleteBlame(t, buckets);
  buckets.forEach((b, i) => {
    const tally = (t.buckets[b] ??= { k: 0, d: 0 });
    tally.d = Math.round((tally.d + blame[i]) * 1000) / 1000;
  });
  t.deleted.push(patch);
  if (t.deleted.length > DELETED_RING_CAP) t.deleted.splice(0, t.deleted.length - DELETED_RING_CAP);
}
