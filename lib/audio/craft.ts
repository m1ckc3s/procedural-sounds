import { CATEGORIES, type Category } from "./categories";
import { FIGURES, INTERVALS, SPACES, type Figure, type NoteEvent, type Role, type SpaceName } from "./figures";
import { INSTRUMENTS, type Decay, type Family, type Instrument } from "./instruments";
import { enforceLimits } from "./limits";
import type { Layer, Patch } from "./patch";
import { perceptualDistance } from "./similarity";

// THE CASTER: instrument-first invention. Voice x Figure x Space, cast per category.
//
// The contract that makes this different from invent.ts: nothing is generated and then
// rescued. A draw picks a plausible object, a plausible gesture and a plausible room,
// then places the root so the whole thing already sits inside the category's register
// and length. Clamping is a backstop here, not the mechanism.
//
// Roles let one draw combine objects the way the hand-curated keepers did (a low body
// under two bright notes, a noise click in front of a tone), which single-voice
// grammars could never express.

export interface CraftResult {
  patch: Patch;
  instrument: string;
  bodyInstrument?: string;
  transientInstrument?: string;
  figure: string;
  space: SpaceName;
  label: string;
}

export interface Profile {
  // A lead instrument qualifies when its family is listed AND its decay is allowed,
  // minus anything named in `banned`. Stated this way so adding an instrument to the
  // bank automatically reaches every category it plausibly suits.
  leadFamilies: readonly Family[];
  leadDecays: readonly Decay[];
  banned?: readonly string[];
  bodies: readonly string[];
  transients: readonly string[];
  figures: readonly string[];
  intervals: readonly (keyof typeof INTERVALS)[];
  root: readonly [number, number];
  ceilingHz: number;
  maxSeconds: number;
  gainBudget: number;
  spaces: Readonly<Partial<Record<SpaceName, number>>>;
}

// Success is the measured one: an evening of directed curation established that the
// keepers are STRUCK OBJECTS, not sung tones, and that ringing metals, swells and pads
// were rejected every time they appeared. The others follow the same reasoning applied
// to their own job.
const PROFILES: Record<Category, Profile> = {
  success: {
    leadFamilies: ["wood", "tine", "metal", "string", "digital"],
    leadDecays: ["tight", "medium"],
    banned: ["gong-soft", "bell-tubular", "blip-square"],
    bodies: ["sub-thump", "knock", "kick-body"],
    transients: ["click-latch", "click-soft", "tick-dry"],
    figures: ["rise-two", "rise-three", "rise-four", "blur-three", "accel-rise", "run-five", "body-and-light", "transient-lead", "transient-single", "cluster"],
    intervals: ["major", "pentatonic", "fifths", "fourths"],
    root: [260, 620],
    ceilingHz: 1150,
    maxSeconds: 0.72,
    gainBudget: 0.55,
    spaces: { dry: 0.45, room: 0.12, trail: 0.33, wide: 0.1 },
  },
  error: {
    leadFamilies: ["wood", "body", "metal", "digital"],
    leadDecays: ["tight", "medium", "ring"],
    banned: ["claves", "glock", "music-box", "celesta", "anvil", "metal-ping", "glass-fm", "bell-tubular"],
    bodies: ["sub-thump", "knock", "tom", "kick-body"],
    transients: ["click-latch", "click-soft"],
    figures: ["fall-two", "fall-three", "wobble", "single", "body-alone", "transient-single", "double-alert"],
    intervals: ["narrow", "tritone", "minor"],
    root: [110, 330],
    ceilingHz: 700,
    maxSeconds: 0.75,
    gainBudget: 0.55,
    spaces: { dry: 0.72, room: 0.2, trail: 0.08 },
  },
  warning: {
    leadFamilies: ["metal", "wood", "tine", "digital"],
    leadDecays: ["tight", "medium"],
    banned: ["gong-soft", "music-box"],
    bodies: ["knock", "tom"],
    transients: ["click-latch", "tick-dry"],
    figures: ["double-alert", "triple-alert", "call-answer", "rise-two", "wobble", "single", "transient-lead"],
    intervals: ["minor", "narrow", "fifths", "major"],
    root: [330, 720],
    ceilingHz: 1250,
    maxSeconds: 0.8,
    gainBudget: 0.5,
    spaces: { dry: 0.6, room: 0.2, trail: 0.2 },
  },
  notification: {
    leadFamilies: ["tine", "metal", "string", "digital"],
    leadDecays: ["tight", "medium"],
    // A phone notification is short and spoken, not a recital: the ringing metals and
    // the multi-note runs both read as "too musical" to the ear that judged these.
    banned: ["bell-tubular", "gong-soft", "anvil", "blip-square", "pluck-steel", "music-box", "glass-fm", "bell-small"],
    bodies: ["sub-thump"],
    transients: ["click-soft", "tick-dry"],
    figures: ["rise-two", "call-answer", "single", "transient-single", "pair-quick", "double-alert"],
    intervals: ["major", "fifths", "fourths"],
    root: [320, 640],
    ceilingHz: 1050,
    maxSeconds: 0.7,
    gainBudget: 0.5,
    spaces: { dry: 0.25, room: 0.3, trail: 0.35, wide: 0.1 },
  },
  transition: {
    leadFamilies: ["air", "digital", "string", "sustained", "tine"],
    leadDecays: ["tight", "medium", "ring"],
    banned: ["blip-square", "organ"],
    bodies: ["sub-thump"],
    transients: ["shaker", "click-soft", "tick-dry"],
    figures: ["single", "rise-two", "fall-two", "run-five", "blur-three", "accel-rise", "transient-single"],
    intervals: ["fifths", "fourths", "pentatonic"],
    root: [240, 700],
    ceilingHz: 1200,
    maxSeconds: 0.85,
    gainBudget: 0.5,
    spaces: { dry: 0.35, room: 0.25, trail: 0.3, wide: 0.1 },
  },
  tap: {
    leadFamilies: ["wood", "digital", "transient", "air"],
    leadDecays: ["tight"],
    banned: ["blip-square"],
    bodies: ["knock"],
    transients: ["click-latch", "click-soft", "tick-dry", "shaker"],
    // Never a third beat: a tap is one event, or at most an elegant quick pair.
    figures: ["single", "single", "single", "transient-single", "pair-quick"],
    intervals: ["narrow", "fifths"],
    root: [220, 650],
    ceilingHz: 1300,
    maxSeconds: 0.26,
    gainBudget: 0.45,
    spaces: { dry: 0.85, room: 0.1, trail: 0.05 },
  },
  hover: {
    leadFamilies: ["air", "digital", "transient"],
    leadDecays: ["tight"],
    bodies: [],
    transients: ["click-soft", "tick-dry", "shaker"],
    figures: ["single", "transient-single"],
    intervals: ["narrow"],
    root: [300, 800],
    ceilingHz: 1400,
    maxSeconds: 0.16,
    gainBudget: 0.28,
    spaces: { dry: 0.9, room: 0.1 },
  },
};

// Hover is deliberately absent: judged useless here, and Launchpad plus Orbit already
// supply more good ones than anyone clicks through.
export const CRAFT_CATEGORIES = CATEGORIES.filter((c) => c !== "hover");

// A curator veto removes a component from a category outright. Deterministic and
// reviewable, unlike a probability nudge: the thing stops appearing and the reason is
// legible in one file.
export interface Vetoes {
  instruments?: string[];
  figures?: string[];
  spaces?: string[];
}
export type VetoStore = Partial<Record<Category, Vetoes>>;

const r = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)];
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const semi = (f: number, s: number) => f * Math.pow(2, s / 12);

const byName = (n: string) => INSTRUMENTS.find((i) => i.name === n);
const FIGURE_OF = (n: string): Figure => FIGURES.find((f) => f.name === n) ?? FIGURES[0];

export function leadsFor(cat: Category, vetoes: VetoStore = {}): Instrument[] {
  const p = PROFILES[cat];
  const out = vetoes[cat]?.instruments ?? [];
  return INSTRUMENTS.filter(
    (i) =>
      !i.unpitched &&
      p.leadFamilies.includes(i.family) &&
      p.leadDecays.includes(i.decay) &&
      !(p.banned ?? []).includes(i.name) &&
      !out.includes(i.name),
  );
}

export function figuresFor(cat: Category, vetoes: VetoStore = {}): Figure[] {
  const names = PROFILES[cat].figures;
  const out = vetoes[cat]?.figures ?? [];
  return FIGURES.filter((f) => names.includes(f.name) && !out.includes(f.name));
}

export function spacesFor(cat: Category, vetoes: VetoStore = {}): SpaceName[] {
  const out = vetoes[cat]?.spaces ?? [];
  const names = (Object.keys(PROFILES[cat].spaces) as SpaceName[]).filter((n) => !out.includes(n));
  return names.length ? names : ["dry"];
}

// The count of distinct structural RECIPES a category can draw. Not a catalogue size:
// every recipe is re-randomised on each draw (root frequency, decays, gaps, strike
// energy are continuous), so the number of reachable sounds is unbounded and this is
// only the skeleton count.
export interface ProfileShape {
  leads: number;
  figures: number;
  spaces: number;
  intervals: number;
  combos: number;
}

export function profileShape(cat: Category, vetoes: VetoStore = {}): ProfileShape {
  const leads = leadsFor(cat, vetoes).length;
  const figures = figuresFor(cat, vetoes).length;
  const spaces = spacesFor(cat, vetoes).length;
  const intervals = PROFILES[cat].intervals.length;
  return { leads, figures, spaces, intervals, combos: leads * figures * spaces * intervals };
}

export function combinationCount(cat: Category, vetoes: VetoStore = {}): number {
  return profileShape(cat, vetoes).combos;
}

function chooseSpace(p: Profile, allowed: SpaceName[], rng: () => number): SpaceName {
  const entries = (Object.entries(p.spaces) as [SpaceName, number][]).filter(([n]) => allowed.includes(n));
  if (entries.length === 0) return "dry";
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [name, w] of entries) if ((roll -= w) <= 0) return name;
  return entries[entries.length - 1][0];
}

// Place the root so the highest note already lands under the ceiling and the lowest
// still sits inside the instrument's plausible range: the sound is born in range
// instead of being transposed down afterwards.
function chooseRoot(p: Profile, inst: Instrument, events: NoteEvent[], rng: () => number): number {
  const pitched = events.filter((e) => e.role === "lead");
  const top = pitched.length ? Math.max(...pitched.map((e) => e.semitone)) : 0;
  const bottom = pitched.length ? Math.min(...pitched.map((e) => e.semitone)) : 0;
  // The ceiling has to clear the instrument's highest PARTIAL, not just its highest
  // note: a bell placed by its fundamental puts its third partial an octave and a fifth
  // above wherever the melody ended.
  const ratio = inst.topRatio ?? 1;
  let lo = Math.max(p.root[0], inst.register[0] / Math.pow(2, bottom / 12));
  let hi = Math.min(
    p.root[1],
    inst.register[1] / Math.pow(2, top / 12),
    p.ceilingHz / (ratio * Math.pow(2, top / 12)),
  );
  if (hi < lo) lo = hi = Math.max(40, hi);
  return r(rng, lo, hi);
}

function fitLength(layers: Layer[], maxSeconds: number): void {
  const endOf = (l: Layer) =>
    (l.delay ?? 0) + (l.envelope ? (l.envelope.attack ?? 0) + l.envelope.decay + (l.envelope.release ?? 0) : 0.1);
  const end = Math.max(...layers.map(endOf));
  if (end <= maxSeconds) return;
  const s = maxSeconds / end;
  for (const l of layers) {
    if (l.delay) l.delay = round3(l.delay * s);
    if (l.envelope) {
      l.envelope.decay = round3(l.envelope.decay * s);
      if (l.envelope.release) l.envelope.release = round3(l.envelope.release * s);
    }
  }
}

function fitGain(layers: Layer[], budget: number): void {
  const sum = layers.reduce((a, l) => a + (l.gain ?? 0), 0);
  if (sum <= budget || sum === 0) return;
  const s = budget / sum;
  for (const l of layers) l.gain = round3(Math.max(0.015, (l.gain ?? 0) * s));
}

export function craft(cat: Category, rng: () => number = Math.random, vetoes: VetoStore = {}): CraftResult {
  return castFrom(PROFILES[cat], rng, vetoes[cat] ?? {});
}

// The caster proper, independent of the category table, so a bespoke profile (the
// Prospect bench) can use exactly the same machinery.
export function castFrom(p: Profile, rng: () => number = Math.random, out: Vetoes = {}): CraftResult {
  const leadOut = out.instruments ?? [];
  const leads = INSTRUMENTS.filter(
    (i) =>
      !i.unpitched &&
      p.leadFamilies.includes(i.family) &&
      p.leadDecays.includes(i.decay) &&
      !(p.banned ?? []).includes(i.name) &&
      !leadOut.includes(i.name),
  );
  const allowedFigures = new Set(
    FIGURES.filter((f) => p.figures.includes(f.name) && !(out.figures ?? []).includes(f.name)).map((f) => f.name),
  );
  // Picked from the profile's raw name list, not the deduped set, so a name listed
  // more than once genuinely draws more often (a tap is mostly a single beat).
  const figureNames = p.figures.filter((n) => allowedFigures.has(n));
  const lead = pick(leads, rng);
  let figure = FIGURE_OF(figureNames.length ? pick(figureNames, rng) : "single");
  const ivName = pick(p.intervals, rng);
  let events = figure.build(rng, INTERVALS[ivName]);

  // A figure that needs a role this category has no instrument for falls back to a
  // lead-only shape rather than silently dropping its notes.
  const needs = (role: Role) => events.some((e) => e.role === role);
  if ((needs("body") && p.bodies.length === 0) || (needs("transient") && p.transients.length === 0)) {
    figure = FIGURES.find((f) => f.name === "rise-two") ?? figure;
    events = figure.build(rng, INTERVALS[ivName]);
  }

  const bodyInst = needs("body") ? byName(pick(p.bodies, rng)) : undefined;
  const transInst = needs("transient") ? byName(pick(p.transients, rng)) : undefined;
  const root = chooseRoot(p, lead, events, rng);

  const layers: Layer[] = [];
  for (const e of events) {
    const inst = e.role === "body" ? bodyInst : e.role === "transient" ? transInst : lead;
    if (!inst) continue;
    const freq =
      e.role === "body"
        ? r(rng, inst.register[0], inst.register[1])
        : Math.min(semi(root, e.semitone), p.ceilingHz / (inst.topRatio ?? 1));
    const rendered = inst.render({ freq, energy: e.energy, hold: e.hold, rng });
    for (const l of rendered) {
      if (e.delay) l.delay = round3((l.delay ?? 0) + e.delay);
      layers.push(l);
    }
  }

  const allowedSpaces = (Object.keys(p.spaces) as SpaceName[]).filter((n) => !(out.spaces ?? []).includes(n));
  const space = chooseSpace(p, allowedSpaces.length ? allowedSpaces : (["dry"] as SpaceName[]), rng);
  // A category's ambience is budgeted against its own note length, so a short
  // category cannot be handed an echo that outlasts the sound several times over.
  const fx = SPACES[space].build(rng, Math.min(1, p.maxSeconds / 1.1));
  if (fx) for (const l of layers) l.effects = fx;

  fitLength(layers, p.maxSeconds);
  fitGain(layers, p.gainBudget);
  enforceLimits(layers);

  // A figure with no lead events (body-alone) never sounds the lead instrument, so
  // reporting it would name a voice the ear cannot hear.
  const usesLead = events.some((e) => e.role === "lead");
  const headline = usesLead ? lead.name : (bodyInst?.name ?? lead.name);
  const extras = [usesLead && bodyInst ? `+${bodyInst.name}` : "", transInst ? `+${transInst.name}` : ""].filter(Boolean);
  return {
    patch: layers.length === 1 ? layers[0] : { layers },
    instrument: headline,
    ...(usesLead && bodyInst ? { bodyInstrument: bodyInst.name } : {}),
    ...(transInst ? { transientInstrument: transInst.name } : {}),
    figure: figure.name,
    space,
    label: `${[headline, ...extras].join(" ")} · ${figure.name} · ${space}`,
  };
}

// Batch assembly. Two guards, both learned by ear rather than assumed:
//
// 1. An instrument cap. Two draws of the same object read as the same sound even when
//    the figure differs, because timbre dominates gesture at this length. Repeating a
//    voice inside one batch is what made batches feel like three sounds.
// 2. Perceptual distinctness at the same threshold the rest of the workbench uses.
//    Pitch and length differences inside the frozen variation pass's reach are not new
//    sounds, they are variations the library already generates for free.
const BATCH_DISTINCT = 0.15;

export function craftBatch(
  cat: Category,
  count: number,
  vetoes: VetoStore = {},
  rng: () => number = Math.random,
): CraftResult[] {
  const out: CraftResult[] = [];
  const perInstrument = Math.max(1, Math.ceil(count / 10));
  const used: Record<string, number> = {};
  const maxTries = count * 60;
  for (let tries = 0; tries < maxTries && out.length < count; tries++) {
    const res = craft(cat, rng, vetoes);
    const relaxed = tries > maxTries * 0.6; // rather ship a full batch than a short one
    if (!relaxed && (used[res.instrument] ?? 0) >= perInstrument) continue;
    if (!relaxed && out.some((o) => perceptualDistance(res.patch, o.patch) <= BATCH_DISTINCT)) continue;
    used[res.instrument] = (used[res.instrument] ?? 0) + 1;
    out.push(res);
  }
  return out;
}
