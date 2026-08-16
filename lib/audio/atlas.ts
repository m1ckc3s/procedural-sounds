import type { CreateOp } from "./create";

// Display metadata for the engine atlas (/workbench/atlas). Names/allocations always
// come from the live code constants (PALETTES, ARCHETYPES via archetypeNames,
// GESTURE_SPECS, ULTRA_GESTURES, WARP_NAMES) - this file holds ONLY the human
// descriptions. A key missing here still renders (with a blank description), so new
// voices/ops never break the page.

// The Creator's structural moves (create.ts) - v2/Creations remixes a library seed with 1-3 of these.
export const OP_INFO: Record<CreateOp, string> = {
  "swap-waveform": "swap the tonal layers' waveform (hover only ever gets soft sine/triangle)",
  "transpose-wide": "shift the whole sound a musical interval up or down (4th/5th/octave)",
  "add-harmonic": "stack a quieter copy at a consonant interval, sometimes staggered",
  "add-noise-tick": "add a tiny filtered white-noise click at the onset",
  "add-echo-layer": "add a quiet delayed copy of the anchor layer (a discrete echo)",
  "add-shimmer": "add the tasteful feedback-delay tail",
  "curve-flip": "toggle envelopes between ramp and natural exponential ring-out",
  "filter-add": "put a lowpass on tonal layers near their own pitch",
  "filter-shift": "move existing filter frequencies up to an octave either way",
  sweepify: "turn static pitches into glides (up or down a 5th/octave)",
  "invert-direction": "mirror layer order in time and flip every glide's direction",
  "retime-layers": "re-space the layers onto a fresh rhythmic grid",
  "reshape-envelope": "stretch or squeeze attacks and decays (hover stays featherweight)",
};

// The Composer's per-category grammars (compose.ts ARCHETYPES) - Invent's de-novo slice.
export const ARCHETYPE_INFO: Record<string, string> = {
  // tap
  "clean-blip": "one short rounded tone, sometimes a tiny down-flick",
  thock: "low soft-bodied thump, felt more than heard",
  "double-tick": "two dry micro-ticks a breath apart",
  // hover
  "air-whisper": "filtered air puff, barely there",
  "micro-blip": "the smallest possible tone touch",
  // transition
  swoosh: "filtered-noise sweep, air moving past",
  glide: "one tone sliding between two pitches",
  stairs: "a few discrete pitch steps in sequence",
  // success
  arpeggio: "consonant chord rolled upward, sometimes accelerating",
  "single-ding": "one clear confirmation tone",
  "chord-stab": "a consonant chord struck at once",
  resolve: "tension note settling onto its resolution",
  "tick-then-ding": "dry tick answered by a ring",
  "thud-ping": "low thud then a bright ping above it",
  strum: "chord rolled so fast it reads as one hit",
  "cha-ching": "coin-drop register hit: bright tick then a ringing strike above",
  lift: "four-layer build: air swell into root, third, then a soft octave landing",
  coin: "game-coin collect: quick blip then a ringing note a fifth up, sparkle above",
  relay: "three voices in sequence: round opener, glassy middle, ringing landing with sparkle",
  mirror: "statistical echo of the kept success library: its note counts, intervals, registers and timing, resampled",
  "sparkle-rise": "accelerating pentatonic run upward with a quiet sparkle octave on top",
  "fall-settle": "drop that lands and comes to rest",
  bloom: "soft swell opening upward",
  // error
  "double-low": "two low buzzes, the classic denial",
  "single-thud": "one dead low knock",
  "dissonant-pair": "two tones a clash apart (minor 2nd / major 2nd / tritone)",
  fall: "downward slide, energy draining",
  "head-shake": "quick low wobble side to side",
  "triple-deny": "three rapid refusals",
  "dull-knock": "muted knock through a closed door",
  "descend-steps": "discrete steps walking downward",
  // warning
  "double-ping": "two matched attention pings",
  "minor-alarm": "minor-interval alert, urgent but small",
  "single-caution": "one held cautionary tone",
  "rising-ask": "upward inflection, a question mark",
  "tick-tock": "two alternating clock ticks (composer version; the deck has a gesture twin)",
  // notification
  "two-note": "two soft notes, the default gentle ding",
  bell: "struck bell with falling partials (composer version; the deck has a gesture twin)",
};

// The shared gesture deck (wild.ts ULTRA_GESTURES) - Wild speaks all of it on
// exotic contracts; Invent speaks per-category subsets (GESTURE_SPECS) on consonant ones.
export interface VoiceInfo {
  era: "v4 classic" | "v4.1 futurist" | "v5 broadening";
  shape: string;
  character: string;
}

export const GESTURE_INFO: Record<string, VoiceInfo> = {
  boop: { era: "v4 classic", shape: "single, optional down-flick + octave sparkle", character: "soft rounded blip" },
  pop: { era: "v4 classic", shape: "single, fast octave drop", character: "physical, sub-warm thock" },
  dew: { era: "v4 classic", shape: "up-flick into held tone, detuned ghost", character: "gentle, bright without height" },
  wood: { era: "v4 classic", shape: "single low triangle knock, lowpassed", character: "dead-short tuned woodblock" },
  bell: { era: "v4 classic", shape: "3-partial stack, gains falling with height", character: "glockenspiel strike" },
  glass: { era: "v4 classic", shape: "2-3 close partials, micro-staggered", character: "thin glassy ping" },
  "echo-note": { era: "v4 classic", shape: "one note whose feedback delay IS the gesture", character: "pitched echo trail" },
  "knock-knock": { era: "v4 classic", shape: "two tuned knocks, second lower + longer", character: "the workplace-notification double" },
  "ding-dong": { era: "v4 classic", shape: "two-note doorbell descend", character: "instantly familiar, endlessly spammable" },
  pair: { era: "v4 classic", shape: "two scale notes, rising or falling", character: "minimal interval statement" },
  grace: { era: "v4 classic", shape: "grace note into a held main", character: "ornamented single" },
  "thump-sparkle": { era: "v4 classic", shape: "sub thump + high sine spark", character: "weight then light" },
  "tri-rise": { era: "v4 classic", shape: "two quick steps into a held third", character: "the purchase-success shape" },
  roll: { era: "v4 classic", shape: "3-4 accelerating repeats, optional octave alternation", character: "drumroll flourish" },
  trill: { era: "v4 classic", shape: "5-6 fast alternating steps", character: "fluttering ornament" },
  "call-response": { era: "v4 classic", shape: "short call, answered after a beat", character: "question-answer phrase" },
  liquid: { era: "v4.1 futurist", shape: "FM down-glide that lands and holds", character: "droplet in glass" },
  crystal: { era: "v4.1 futurist", shape: "single FM strike, inharmonic ratio, long ring", character: "glassy-smooth bell" },
  formant: { era: "v4.1 futurist", shape: "tonal layer, bandpass OPENS via filter envelope", character: "vowel-ish bwoop" },
  glow: { era: "v4.1 futurist", shape: "un-ramped ring-out + low octave underneath", character: "soft orb" },
  air: { era: "v4.1 futurist", shape: "pink/brown breath puff + quiet fundamental", character: "laptop-key soft tap" },
  hollow: { era: "v4.1 futurist", shape: "triangle through high-Q bandpass at its own pitch", character: "resonant tube" },
  duotone: { era: "v4.1 futurist", shape: "sine + detuned triangle an octave apart", character: "brand-tone dyad" },
  "rise-bloom": { era: "v4.1 futurist", shape: "fifth-up glide, soft upper voice fades in", character: "unlock" },
  haptic: { era: "v4.1 futurist", shape: "noise tick + sub thump + high sheen", character: "premium solenoid click" },
  bounce: { era: "v5 broadening", shape: "4-5 hits, geometrically shrinking gap + gain", character: "ball-drop settle physics" },
  pluck: { era: "v5 broadening", shape: "saw/triangle through a closing lowpass envelope", character: "karplus-ish string" },
  whoosh: { era: "v5 broadening", shape: "pink breath, bandpass sweeps, optional inner glide", character: "filtered-air swish (kept short)" },
  cascade: { era: "v5 broadening", shape: "3-4 scale steps DOWN, last held", character: "waterfall run" },
  harp: { era: "v5 broadening", shape: "4-5 ascending notes at gliss spacing, last rings", character: "harp gliss" },
  pad: { era: "v5 broadening", shape: "root + fifth/fourth + detuned octave, slow attack", character: "chordal swell, the deck's only simultaneous chord" },
  zip: { era: "v5 broadening", shape: "octave-up glide + arrival blip", character: "fast rise-and-land" },
  "tick-tock": { era: "v5 broadening", shape: "two dry high woody ticks, second a step down", character: "wristwatch, not a door" },
  ripple: { era: "v5 broadening", shape: "strike + two quieter repeats each a scale step up", character: "spreading rings" },
  marimba: { era: "v5 broadening", shape: "low triangle bar + quiet 4x partial, lowpassed", character: "warm wooden bar" },
};

// Wild-only warp ops (wild.ts WARPS) applied to remixes/hybrids on the wild path.
export const WARP_INFO: Record<string, string> = {
  transpose: "shift everything up to an octave either way, non-musical amounts allowed",
  "time-stretch": "squeeze or stretch every envelope and onset",
  "wave-swap": "randomize one tonal layer's waveform",
  "fm-inject": "force FM onto a layer that never had it",
  shimmer: "slather the feedback-delay tail on everything",
  "sweep-flip": "reverse every glide's direction",
  "ghost-double": "add a quiet transposed ghost copy of a random layer",
  "filter-drama": "high-Q filter with a violent envelope sweep",
  "curve-flip": "toggle ramp vs natural ring-out everywhere",
  "layer-drop": "delete a random layer",
};

// The instrument bank (instruments.ts) - Craft and Prospect build every draw from one of
// these. Structural facts (family, register, decay, partials) come from the bank itself;
// this is only the character sketch.
export const INSTRUMENT_INFO: Record<string, string> = {
  "wood-bar": "a struck wooden bar, lowpassed and gone almost at once",
  "wood-block": "smaller and harder, with a noise click welded to the strike",
  marimba: "a tuned bar with a quiet partial four octaves up",
  "temple-block": "hollow woodblock, resonant band at its own pitch",
  claves: "the shortest wooden hit there is, bright and dry",
  "log-drum": "a big slit drum, detuned twin under the strike",
  kalimba: "thumb-piano tine: light FM edge through a resonant band",
  "tine-soft": "the same tine plucked gently, wider band, rounder",
  "music-box": "comb tooth, high FM index, metallic and tinkling",
  celesta: "struck bell-bar with a clean octave partial",
  "tongue-drum": "hand-pan sized tongue, detuned twin, breathy body",
  glock: "metal bar plus a third partial, bright and short",
  "bell-small": "three falling partials: the classic struck bell",
  "bell-tubular": "inharmonic tube partials (2.76x, 3.9x); clangs rather than rings",
  "metal-ping": "high-Q band at its own pitch, like a struck rod",
  "glass-fm": "high FM index, inharmonic, a long glassy ring",
  "gong-soft": "low and wide, two inharmonic partials, slow to leave",
  anvil: "noise crack over a tight resonant metal body",
  "pluck-nylon": "a string: soft attack through a filter envelope closing",
  "pluck-steel": "brighter string, sawtooth through a fast-closing filter",
  harp: "plain plucked string, lowpassed well above its pitch",
  koto: "plucked string with a nasal resonant band and slight FM",
  "sub-thump": "pure low body, everything above it filtered away",
  "kick-body": "a fast downward pitch drop into a low landing",
  knock: "brown-noise thud over a short low tone",
  tom: "membrane: a pitch bend down into a round body",
  "click-latch": "a filtered noise burst, the mechanical latch",
  "click-soft": "the same latch, quieter and warmer",
  "tick-dry": "the shortest noise tick, high and dry",
  shaker: "a brief band of noise, more air than pitch",
  "air-puff": "a soft filtered exhale with no pitch of its own",
  breath: "noise whose filter opens as it sounds",
  swish: "noise with a band sweeping across it",
  "blip-sine": "one clean short tone, nothing else",
  "blip-square": "raw square wave, unfiltered and retro",
  boop: "a rounded tone with a small downward flick",
  zap: "an octave-up glide arriving somewhere higher",
  "swoop-up": "one sine gliding up about a major seventh, the plain open",
  drop: "a pitch that falls fast and lands, the way a droplet does",
  "hollow-tube": "triangle through a high-Q band: a resonant tube",
  "pad-swell": "detuned voices that swell in rather than strike",
  organ: "stacked octave and fifth partials, held flat",
  bowed: "drawn rather than struck, slow in and slow out",
};

// The figure bank (figures.ts). A figure names no timbre: it decides how many notes,
// which intervals, how far apart, and how hard.
export const FIGURE_INFO: Record<string, string> = {
  single: "one note, left to ring",
  "rise-two": "two notes, up",
  "rise-three": "three notes climbing, the last one held",
  "rise-four": "four notes climbing, tighter spacing",
  "run-five": "five notes at gliss spacing, one sweeping flourish",
  "pair-quick": "two notes so close they read as one flick",
  "blur-three": "three notes at ~20 ms, a gesture rather than a melody",
  cluster: "all notes at once, a struck chord",
  "accel-rise": "four notes climbing with the gaps tightening",
  "body-and-light": "a low body note under one or two bright ones",
  "body-alone": "the body note by itself, a thud",
  "transient-lead": "a click, then two notes rising off it",
  "transient-single": "a click, then one note",
  "call-answer": "a note, a real pause, then its answer",
  "fall-two": "two notes, down",
  "fall-three": "three notes walking down",
  wobble: "the same note twice, the second fractionally flat",
  "double-alert": "the same note twice, evenly, insisting",
  "triple-alert": "the same note three times",
};

// The four spaces. Ambience is budgeted against the category's own length, so a short
// category cannot be handed a tail that outlasts its sound.
export const SPACE_INFO: Record<string, string> = {
  dry: "no ambience at all",
  room: "a short reverb, small and damped",
  trail: "a feedback echo: the repeats are part of the sound",
  wide: "the same echo, slower and further apart",
};

// Prospect's five sources (prospect.ts). Each contributes something none of the others
// can; all five then pass through one shared finishing pass.
export const PROSPECT_SOURCE_INFO: Record<string, { engine: string; why: string; share: string }> = {
  remix: {
    engine: "create.ts createFrom",
    why: "starts from a sound a human already approved, so it inherits a quality floor for free",
    share: "~30%",
  },
  craft: {
    engine: "craft.ts castFrom",
    why: "coherent physical objects: instrument x figure x space, the factoring that stopped output sounding mashed together",
    share: "~25%",
  },
  deck: {
    engine: "wild.ts ULTRA_GESTURES",
    why: "the shared character deck on a consonant, register-bounded contract: Invention's best path with its walls kept",
    share: "~18%",
  },
  breed: {
    engine: "compose.ts hybridize",
    why: "two library parents crossed, skeleton from one and timbre from the other: shapes no single grammar contains",
    share: "~15%",
  },
  wildcard: {
    engine: "wild.ts discovery",
    why: "the untrained path, and the only source that can genuinely surprise; kept small because raw it is noise",
    share: "~12%",
  },
};
