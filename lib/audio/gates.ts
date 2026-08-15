import { SUGGESTED_EVENT_CATEGORIES } from "./categories";
import type { Patch } from "./patch";
import { layersOf } from "./patch";

// Mechanical categories are COMPUTED from measurable patch features (gates), never
// manually slotted; the user curates subtractively by vetoing (data/pool/exclusions.json).
// Semantic categories (success/error/warning/notification) stay manual in slots.json.
// Gates are deliberately GENEROUS: a wrongly-present sound is audible during review and
// gets vetoed; a wrongly-absent sound is invisible forever. When in doubt, include.
// Loudness (gain) is intentionally not a gate input: the loudness-normalization pass will
// rewrite every gain later and membership must not reshuffle when it does.

export const MECHANICAL_CATEGORIES = ["tap", "hover", "transition"] as const;
export type MechanicalCategory = (typeof MECHANICAL_CATEGORIES)[number];

// Semantic aisles are ALSO cast generously (name hints + signal heuristics) and vetoed in
// Review; manual slotting on the Slot page remains the additive override for gate misses.
export const SEMANTIC_GATED_CATEGORIES = ["success", "error", "warning", "notification"] as const;
export type SemanticGatedCategory = (typeof SEMANTIC_GATED_CATEGORIES)[number];

export const GATED_CATEGORIES = [...MECHANICAL_CATEGORIES, ...SEMANTIC_GATED_CATEGORIES] as const;
export type GatedCategory = (typeof GATED_CATEGORIES)[number];

// Tunable thresholds (seconds / semitones). Edit here to re-sort all sounds at once.
const HOVER_MAX_DUR = 0.14;
const TAP_MAX_DUR = 0.3;
const TAP_MAX_ATTACK = 0.03;
const TRANSITION_MIN_SWEEP_SEMIS = 4;
const TRANSITION_NOISE_MIN_DUR = 0.08;

interface PatchFeatures {
  dur: number;
  minAttack: number;
  anyNoise: boolean;
  noiseDur: number;
  maxSweepSemis: number;
  sweepDir: "up" | "down" | null;
  hasFilterEnv: boolean;
  layerCount: number;
  harsh: boolean;
  maxFreq: number;
  minFreq: number;
  ascendingLayers: boolean;
}

export function patchFeatures(patch: Patch): PatchFeatures {
  const layers = layersOf(patch);
  let dur = 0;
  let minAttack = Infinity;
  let anyNoise = false;
  let noiseDur = 0;
  let maxSweepSemis = 0;
  let sweepDir: "up" | "down" | null = null;
  let hasFilterEnv = false;
  let harsh = false;
  let maxFreq = 0;
  let minFreq = Infinity;
  const onsetPitches: { onset: number; freq: number }[] = [];

  for (const layer of layers) {
    const e = layer.envelope;
    const layerDur = e ? (e.attack ?? 0) + e.decay + (e.release ?? 0) : 0.5;
    dur = Math.max(dur, (layer.delay ?? 0) + layerDur);
    minAttack = Math.min(minAttack, e?.attack ?? 0);

    const s = layer.source;
    if (s.type === "noise") {
      anyNoise = true;
      noiseDur = Math.max(noiseDur, layerDur);
    } else {
      if (s.type === "square" || s.type === "sawtooth") harsh = true;
      const start = typeof s.frequency === "object" ? s.frequency.start : s.frequency;
      maxFreq = Math.max(maxFreq, start);
      minFreq = Math.min(minFreq, start);
      onsetPitches.push({ onset: layer.delay ?? 0, freq: start });
      if (typeof s.frequency === "object") {
        const semis = 12 * Math.log2(s.frequency.end / s.frequency.start);
        if (Math.abs(semis) > Math.abs(maxSweepSemis)) {
          maxSweepSemis = semis;
          sweepDir = semis > 0 ? "up" : "down";
        }
      }
    }

    const filters = layer.filter ? (Array.isArray(layer.filter) ? layer.filter : [layer.filter]) : [];
    if (filters.some((f) => f.envelope)) hasFilterEnv = true;
  }

  onsetPitches.sort((a, b) => a.onset - b.onset);
  const ascendingLayers =
    onsetPitches.length >= 2 && onsetPitches.every((p, i) => i === 0 || p.freq >= onsetPitches[i - 1].freq);

  return {
    dur,
    minAttack: minAttack === Infinity ? 0 : minAttack,
    anyNoise,
    noiseDur,
    maxSweepSemis: Math.abs(maxSweepSemis),
    sweepDir,
    hasFilterEnv,
    layerCount: layers.length,
    harsh,
    maxFreq,
    minFreq: minFreq === Infinity ? 0 : minFreq,
    ascendingLayers,
  };
}

export interface GateResult {
  categories: GatedCategory[];
  // 0..1 per member category: low = barely passed the gate (review these first).
  margins: Partial<Record<GatedCategory, number>>;
  why: string;
}

// Signal heuristics for the semantic cast. Name hints (the event's upstream name, via
// SUGGESTED_EVENT_CATEGORIES) score high-confidence; signal-only hits score low so they
// sort to the top of the review list.
function semanticSignal(f: PatchFeatures): SemanticGatedCategory[] {
  const out: SemanticGatedCategory[] = [];
  if (f.ascendingLayers && !f.anyNoise && f.dur >= 0.15) out.push("success");
  if ((f.harsh && f.dur <= 0.6) || (f.sweepDir === "down" && f.maxSweepSemis >= 3 && f.maxFreq <= 500)) out.push("error");
  if (f.harsh && f.dur <= 0.4 && f.minFreq >= 200 && f.maxFreq <= 1000) out.push("warning");
  if (!f.anyNoise && f.maxFreq >= 500 && f.dur >= 0.12 && f.dur <= 0.9) out.push("notification");
  return out;
}

export function gateCategories(patch: Patch, event?: string): GateResult {
  const f = patchFeatures(patch);
  const categories: GatedCategory[] = [];
  const margins: Partial<Record<GatedCategory, number>> = {};

  if (f.dur <= HOVER_MAX_DUR) {
    categories.push("hover");
    margins.hover = 1 - f.dur / HOVER_MAX_DUR;
  }

  if (f.dur <= TAP_MAX_DUR && f.minAttack <= TAP_MAX_ATTACK) {
    categories.push("tap");
    margins.tap = Math.min(1 - f.dur / TAP_MAX_DUR, 1 - f.minAttack / TAP_MAX_ATTACK);
  }

  // transition = the sound MOVES (sweep, noise wash, or filter swoosh); long static
  // chimes deliberately stay out or they would flood the aisle.
  const bySweep = f.maxSweepSemis >= TRANSITION_MIN_SWEEP_SEMIS;
  const byNoise = f.anyNoise && f.noiseDur >= TRANSITION_NOISE_MIN_DUR;
  if (bySweep || byNoise || f.hasFilterEnv) {
    categories.push("transition");
    margins.transition = bySweep
      ? Math.min(1, f.maxSweepSemis / TRANSITION_MIN_SWEEP_SEMIS - 1)
      : byNoise
        ? Math.min(1, f.noiseDur / TRANSITION_NOISE_MIN_DUR - 1)
        : 0.5;
  }

  const signalHits = new Set(semanticSignal(f));
  const nameHits = new Set(
    (event ? (SUGGESTED_EVENT_CATEGORIES[event] ?? []) : []).filter((c): c is SemanticGatedCategory =>
      (SEMANTIC_GATED_CATEGORIES as readonly string[]).includes(c),
    ),
  );
  for (const cat of SEMANTIC_GATED_CATEGORIES) {
    const byName = nameHits.has(cat);
    const bySignal = signalHits.has(cat);
    if (!byName && !bySignal) continue;
    categories.push(cat);
    margins[cat] = byName && bySignal ? 1 : byName ? 0.7 : 0.2;
  }

  const bits = [
    `${Math.round(f.dur * 1000)}ms`,
    f.anyNoise ? "noise" : "tonal",
  ];
  if (f.maxSweepSemis >= 1 && f.sweepDir) {
    bits.push(`sweep ${f.sweepDir === "up" ? "↑" : "↓"}${Math.round(f.maxSweepSemis)}st`);
  }
  if (f.hasFilterEnv) bits.push("filter env");
  if (f.harsh) bits.push("harsh");
  if (f.ascendingLayers) bits.push("rising layers");
  if (f.layerCount > 1) bits.push(`${f.layerCount} layers`);
  if (nameHits.size > 0) bits.push(`name → ${[...nameHits].join("/")}`);

  return { categories, margins, why: bits.join(" · ") };
}
