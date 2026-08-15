import { layersOf, type Layer, type Patch } from "./patch";

// Which perceptual traits differ between two patches, so the workbench can label a
// family neighbor ("length only" = likely duplicate, "pitch + sweep + timbre" = real
// variation). Layers compared in onset order (rising vs falling pairs differ), gain
// excluded. This file IS the metric; the offline precompute it once mirrored is gone.

interface LayerFeat {
  noise: boolean;
  onset: number;
  f: number;
  fEnd: number;
  dur: number;
  att: number;
  fmIndex: number;
  hasFm: boolean;
  hasFilter: boolean;
  filt: number;
  filtType: string;
  color: string;
  sus: number;
  curve: string;
}

function layerFeat(layer: Layer): LayerFeat {
  const s = layer.source;
  const noise = s.type === "noise";
  const freq = "frequency" in s ? s.frequency : undefined;
  const f = typeof freq === "object" ? freq.start : (freq ?? 1000);
  const fEnd = typeof freq === "object" ? freq.end : f;
  const e = layer.envelope;
  const dur = Math.max(0.001, (e?.attack ?? 0) + (e?.decay ?? 0) + (e?.release ?? 0));
  const fm = !noise && "fm" in s ? s.fm : undefined;
  const filter = Array.isArray(layer.filter) ? layer.filter[0] : layer.filter;
  return {
    noise,
    onset: layer.delay ?? 0,
    f,
    fEnd,
    dur,
    att: e?.attack ?? 0,
    fmIndex: fm ? fm.depth / f : 0,
    hasFm: !!fm,
    hasFilter: !!filter,
    filt: filter?.frequency ?? 0,
    filtType: filter?.type ?? "",
    color: noise ? ((s as { color?: string }).color ?? "white") : "",
    sus: e?.sustain ?? 0,
    curve: e?.curve ?? "smooth",
  };
}

const semis = (a: number, b: number) => Math.abs(12 * Math.log2(a / b));

export function traitDiffs(pa: Patch, pb: Patch): string[] {
  const A = layersOf(pa).map(layerFeat).sort((x, y) => x.onset - y.onset);
  const B = layersOf(pb).map(layerFeat).sort((x, y) => x.onset - y.onset);
  const T = new Set<string>();
  if (A.length !== B.length) T.add("structure");
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const a = A[i];
    const b = B[i];
    if (Math.abs((a.onset - A[0].onset) - (b.onset - B[0].onset)) > 0.015) T.add("timing");
    if (a.curve !== b.curve) T.add("curve");
    if (Math.abs(a.sus - b.sus) > 0.05) T.add("sustain");
    if (a.hasFilter && b.hasFilter && a.filtType !== b.filtType) T.add("filter");
    if (a.noise !== b.noise || (a.noise && a.color !== b.color)) {
      T.add("timbre");
      continue;
    }
    if (a.noise) continue;
    if (semis(a.f, b.f) > 0.6) T.add("pitch");
    // sweep = the pitch GLIDE from start to end. Compare the glide amount, not the
    // absolute end pitch, so two static sounds at different pitches read as "pitch"
    // only, never a spurious "sweep" (they have no glide).
    if (Math.abs(Math.log2(a.fEnd / a.f) - Math.log2(b.fEnd / b.f)) > 0.05) T.add("sweep");
    if (Math.abs(Math.log2(a.dur / b.dur)) > 0.12) T.add("length");
    if (Math.abs(Math.log2(Math.max(a.att, 0.001) / Math.max(b.att, 0.001))) > 1) T.add("attack");
    if (a.hasFm !== b.hasFm || Math.abs(a.fmIndex - b.fmIndex) > 0.03) T.add("fm");
    if (a.hasFilter && b.hasFilter && semis(a.filt, b.filt) > 1) T.add("filter");
  }
  return [...T];
}

// The one perceptual distance: pitch in semitones/log2, duration in log-ratio, gain
// excluded, layers compared in onset order. Ranks a freshly generated patch against the
// existing library (neighbor-match) and drives the live Dedupe scan.
export const FAMILY_THRESHOLD = 0.45;

const DW = {
  pitch: 0.9,
  // A sweep's end pitch lands in the decayed tail, so the ear hears it faintly; weighting
  // it like the onset pitch made #436 vs #444 (same 600Hz drop, different floor) read 63%
  // when the ear heard near-twins.
  pitchEnd: 0.35,
  dur: 1.2,
  fmIndex: 6,
  fmRatio: 0.3,
  typeMismatch: 4,
  fmMismatch: 0.9,
  filt: 0.4,
  // Blind spots found in self-audit: these params were never compared.
  noiseColor: 2, // white vs pink vs brown are different textures
  filtType: 1.2, // lowpass vs highpass at the same cutoff are opposite spectra
  sustain: 0.8, // a held tone vs a pure decay
  // ramp vs smooth envelope is an audible character difference the numbers hide
  // (#901 vs #435, caught by ear; reach already disqualifies on it).
  curveMismatch: 0.25,
  // Relative layer-onset timing (rhythm). Was entirely unmeasured: #834 vs #840, same
  // recipe with the echo tap at 90ms vs 37ms, scored 98%.
  onset: 1.2,
};

// Deadzone-then-steep shaping (second calibration round: "squeeze the
// parameters"): differences the ear shrugs off are FREE, differences past the knee cost
// steeply. Pitch within ~1.2 semis is the same blip (#908 vs #910); duration within
// ~1.7x ratio is the same length (52 vs 65ms inaudible on #5/#68, while #2 vs #14's
// 2.6x ring reads as a different sound).
const PITCH_JND = 0.1; // octaves
const DUR_RATIO_JND = 0.9; // log2 units (#964 vs #952: 27ms vs 52ms blips read identical)
const FM_INDEX_JND = 0.05;
const dz = (v: number, jnd: number) => Math.max(0, Math.abs(v) - jnd);

interface DistFeat {
  isNoise: boolean;
  type: string;
  pitch: number;
  pitchEnd: number;
  logDur: number;
  logAttack: number;
  fmIndex: number;
  fmRatio: number;
  hasFm: boolean;
  filtLog: number;
  filtPeakLog: number;
  hasFilter: boolean;
  filtType: string;
  noiseColor: string;
  sustain: number;
  att: number;
  onset: number;
  curve: string;
}

function distFeat(layer: Layer): DistFeat {
  const s = layer.source;
  const isNoise = s.type === "noise";
  const freq = !isNoise && "frequency" in s ? s.frequency : undefined;
  const sweep = typeof freq === "object";
  const f = sweep ? freq.start : (freq ?? 1000);
  const fEnd = sweep ? freq.end : f;
  const e = layer.envelope;
  const a = e?.attack ?? 0;
  const dur = Math.max(0.001, a + (e?.decay ?? 0) + (e?.release ?? 0));
  const fm = !isNoise && "fm" in s ? s.fm : undefined;
  const filter = Array.isArray(layer.filter) ? layer.filter[0] : layer.filter;
  return {
    isNoise,
    type: s.type,
    pitch: isNoise ? 0 : Math.log2(f),
    pitchEnd: isNoise ? 0 : Math.log2(fEnd),
    logDur: Math.log2(dur),
    // +8ms perceptual floor: 3ms vs 5ms attack is one inaudible click (#921/#964 lost
    // 15 points to it), while 0 vs 20ms stays a real soft-vs-instant difference.
    logAttack: Math.log2(a + 0.008),
    fmIndex: fm ? fm.depth / f : 0,
    fmRatio: fm ? fm.ratio : 0,
    hasFm: !!fm,
    filtLog: filter ? Math.log2(filter.frequency ?? 1000) : 0,
    filtPeakLog: filter?.envelope?.peak ? Math.log2(filter.envelope.peak) : 0,
    hasFilter: !!filter,
    filtType: filter?.type ?? "",
    noiseColor: isNoise ? ((s as { color?: string }).color ?? "white") : "",
    sustain: e?.sustain ?? 0,
    att: a,
    onset: layer.delay ?? 0,
    curve: e?.curve ?? "smooth",
  };
}

// Split scoring: CORE traits (pitch, glide, duration, waveform/noise identity, filter
// presence) are audible at ANY sound length; NUANCE traits (attack shape, FM detail,
// filter cutoff) need time to resolve and get the short-sound compression below. The
// old single-bucket metric compressed everything, which made completely different taps
// read 80%+ similar (audited against by-ear examples).
const FILTER_PRESENCE = 0.55;

function layerDist(x: DistFeat, y: DistFeat): { core: number; nuance: number; sub: number } {
  if (x.isNoise !== y.isNoise) return { core: 10, nuance: 0, sub: 1 };
  let core = 0;
  let nuance = 0;
  // sub = magnitude of the differences the deadzones forgive. 100% is reserved for
  // parameter-identical (gain aside): any sub-audible gap keeps the pair at <=95%.
  const sub =
    Math.abs(x.pitch - y.pitch) +
    Math.abs(x.pitchEnd - y.pitchEnd) +
    Math.abs(x.logDur - y.logDur) +
    Math.abs(x.att - y.att) * 20 +
    Math.abs(x.fmIndex - y.fmIndex) * 4 +
    Math.abs(x.sustain - y.sustain);
  core += (DW.pitch * dz(x.pitch - y.pitch, PITCH_JND)) ** 2;
  core += (DW.dur * dz(x.logDur - y.logDur, DUR_RATIO_JND)) ** 2;
  // Rhythm: onset gap RELATIVE to the layer's own length (onsets pre-aligned to each
  // patch's first layer): 21ms of drift on a 150ms echo note is nothing (#665/#686),
  // the same echo displaced by 3x its 19ms envelope is a different rhythm (#834/#840).
  const og = Math.abs(x.onset - y.onset);
  const rel = og / Math.max(2 ** ((x.logDur + y.logDur) / 2), 0.03);
  core += (DW.onset * (rel / (rel + 0.3)) ** 2) ** 2;
  if (x.type !== y.type && !x.isNoise) core += DW.typeMismatch ** 2;
  if (x.isNoise && x.noiseColor !== y.noiseColor) core += DW.noiseColor ** 2;
  if (x.curve !== y.curve) core += DW.curveMismatch ** 2;
  core += (DW.sustain * dz(x.sustain - y.sustain, 0.05)) ** 2;
  if (x.hasFilter !== y.hasFilter) core += FILTER_PRESENCE ** 2;
  if (x.hasFilter && y.hasFilter && x.filtType !== y.filtType) core += DW.filtType ** 2;
  // Glide amount split by size: a small difference is NUANCE (a 0.3-octave flick over
  // 27ms is invisible, #921 vs #952), but beyond ~half an octave it is a GESTURE - a
  // 1.3-octave rise vs a static blip is a different sound at any length (#45 vs #913).
  const gd = Math.abs((x.pitchEnd - x.pitch) - (y.pitchEnd - y.pitch));
  core += (0.5 * dz(gd, 0.5)) ** 2;
  nuance += (DW.pitchEnd * dz(Math.min(gd, 0.5), PITCH_JND)) ** 2;
  // Attack in ABSOLUTE ms with an 8ms deadzone: 0 vs 5ms is one indistinguishable
  // click onset (it cost core/send vs playful/slide 40+ points as a log-ratio), while
  // 0 vs 40ms is still a genuine instant-vs-swell difference.
  nuance += (8 * dz(x.att - y.att, 0.008)) ** 2;
  nuance += (DW.fmIndex * dz(x.fmIndex - y.fmIndex, FM_INDEX_JND)) ** 2;
  if (x.hasFm && y.hasFm) nuance += (DW.fmRatio * (x.fmRatio - y.fmRatio)) ** 2;
  // FM presence mismatch scaled by how audible the present side's FM actually is: a
  // barely-there index (#2 vs #97, index 0.077) is faint sideband color, not a timbre.
  if (x.hasFm !== y.hasFm) nuance += (DW.fmMismatch * Math.min(1, Math.max(x.fmIndex, y.fmIndex) / 0.25)) ** 2;
  if (x.hasFilter && y.hasFilter) {
    nuance += (DW.filt * (x.filtLog - y.filtLog)) ** 2;
    nuance += (DW.filt * (x.filtPeakLog - y.filtPeakLog)) ** 2;
  }
  return { core: Math.sqrt(core), nuance: Math.sqrt(nuance), sub };
}

// Echo/reverb: wetness plus TAIL LENGTH in seconds. Wetness alone let a dry chime match
// its long-echoing sibling at 82% (#473 vs #595): the ear hears a
// rolling tail as a different sound no matter how subtle the wet level is.
function fxFeat(p: Patch): { echoWet: number; revMix: number; tail: number } {
  let echoWet = 0;
  let revMix = 0;
  let tail = 0;
  for (const l of layersOf(p)) {
    for (const fx of l.effects ?? []) {
      if (fx.type === "delay") {
        echoWet = Math.max(echoWet, fx.wet * Math.min(1, fx.feedback * 2));
        if (fx.feedback > 0 && fx.wet > 0.02) {
          const rings = fx.feedback >= 1 ? 1 : 1 + Math.ceil(Math.log(0.001) / Math.log(fx.feedback));
          tail = Math.max(tail, fx.delay * rings);
        }
      }
      if (fx.type === "reverb") {
        revMix = Math.max(revMix, fx.mix ?? 0.5);
        if ((fx.mix ?? 0.3) > 0.05) tail = Math.max(tail, (fx.decay ?? 0.5) * (fx.roomSize ?? 1));
      }
    }
  }
  return { echoWet, revMix, tail };
}

function fxDist(pa: Patch, pb: Patch): number {
  const a = fxFeat(pa);
  const b = fxFeat(pb);
  return (
    0.9 * Math.abs(a.echoWet - b.echoWet) +
    0.6 * Math.abs(a.revMix - b.revMix) +
    0.55 * Math.abs(Math.sqrt(a.tail) - Math.sqrt(b.tail))
  );
}

function patchDistanceParts(pa: Patch, pb: Patch): { core: number; nuance: number; sub: number } {
  // Onsets re-based to each patch's first layer: only RELATIVE rhythm is audible
  // (a whole-sound start offset is playback alignment, not identity).
  const feats = (p: Patch) => {
    const fs = layersOf(p)
      .map((l) => ({ f: distFeat(l), onset: l.delay ?? 0 }))
      .sort((x, y) => x.onset - y.onset)
      .map((x) => x.f);
    const first = fs[0]?.onset ?? 0;
    return fs.map((f) => ({ ...f, onset: f.onset - first }));
  };
  const A = feats(pa);
  const B = feats(pb);
  const n = Math.max(A.length, B.length);
  let core = 0;
  let nuance = 0;
  let sub = 0;
  for (let i = 0; i < n; i++) {
    if (A[i] && B[i]) {
      const d = layerDist(A[i], B[i]);
      core += d.core;
      nuance += d.nuance;
      sub += d.sub;
    } else {
      core += 2;
      sub += 1;
    }
  }
  const div = Math.max(1, n);
  return { core: core / div, nuance: nuance / div, sub: sub / div };
}

export function patchDistance(pa: Patch, pb: Patch): number {
  const { core, nuance } = patchDistanceParts(pa, pb);
  return core + nuance;
}

// The ear needs TIME to resolve differences: a 12-semitone shift on a 40ms click is
// barely audible, on a 400ms chime it is a different sound. Scale raw distance down for
// short sounds so "identical to the ear" maps to a small number regardless of duration.
// (Calibrated from batch review: a raw d=0.41 pair of ~50ms clicks was
// by-ear indistinguishable.)
const FULL_RESOLUTION_DUR = 0.15;
const MIN_DUR_FACTOR = 0.25;

function patchDur(p: Patch): number {
  return Math.max(
    ...layersOf(p).map(
      (l) => (l.delay ?? 0) + (l.envelope ? (l.envelope.attack ?? 0) + l.envelope.decay + (l.envelope.release ?? 0) : 0.5),
    ),
  );
}

// Compression applies to NUANCE only: a 40ms click genuinely hides attack/FM/filter
// detail, but its pitch and length are heard instantly, so core stays uncompressed.
// Sub-audible residual: differences the deadzones forgave still keep a pair off 100%
// (100% is reserved for parameter-identical, gain aside). Saturates at
// SUB_CAP (~95%) and fades out as real distance grows so it never reshuffles rankings.
const SUB_CAP = 0.035;

export function perceptualDistance(pa: Patch, pb: Patch): number {
  const f = Math.min(1, Math.max(MIN_DUR_FACTOR, Math.sqrt(patchDur(pa) * patchDur(pb)) / FULL_RESOLUTION_DUR));
  const { core, nuance, sub } = patchDistanceParts(pa, pb);
  const d = core + nuance * f + fxDist(pa, pb);
  return d + Math.min(1, sub / 0.02) * SUB_CAP * Math.exp(-8 * d);
}

// Would ONE draw of the frozen Launchpad variation engine (mutatePatch in randomize.ts)
// plausibly turn pa into pb? Tolerances mirror its actual math: one SHARED pitch ratio
// up to ±3 semis across layers, decay/release ±20%, filter cutoff ±15%, reverb mix ±20%;
// attack, waveform types, layer structure, glide shape, FM/filter presence and echo are
// NEVER touched, so any real difference there breaks reach. Two library seeds inside
// each other's reach = overlapping variation clouds = redundant to keep both.
export function withinVariationReach(pa: Patch, pb: Patch): boolean {
  const feats = (p: Patch) =>
    layersOf(p)
      .map((l) => ({ f: distFeat(l), curve: l.envelope?.curve ?? "smooth", onset: l.delay ?? 0 }))
      .sort((x, y) => x.onset - y.onset);
  const A = feats(pa);
  const B = feats(pb);
  if (A.length !== B.length) return false;
  // Envelope curve (ramp vs smooth) is a timbre identity the engine never mutates; a
  // mismatch disqualifies reach outright (#901 ramp vs #435 smooth
  // was falsely badged - the ear heard the difference the parameters hid).
  for (let i = 0; i < A.length; i++) {
    if (A[i].curve !== B[i].curve) return false;
  }
  let minShift = Infinity;
  let maxShift = -Infinity;
  for (let i = 0; i < A.length; i++) {
    const a = A[i].f;
    const b = B[i].f;
    if (a.isNoise !== b.isNoise || a.type !== b.type) return false;
    if (a.hasFm !== b.hasFm || a.hasFilter !== b.hasFilter) return false;
    if (!a.isNoise) {
      const shift = (b.pitch - a.pitch) * 12;
      if (Math.abs(shift) > 3.3) return false;
      minShift = Math.min(minShift, shift);
      maxShift = Math.max(maxShift, shift);
      if (Math.abs((a.pitchEnd - a.pitch) - (b.pitchEnd - b.pitch)) > 0.25) return false;
    }
    if (Math.abs(a.logDur - b.logDur) > 0.4) return false;
    if (Math.abs(a.logAttack - b.logAttack) > 0.2) return false;
    if (a.hasFilter && b.hasFilter && Math.abs(a.filtLog - b.filtLog) > 0.3) return false;
  }
  if (A.length > 1 && maxShift - minShift > 1) return false;
  const fa = fxFeat(pa);
  const fb = fxFeat(pb);
  if (Math.abs(fa.echoWet - fb.echoWet) > 0.05) return false;
  if (Math.abs(fa.revMix - fb.revMix) > 0.08) return false;
  return true;
}

export type NeighborKind = "identical" | "dupe" | "variation";

// Only near-parameter-identical earns the dupe tier (the curator: "my ear should be
// the likely dupe" judge - the label had cried wolf on every one-trait diff before).
// 0.072 ~ 89%: with the sub-audible residual keeping non-identical pairs at <=95%, the
// ear-identical band spans ~89-95 (#520/#525 sits at 89).
export const DUPE_DISTANCE = 0.072;

// distance -> similarity %. Calibrated so DUPE_DISTANCE reads ~91%, FAMILY_THRESHOLD
// reads ~49%: below 50 = a different sound, 90+ = dupe territory.
export function matchPercent(distance: number): number {
  return Math.round(Math.exp(-1.6 * distance) * 100);
}

// Tier decided on the ROUNDED percent the user sees, so two rows both showing 91%
// can never disagree on the badge (raw-distance thresholding did exactly that).
export function classifyTraits(traits: string[], distance: number): { kind: NeighborKind; label: string } {
  const isDupe = matchPercent(distance) >= matchPercent(DUPE_DISTANCE);
  if (traits.length === 0 && isDupe) {
    return { kind: "identical", label: "identical (gain only)" };
  }
  if (isDupe) {
    return { kind: "dupe", label: traits.length > 0 ? traits.join(" + ") : "hairline" };
  }
  return { kind: "variation", label: traits.length > 0 ? traits.join(" + ") : "near match" };
}
