import type { Category } from "./categories";
import type { LoudnessMeasure } from "./offline";
import type { Patch } from "./patch";
import { layersOf } from "./patch";

// Loudness leveling: sounds are NEVER rewritten. Each sound's measured
// winDb/peakDb (survey on the Calibrate tab -> data/pool/loudness.json) plus this config
// solve a play-time volume multiplier, so moving master/offsets re-levels everything
// instantly and import data stays byte-pristine. Fresh engine draws get measured at
// generate time instead of looked up. Export bakes the multiplier in at export time.

export interface LoudnessConfig {
  master: number; // target winDb for the whole library (ear anchors: #821/824/825/826 + core pack)
  offsets: Partial<Record<Category, number>>; // dB relative to master, applied by DRAWN category
  // Partial normalization: 1 drags every sound fully to target (flattens quiet-by-design
  // character and exposes blunt attacks the quiet used to hide); ~0.6-0.7 compresses the
  // spread instead - deliberate softness survives proportionally, inaudible extremes die.
  strength: number;
}

// strength 0.75 is math-derived from the library survey: >=0.75 keeps the worst -55dB
// outliers within 8dB of master (audible); <=0.85 keeps quiet-by-design swooshes >=3dB
// soft; 0.75 lands the library in a 5.9dB p10-p90 window (consistent to the ear) while
// core's swooshes keep ~6dB of intentional softness. Fine-tuned by ear from here.
export const DEFAULT_LOUDNESS: LoudnessConfig = {
  master: -25.5,
  offsets: { hover: -6 },
  strength: 0.75,
};

export interface LoudnessStore {
  config: LoudnessConfig;
  measures: Record<string, { winDb: number; peakDb: number }>;
}

// The one place a stored config is filled to a complete one: the API route reads it through
// this at dev time and the build-time snapshot in lib/curation.ts reads it through this at
// bundle time, so a new field defaults identically on both surfaces.
export function withLoudnessDefaults(raw?: Partial<LoudnessConfig> | null): LoudnessConfig {
  return {
    ...DEFAULT_LOUDNESS,
    ...raw,
    offsets: { ...DEFAULT_LOUDNESS.offsets, ...raw?.offsets },
    strength: raw?.strength ?? DEFAULT_LOUDNESS.strength,
  };
}

// Boost clamp: a sound sitting 30+dB under target is a near-silent outlier; amplifying
// it that far mostly raises its noise floor. Cap and let the outlier audit catch it.
const MAX_BOOST_DB = 24;
const MAX_CUT_DB = -24;
const PEAK_CEILING_DB = -1;

export function loudnessVolume(
  config: LoudnessConfig,
  measure: Pick<LoudnessMeasure, "winDb" | "peakDb">,
  category?: Category | null,
): number {
  const target = config.master + (category ? (config.offsets[category] ?? 0) : 0);
  let db = (target - measure.winDb) * (config.strength ?? 1);
  db = Math.min(db, PEAK_CEILING_DB - measure.peakDb);
  db = Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, db));
  return Math.pow(10, db / 20);
}

// Export fidelity: the synth computes every layer as gain x volume, so baking the solved
// volume into the layer gains is exact - the exported WAV/snippet/JSON plays identically
// to what the site played. Returns a new Patch; never mutates.
export function bakeVolume(patch: Patch, volume: number): Patch {
  if (volume === 1) return structuredClone(patch);
  const round3 = (x: number) => Math.round(x * 1000) / 1000;
  const clone = structuredClone(patch);
  for (const layer of layersOf(clone)) {
    layer.gain = round3((layer.gain ?? 0.5) * volume);
  }
  return clone;
}
