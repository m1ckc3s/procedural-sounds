import stored from "@/data/pool/limits.json";
import { layersOf, type Filter, type Frequency, type Layer, type Patch } from "./patch";

// The curator's calibrated ear-safety ceilings (workbench Calibrate tab -> data/pool/limits.json).
// Enforced at generation time in createFrom, compose/hybridize and finishWild. The frozen
// variation pass runs its own frequency-only rail instead (capUpwardDrift in randomize.ts),
// because the full clamp would rewrite its character; the curated library is untouched and
// is the separate audit pass. Defaults = pre-calibration behavior, so an empty limits.json
// changes nothing.
export interface Limits {
  sineCeilingHz: number;
  harshCeilingHz: number;
  sawOpenLowpassHz: number;
  maxFilterQ: number;
  noiseBandCeilingHz: number;
  maxFmDepth: number;
  harshFloorHz: number;
  absoluteCeilingHz: number;
}

// Library FM measured at depth 30-400, ratio 0.5-3.5 - default 800 changes nothing.
// absoluteCeilingHz defaults ABOVE the audible top so an empty limits.json is still a no-op,
// same as every other default here.
export const DEFAULT_LIMITS: Limits = {
  sineCeilingHz: 5200,
  harshCeilingHz: 2400,
  sawOpenLowpassHz: 6000,
  maxFilterQ: 16,
  noiseBandCeilingHz: 6000,
  maxFmDepth: 800,
  harshFloorHz: 0,
  absoluteCeilingHz: 20000,
};

export const LIMITS: Limits = { ...DEFAULT_LIMITS, ...(stored as Partial<Limits>) };

const HARSH = new Set(["sawtooth", "square"]);
const clampF = (f: number, hi: number) => Math.round(Math.min(f, hi) * 1000) / 1000;

// PROMINENCE GATE: harshness is contextual, not per-parameter.
// The ladders calibrate NAKED probes (loud, long, alone), but a 3500Hz partial at low gain
// with a fast decay reads as sparkle, not pain - validated against the library: ungated
// limits flagged 49 kept-and-loved sounds, gated flags 7, while #792 and the bare probes
// stay caught. So ceilings only apply to layers loud AND long enough to read like the
// probe did; quiet/brief partials keep their sparkle license. Harsh timbres carry more
// energy per unit gain, hence the lower gain bar. The buzz floor stays ungated below via
// `prominent || harsh`: low-saw buzz offends at any gain.
function prominent(l: Layer, harsh: boolean): boolean {
  const g = l.gain ?? 0.5;
  const e = l.envelope;
  const dur = e ? (e.attack ?? 0) + e.decay + (e.release ?? 0) : 0.5;
  return g >= (harsh ? 0.06 : 0.12) && dur >= 0.12;
}

export function enforceLimits(layers: Layer[], limits: Limits = LIMITS): void {
  for (const l of layers) {
    const filters: Filter[] = l.filter ? (Array.isArray(l.filter) ? l.filter : [l.filter]) : [];
    const harsh = l.source.type !== "noise" && HARSH.has(l.source.type);

    // Buzz floor first, ungated: low raw saw/square buzz offends at any gain (#792).
    if (harsh) {
      const freq = l.source.type === "noise" ? 0 : l.source.frequency;
      const top = typeof freq === "number" ? freq : Math.max(freq.start, freq.end);
      if (top < limits.harshFloorHz) {
        l.source.type = "triangle";
        continue;
      }
    }

    // ABSOLUTE CEILING, and the ONLY rule the prominence gate cannot open. It sits above the
    // `continue` on purpose: everything below is sparkle license, granted on the assumption
    // that a quiet or brief partial is harmless. That assumption has a hole, because
    // `prominent` reads the layer's WRITTEN gain while `loudnessVolume` rescales the whole
    // patch at play time (median 1.05x, p90 2.96x), so a partial the gate calls quiet can be
    // boosted back up to audible. This line is the backstop for that: no matter how quiet or
    // brief a layer claims to be, no tonal layer is allowed past it.
    if (l.source.type !== "noise") {
      const f = l.source.frequency;
      l.source.frequency =
        typeof f === "number"
          ? clampF(f, limits.absoluteCeilingHz)
          : {
              ...f,
              start: clampF(f.start, limits.absoluteCeilingHz),
              end: clampF(f.end, limits.absoluteCeilingHz),
            };
    }

    if (!prominent(l, harsh || l.source.type === "noise")) continue;

    for (const f of filters) {
      if (f.Q !== undefined) f.Q = Math.min(f.Q, limits.maxFilterQ);
      if (f.resonance !== undefined) f.resonance = Math.min(f.resonance, limits.maxFilterQ);
    }

    if (l.source.type === "noise") {
      for (const f of filters) {
        if (f.type === "bandpass" || f.type === "highpass") {
          f.frequency = clampF(f.frequency, limits.noiseBandCeilingHz);
        }
      }
      continue;
    }

    if (l.source.fm) l.source.fm.depth = Math.min(l.source.fm.depth, limits.maxFmDepth);

    const ceiling = harsh ? limits.harshCeilingHz : limits.sineCeilingHz;
    const freq = l.source.frequency;
    l.source.frequency =
      typeof freq === "number"
        ? clampF(freq, ceiling)
        : { ...freq, start: clampF(freq.start, ceiling), end: clampF(freq.end, ceiling) };

    if (harsh) {
      const g = l.source.frequency;
      const top = typeof g === "number" ? g : Math.max(g.start, g.end);
      const lowpasses = filters.filter((f) => f.type === "lowpass");
      if (lowpasses.length === 0 && top > 700) {
        const lp: Filter = {
          type: "lowpass",
          frequency: Math.round(Math.min(limits.sawOpenLowpassHz, Math.max(top * 2.5, 1200))),
        };
        l.filter = filters.length > 0 ? [...filters, lp] : lp;
      } else {
        for (const f of lowpasses) f.frequency = clampF(f.frequency, limits.sawOpenLowpassHz);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Library audit
//
// The audit and the fix are the SAME function: clone, run enforceLimits on the clone, and
// diff. If they differ the sound exceeds a ceiling AND the clamped clone is the proposed
// fix, so there is no second rulebook that can drift out of sync with what the generators
// actually enforce. Cheap enough (no audio rendering) to run live over the whole library.

const fTop = (f: Frequency): number =>
  typeof f === "number" ? f : Math.max(f.start, f.end);
const asList = (f: Layer["filter"]): Filter[] => (f ? (Array.isArray(f) ? f : [f]) : []);

// EXPOSED TAILS: the #708 shape, and the case both ceilings miss.
//
// A quiet high partial that plays UNDER a loud body is masked and genuinely reads as
// sparkle, which is what the prominence gate exists to protect. The same partial arriving
// AFTER the body has decayed is naked: nothing masks it, so the ear hears a chime hanging off
// the end. The gate cannot tell those two apart, because it only looks at gain and length,
// never at when the layer starts relative to everything else.
//
// #708 is the specimen: a 200Hz body decaying in 83ms, and a 2400Hz sine whose onset delay is
// exactly 0.083s, so it begins on the frame the body dies. Gain 0.064 puts it under the 0.12
// bar, so every ceiling is skipped, and it is well under any sane absolute backstop too.
//
// Listed rather than clamped on purpose: the fix is usually a judgement (drop the layer,
// retune it, shorten the tail), so this feeds a review queue instead of rewriting anything.
export interface ExposedTail {
  layer: number;
  hz: number;
  onset: number;
  gain: number;
  ceiling: number;
}

export function exposedTails(patch: Patch, limits: Limits = LIMITS): ExposedTail[] {
  const layers = layersOf(patch);
  if (layers.length < 2) return [];
  const out: ExposedTail[] = [];
  layers.forEach((l, i) => {
    if (l.source.type === "noise") return;
    const onset = l.delay ?? 0;
    if (onset <= 0) return;
    const harsh = HARSH.has(l.source.type);
    if (prominent(l, harsh)) return;
    const ceiling = harsh ? limits.harshCeilingHz : limits.sineCeilingHz;
    const hz = fTop(l.source.frequency);
    if (hz <= ceiling) return;
    out.push({ layer: i + 1, hz: Math.round(hz), onset, gain: l.gain ?? 0.5, ceiling });
  });
  return out;
}

export interface LimitAudit {
  exceeds: boolean;
  fixed: Patch;
  reasons: string[];
}

export function auditLimits(patch: Patch, limits: Limits = LIMITS): LimitAudit {
  const fixed = structuredClone(patch);
  const after = layersOf(fixed);
  enforceLimits(after, limits);
  const before = layersOf(patch);
  const reasons: string[] = [];

  after.forEach((b, i) => {
    const a = before[i];
    if (!a) return;
    const at = a.source.type;
    const where = after.length > 1 ? `L${i + 1} ` : "";
    if (at !== b.source.type) {
      reasons.push(`${where}${at} below the ${limits.harshFloorHz}Hz buzz floor, becomes ${b.source.type}`);
      return;
    }
    if (a.source.type !== "noise" && b.source.type !== "noise") {
      const fa = fTop(a.source.frequency);
      const fb = fTop(b.source.frequency);
      if (Math.round(fa) !== Math.round(fb)) {
        reasons.push(`${where}pitch ${Math.round(fa)} to ${Math.round(fb)}Hz`);
      }
      const da = a.source.fm?.depth;
      const db = b.source.fm?.depth;
      if (da !== undefined && db !== undefined && da !== db) {
        reasons.push(`${where}FM depth ${da} to ${db}`);
      }
    }
    const fa = asList(a.filter);
    const fb = asList(b.filter);
    if (fb.length > fa.length) {
      reasons.push(`${where}lowpass added at ${fb[fb.length - 1].frequency}Hz`);
    }
    fa.forEach((f, j) => {
      const g = fb[j];
      if (!g) return;
      if (f.frequency !== g.frequency) reasons.push(`${where}filter ${f.frequency} to ${g.frequency}Hz`);
      if (f.Q !== undefined && g.Q !== undefined && f.Q !== g.Q) reasons.push(`${where}Q ${f.Q} to ${g.Q}`);
    });
  });

  return { exceeds: reasons.length > 0, fixed, reasons };
}
