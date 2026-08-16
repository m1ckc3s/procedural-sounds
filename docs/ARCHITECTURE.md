# Architecture

What is built right now: the repo map plus the settled decisions that constrain future
work. How the generators and
the learning actually work is [HOW-IT-WORKS.md](HOW-IT-WORKS.md) and
[TRAINING.md](TRAINING.md); this doc says WHAT exists and WHERE.

Never state pack or sound counts here. The data and the workbench are the only truth.

## The shape of the thing (read first if you are picking this up cold)

How sounds are invented, and what the product actually ships, in order of importance:

1. **Invention is instrument-first now.** A draw is `instrument x figure x space`
   (`instruments.ts`, `figures.ts`, `craft.ts`) rather than randomised parameters that
   get clamped afterwards. This is the change that moved output from "mashed up" to
   something the curator called professional. Section below.
2. **Prospect is five engines behind one button** (`prospect.ts`): remix, craft, deck,
   breed, wildcard, plus one shared finishing pass and two anti-repetition guards.
3. **The product ships two stops, not four.** Familiar (`core`) and Exotic (`orbit`),
   plus an experimental button backed by Prospect. Galaxy and Singularity are not in the
   product; they remain as workbench engines that fill the library.
4. **Every category carries a `freqCap`**, applied after hybridizing, so no draw sits
   above its register ceiling.
5. **There is no post-hoc "polish" pass.** Do not build one; the section below records
   why it cannot work.

**The honest state of the thing.** The instrument-first engine is liked; the older Invent
and Wild engines are internal and feed the library only. Keep rate is not yet at the
curator's 8-of-10 ship bar, and growing the effective library is the first item in
TODO.md.

## Stack

Next.js (App Router), React, TypeScript, Tailwind v4, zustand. Vercel is planned, not
currently deployed. No audio-library dependency: the synth is this repo's own vanilla
Web Audio code. UI primitives come from `@base-ui/react`; `motion` (imported as
`motion/react`) is the one component-side npm dependency. Component and font rules live
in CLAUDE.md.

## Repo map

### `lib/audio/` (synth core and generators)

- `patch.ts` - the `Patch` type, the canonical sound recipe and the JSON export shape. Shape-compatible with `data/reference/reference-sounds.json`, so reference data ingests directly. A patch is a flat single layer or `{ layers: Layer[] }`; a layer is `{ source, envelope, gain, delay?, filter?, effects? }`. Full whitelist of allowed fields in CLAUDE.md.
- `synth.ts` - the recipe player. `renderPatch` builds every layer's graph (source, filter, ADSR gain, effects, destination) on any `BaseAudioContext`, so live play and offline render share one node builder; `playPatch` runs it on the live context. Anti-click handling uses exponential ramps with a small positive floor (Web Audio rejects a ramp target of 0) and releases to near-zero before stop. Optional per-trigger jitter keeps repeats from being byte-identical. No layer cap: seeds play at their native layer count. Every node is disconnected when done: source, envelope and filters on `onended`, effect nodes once their tail has rung out. Nothing lives on the graph past its sound.
- `context.ts` - `AudioContext` singleton, lazy init, auto-resume on first user gesture (`ensureAudio()`), master gain bus.
- `effects.ts` - `createReverb` (synthetic exponential-decay impulse response into a native ConvolverNode; impulse responses are cached by shape, since the noise is random and one buffer serves live and offline contexts alike) and the shimmer delay/echo (`createShimmer`/`shimmerTail`, opt-in via `effects:[{type:"delay", ...}]`). Each returns its node list and tail length so the player can tear it down. That is the entire effect surface.
- `randomize.ts` - pool building (`buildPool`), the membership formula (`effectiveCategories`), the draw (`generate`), and the FROZEN variation pass (`mutatePatch`). Favorited seeds draw at `FAVORITE_WEIGHT`. `generate()` with no category draws from every pool including unslotted sounds; that path is workbench-only, the product always passes a category.
- `create.ts` - `createFrom`, the creator behind v2: structural remixes of a library seed, steered by op dice.
- `compose.ts` - `compose`/`hybridize`: de-novo per-category grammars and two-parent hybrids, steered by archetype dice.
- `invent.ts` - `invent`, the Invent draw. Workbench-only (the Invent tab, and one of Prospect's five sources). Dice keys `g:*` and `hybrid` live in `data/pool/invent-feedback.json`; the code key stays `nebula` in the feedback data.
- `wild.ts` - `wild`/`ultraWild`/`discovery`, the untrained discovery paths. Workbench-only (the Wild tab, plus Prospect's `deck` and `wildcard` sources). Also holds the shared gesture deck, the motif builder and the `finishWild` polish pass.
- `instruments.ts` - the instrument bank: 42 coherent single-note voices (struck wood, tines, metal, strings, bodies, transients, air, digital, sustained), each with a plausible register, a decay character and its highest sounding partial.
- `figures.ts` - the figure bank (20 gesture shapes) plus the four spaces (dry, room, trail, wide). A figure emits role-tagged note events and never names a timbre.
- `craft.ts` - the caster behind the Craft bench: picks instrument x figure x space per category and places the root so the draw is born inside the register and length budget. `castFrom` is the category-free caster underneath it, so a bespoke profile can reuse the same machinery.
- `prospect.ts` - the category-agnostic discovery draw behind the Prospect bench. FIVE engines behind one button (remix, craft, deck, breed, wildcard) plus one shared finishing pass and two anti-repetition guards; no dice, no learning. Section below.
- `taste.ts` - per-category feature buckets and the deleted-twin fingerprint ring.
- `gates.ts` - category gates. `MECHANICAL_CATEGORIES` (tap, hover, transition) are gate-cast; `SEMANTIC_GATED_CATEGORIES` (success, error, warning, notification) are gated semantically. Gates must never read `gain`.
- `limits.ts` - ear-safety clamps.
- `loudness.ts` - play-time leveling. Never rewrites a patch. Every workbench play is leveled including the FIRST: an unmeasured sound is measured offline before it plays, guarded by a sequence token so a stale measure cannot land on a later click.
- `offline.ts` - offline render plus peak/RMS measurement. `renderToBuffer` caches by `Patch` identity, so a draw's loudness measure and its stage waveform share one `OfflineAudioContext`.
- `similarity.ts` - the perceptual distance metric, `matchPercent`, `withinVariationReach`.
- `invert.ts` - the directional-pair transform used by the toggle/reverse case.
- `categories.ts` - `CATEGORIES`, `categoryId()`, per-category use-case hints, and the display-only name suggestions.
- `atlas.ts` - the vocabulary descriptions the atlas page renders.
- `lib/audio/export/` - the single door out of the app for a sound. `wav.ts` holds the mono 16-bit RIFF encoder and the trim/fade pass; `snippet.ts` holds `PLAYER_JS` (the one-time standalone player), `toSoundJs` (the per-sound recipe), `toSnippet` (both in one paste) and `parseSound` (the way back in for Import); `index.ts` holds `patchToWav`, `downloadSoundWav`, `soundToSnippet`, `soundToStandaloneSnippet` and `wavFilename`. Section below.

### `app/`

- `app/page.tsx` - the product. Details below.
- `app/workbench/` - the curation tool: one page (`page.tsx`) driven by `?tab=`, inside a sidebar shell (`layout.tsx` plus `components/workbench/nav.tsx`), plus four real routes: `atlas/`, `craft/`, `import/`, `prospect/`.
- `app/api/*` - file-backed persistence for `data/pool/*.json`, one route per file; `pool` also takes a PUT for in-place replace (slots, pool, deleted, duplicates, exclusions, favorites, origins, tosort, taste, numbers, limits, limit-approved, tail-approved, craft-vetoes, loudness, loudness-map, kept-dates, similar-dismissed, creations-feedback, invent-feedback, reference). These routes write to the local filesystem, so the workbench only functions under `npm run dev`.
- `app/globals.css` - theme tokens, including the sidebar tokens and the explicit `@utility` rules for `--shadow-100..400`.

### `components/`

- `components/product/` - `SoundStage`, `HistoryList`, `ExportButtons`, `UsageSteps`.
- `components/ui/` - vendored components copied in as editable source: `alert-dialog`, `badge`, `btn`, `button`, `card`, `input`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `switch`, `table`, `tabs`, `tooltip`.
- `components/workbench/nav.tsx` - the workbench sidebar.

### `lib/` (non-audio)

`store.ts` (product state), `curation.ts` (the build-time curation snapshot, below),
`version.ts` (`APP_VERSION`, rendered in the product's corner cluster),
`rungs.ts` (the two product tiers, keys `core` and `orbit`, labelled Familiar and Exotic),
`font-weight.ts`, `shape-context.tsx`, `icon-context.tsx`, `surface-context.tsx`,
`surface-classes.ts`, `springs.ts`, `utils.ts`.

**How the product gets its curation state.** `lib/curation.ts` statically imports every
`data/pool/*.json` the product reads (the eight bucket files, slots, deleted, duplicates,
exclusions, favorites, tosort, creations-feedback, taste, and the loudness config) and
exports them as one typed `CURATION` snapshot. `app/page.tsx` seeds its state from that
snapshot, so a production build carries the library exactly as it stood in `data/pool` at
that commit. The `/api/*` fetches in the product are a dev-only live refresh layered on
top, gated on the same `NODE_ENV` test `proxy.ts` uses to close those routes, so a keep in
the workbench is audible on localhost without a rebuild and production never issues the
requests. A route the product needs that is fetched but not in the snapshot ships as its
empty default in production and fails silently, which is the bug this replaced.

### `data/`

- `data/reference/reference-sounds.json` - the imported seed packs, keyed by an anonymous pack id (`core`, `seed-a-soft`, `seed-c`, and so on). These ship as seeds in the generation pool, slotted into categories and drawn directly by `generate(category)`. There is no separate "theirs vs ours" set. Which projects seeded them, and under what license, is in THIRD-PARTY-NOTICES.md and nowhere else.
- (the upstream design-rule skill and the captured reference playground now live in the local archive, not the repo) upstream design rules. Calibration reference only, never a runtime feature.
- `data/pool/` - curation state: `limit-approved.json`, `slots.json`, `deleted.json`, `duplicates.json`, `exclusions.json`, `favorites.json`, `origins.json`, `tosort.json`, `taste.json`, `numbers.json` (the permanent number registry), `limits.json`, `tail-approved.json`, `craft-vetoes.json`, `loudness.json`, `kept-dates.json`, `similar-dismissed.json`, `creations-feedback.json`, `invent-feedback.json`, and the per-category keep files.

## Product UI

The product lives at the ROOT route (`app/page.tsx`). The product IS the site.

Page order, top to bottom: the beta pill, hero copy, the `SoundStage` (exports live
INSIDE its card), the category TAB row, the two engine buttons, the recent-sounds list,
footer (which carries the workbench link, labelled as dev mode).

TWO STOPS, BOTH CURATED. Familiar (`core`) and Exotic (`orbit`). The generative
stops that used to sit to the right, Galaxy (`nebula`) and Singularity (`singularity`),
were REMOVED from the product: their hit rate never reached something a stranger would
enjoy, and shipping them undercut the promise the curated tiers keep. Both engines still
exist and still run in the workbench, where they feed the library these two stops draw
from. Their `key` values are deliberately not reused, so sounds stored earlier under
`rung: "nebula"` stay readable. With no category-free stop left, `offCategory` and the
curated/experimental zone split are gone: every stop is governed by the category tabs.

Every engine button carries its own caption, so what it does is readable before it is
pressed. Selection gets NO visual treatment: every button generates on click and its
caption already says what it does, so which one was pressed last is not worth a style.
`aria-pressed` carries the state for assistive tech without drawing anything.

- **Category tabs** - all seven categories, tap selected by default. Rendered with the vendored `Tabs` in an Inter-font island. One flat row, mutually exclusive: exactly one is selected, never two selectors, never a nested dropdown. There is no "any" or surprise-me option.
- **`SoundStage`** - the sample-in-context stage, display and replay only (generate lives in the engine buttons below it). Every generate fires a per-category animation on an interactive demo widget (tap button, hover card, transition photo whose send-away plays the `invertPatch` reverse, success toast with a ballistic confetti burst, error and warning faces, notification chat thread, and a travelling waveform, `orb`, which no longer activates now that every stop carries a category). Ownership is CATEGORY-GATED: a sound only animates and replays the stage of the category it was drawn in. Otherwise the idle astronaut shows, and clicking anywhere generates. Sub-stages stay mounted but hidden, because unmounting swallows the reveal generate's animation; each also advances its own fire baseline WHILE hidden, because CSS animations do not run on `display:none` and the missed fires would otherwise all play at once on a tab switch. Each fire renders its fx under its own key so rapid clicks stack instead of cancelling each other. The waveform's SVG viewBox is MEASURED IN CSS PIXELS (a ResizeObserver feeds both the viewBox and the rAF loop) rather than a fixed box stretched by `preserveAspectRatio="none"`: under that non-uniform scale both `vector-effect: non-scaling-stroke` and a CSS `blur()` are under-specified, and Chromium builds disagreed enough that the same line rendered hairline in one browser and heavy in another. With user units equal to CSS px there is no scale left to interpret. Do not reintroduce a stretched viewBox.
- **`ExportButtons`** - "Export WAV" downloads the sound the stage currently owns (two files for a transition); "Copy sound" puts the recipe on the clipboard. Both sit inside the stage card, and every recent-sounds row carries the same two actions as icons.
- **`UsageSteps`** - the three steps under Recent Sounds: paste the player once (with the copy button for it), copy any sound, attach it to a listener. This is where the player lives, deliberately away from the per-sound copy, because it is setup rather than a per-sound artefact.
- **`HistoryList`** - replays any entry at its stored leveled volume, and carries per-row copy and WAV download. A history replay only re-animates the stage when the entry's category matches the active context. NO length cap: the list scrolls in a fixed-height box and is bounded by the localStorage quota rather than by a number.

Stop-to-generator mapping in `makeSound()`: v1 calls `generate()`, v2 calls
`createFrom()`. v2 runs the same taste tournament the workbench queues use (four
candidates, deleted-twins skipped, winner sampled in proportion to tasteScore squared,
with anti-repeat and novelty pressure).

`app/library/page.tsx` DOES NOT EXIST and is deferred. If it is ever built it would be
curated presets per category.

### Settled product decisions

- **Generate-first.** The refinement loop is "generate again", not slider-tweaking.
- **The workbench is dev-only** and gets gated or stripped from the production build before any deploy.
- **NO library browsing at launch.** Generate-first is the brand and the curated library is the moat; a browsable catalog is a free-harvesting surface.
- **Stops are EXCLUSIVE, never cumulative.** One generator per pull, and a higher stop never serves a lower stop's output. A generator may USE library patches as raw material; serving a stored patch or a frozen variation of one outside v1 is the thing that is forbidden. Rationale in TRAINING.md.
- **Every shipped stop respects the selected category.** The category-free stops were removed rather than hidden.
- **NO auth in v1.** Free means generate and listen, unlimited. If a paywall ever arrives it gates EXPORT and is added inside the single export module, which is exactly why that hard rule exists.
- **Export is WAV, a standalone JS snippet, and a JSON recipe.** MP3 is rejected, which also closes the LGPL question. The snippet never imports this repo's lib. Every format funnels through the one export module.
- **The tweaker is DEFERRED** and may never ship. If it is ever built it must be generated-driven: render only the fields present in the current `Patch`, no fixed dashboard, no "off" toggles for absent features, no global stacking control. A single-number `frequency` shows one control and a `{start,end}` sweep shows two; multi-layer patches render labeled "Layer 1 / Layer 2" groups. Live re-play on change.
- **Launch gating.** Two stops ship. Anything further is governed by the ugly-proofing rule: the safe-by-construction rungs go first, and a higher rung follows only once its curation is trusted.
- **Multi-layer authoring UI is phase 2.** Playback and seed-mutation of multi-layer sounds ship now.

## Workbench

One page driven by `?tab=`, in a sidebar shell. The sidebar labels each Sounds tab with
the product stop it trains. Nav groups, in sidebar order: **Sounds** = Library, Variations,
Creations, Prospect, Craft, Invent, Wild. **Tools** = Atlas, Editor, Import, Dedupe,
Calibrate, Trash. The order in `components/workbench/nav.tsx` is the truth.

- **Library** (slug `review`) - the whole library, imports plus keeps. Live number search (digits prefix-match permanent numbers across every category; results are full rows including Trash context). An "ear safety" chip appears beside "to sort" whenever library sounds exceed a current ceiling: `auditLimits` clones a patch, runs `enforceLimits` on the clone and diffs, so the audit and the proposed fix come from the same function and cannot drift. Apply-fix writes the clamped recipe via `PUT /api/pool` (curated keeps only); "keep as is" records the ceilings it was approved UNDER in `limit-approved.json`, so tightening a ceiling re-surfaces it. The "to sort" inbox sits on its own row above the category chips, because it is the gate every keep passes through rather than one aisle among them. Every list (inbox, aisles, number search) is the SAME vendored `Table`: star toggle, number, categories, an `imported` chip on seed-data rows (generated is the default and unmarked; the two are KINDS, never sources), context play, then edit and delete icons. Neither the event name nor the pack is displayed anywhere: a sound is its number and its categories. A row click plays and selects into the inspector; the icon actions stopPropagation so a misclick on them can never read as an audition. An "exposed tails" chip lists sounds carrying a high layer that starts AFTER the body has decayed, which the prominence gate cannot see because it reads gain and length but never onset; nothing is auto-fixed there, and "keep" records the ceilings it was kept UNDER in `tail-approved.json`. Right-hand sticky inspector: selected sound, action row (mark-sorted, favorite, edit, delete, duplicate), a BINARY category checklist (in or out; vetoes remain as import-only plumbing but never render), the measured gate description, suggestion, preview.
- **Variations** - queue for the frozen variation pass.
- **Creations** (RL) - the v2 queue. Trains the op dice.
- **Craft** (`/workbench/craft`, its own route) - the instrument-first inventor. Per-category batches of 20, each row naming its instrument, any body or transient partner, its figure and its space. No dice and no learning layer: the design rules ARE the constraint, so a bad draw is a rule to change rather than a verdict to file. Keeps go down the ordinary path (unsorted bucket, zero categories, to-sort inbox, registry number).
- **Prospect** (`/workbench/prospect`, its own route) - the discovery bench. One button, one sound, no categories and no dials. Keyboard: space generates, k keeps, r replays. Keeps go down the ordinary path (unsorted bucket, zero categories, to-sort inbox, registry number); everything else is discarded and nothing is recorded. Details below.
- **Invent** (RL) - the `invent` queue. Trains the archetype and hybrid dice. No longer feeds a product stop; it feeds the library.
- **Wild** - the `discovery` queue, with the ultra-share tuning dial (0-100%, step 5). Nothing here trains anything. No longer feeds a product stop.
- **Dedupe** - whole-library similar-pair triage. Details below.
- **Editor** - open any sound by number, randomize (an all-pools draw at the product mix rate), or arrive via "edit" from a Library or Variations row. Closest-existing-sounds re-rank live while tweaking. Two save verbs, deliberately distinct: "Keep as new sound" mints a SEPARATE sound into the `unsorted` bucket through `persistKeep` (registry number, to-sort flag) and leaves the original untouched; "Replace" overwrites the origin in place. A replace keeps the id and therefore the permanent number, so `#nnn` still resolves and only the recipe behind it changes, but the previous recipe is not recoverable. "Play original" A/Bs the draft against the saved origin. Replace is gated behind an `AlertDialog` confirm because it is the one destructive action with no undo path. The header names the sound's EFFECTIVE categories, since the label carries its bucket file (`tap 29`) which is storage and not membership. Replace overwrites in place: `PUT /api/pool` for a keep, `PUT /api/reference` for an import, ids and therefore numbers unchanged either way.
- **Import** (`/workbench/import`, its own route) - paste a sound back in. The product's Copy sound button is the only thing that can carry a draw off the page, so this is what closes that loop: paste, hear it, see its nearest library match (same near-twin and close-relative tiers Prospect uses, because re-importing a sound is a real way to hand-grow a duplicate), then import. It goes down the ordinary keep path (unsorted bucket, zero categories, to-sort inbox, registry number), so an import is sorted by ear like everything else.
- **Calibrate** - the loudness survey, the absolute pitch ceiling and the ear-safety probe ladders. Writes `data/pool/loudness.json` and `data/pool/limits.json`. Calibrate probes bypass loudness leveling on purpose. The absolute-ceiling card sits above the ladders because it governs them, and carries its own live cost readout: a sparkle canary (the reference sparkle is itself an offender, so it doubles as the too-far signal) plus every sound the ceiling would change, before/after, recomputed from the uncommitted slider value so rows leave the list as it is raised.
- **Atlas** (`/workbench/atlas`, its own route) - renders every generator's vocabulary, allocations and live dice from the code constants. Descriptions live in `lib/audio/atlas.ts`. Deck gestures render as "Characters" in the UI because "voice" collides with the layers-not-voices rule; code and dice keys keep `gesture` and `g:*`.
- **Trash** - every deleted and duplicate mark in one labeled list (duplicate means a fine but redundant sound, deleted means a bad sound). Restore lives ONLY here. The two data files stay separate for provenance; their mechanics are identical, and both exclude a sound from all pools.

RL chip counts on Creations and Invent read `cat (drawable count) · N RL`, where the
drawable count matches Library and the pool exactly and N is the total verdicts ever
filed for that category's dice. A low RL number means thin dice, so that is where to
train. Batch pages carry no session counters and no empty-state prose.

## Categories and the pool

All user-facing categories are intention-based or action-based: things a UI does, never
a vibe word (minimal, crisp, organic) and never a flavor word (pop, chime, twinkle). The
list is code: `CATEGORIES` and `categoryId()` in `lib/audio/categories.ts`, addressed as
C1 through C7 by array order (C1 tap, C2 hover, C3 transition, C4 success, C5 error,
C6 warning, C7 notification).

**Packs are source libraries, never categories.** An import is slotted by ear or gate-cast
into one or more categories; a keep is slotted by ear only. Multi-membership is fine.

**Membership is ONE formula** (`effectiveCategories` in `randomize.ts`), and it is EMPTY
while the sound is awaiting sort. A KEEP is its manual slots and nothing else. An IMPORT is
manual slots UNION gates MINUS vetoes. Never add a second membership source. Gates must not
use `gain`. Deletes and duplicates exclude a sound from ALL pools, and a deleted sound never
resurfaces anywhere. Name-based suggestions are display-only.

**Gates cast imports only.** An import arrives with no categories, so a guess is all that
stands between it and invisibility. A keep is placed by hand, where a guess costs more than
it saves: one tick to state a category, three vetoes to undo three wrong ones. Vetoes are
therefore an import-only concept and do not render on a keep.

**Nothing enters a category unsorted.** Every keep, from every tab, lands in the to-sort
inbox and belongs to nothing until it is signed off there: no aisle, no chip count, no
seed pool for Variations/Creations/Invent, and no product draw. A keep writes NO category and the checklist pre-ticks nothing, neither the tab it came from
nor the gate cast: the machine cannot tell what it made, so proposing an answer would decide
it. Sign-off writes nothing either; the manual ticks ARE the record. The gate lives
inside `effectiveCategories` rather than as a per-surface filter, which is what keeps
chips, aisles, seed pools and the product from disagreeing. Consequence accepted on
purpose: a to-sort backlog stalls the library instead of leaking into it.

**There is no `misc`.** It was retired because one key was doing three unrelated jobs:
a storage filename, a "reviewed but homeless" slot value, and the merged-archetype set in
the generators. That overload is how sounds reached aisles nobody had approved, since it
read as plumbing in one file and as a category in another. The three are now separate:

- `Category` is the seven real categories and nothing else.
- `PoolBucket` (`categories.ts`) is the FILE a keep is written to, never a membership.
  Keeps from category-less engines (Wild, Editor) go to the `unsorted` bucket and get
  their categories from slots and gates like everything else.
- `ArchetypeScope` (`compose.ts`) adds `all`, the merged set every category's archetypes
  are folded into so an archetype can be composed by name outside its home grammar.

The Library "to sort" view is tosort-flagged keeps plus any sound with ZERO effective
categories; that second clause is a safety net, because un-slotting a sound's final
category must land it in to-sort rather than lose it. "Mark sorted" writes the sound's
effective categories in as manual slots and clears the flag.

### Why the categories are what they are

These are settled. Do not re-open them.

- **tap absorbs toggle.** The widget does not determine the sound: button, tab, checkbox, radio, switch and toggle all emit a little click, so a separate toggle category only splits the pool and forces false triage choices. A real toggle's one distinct need, a directional on/off pair, is handled at generate time by the `invert` action.
- **error and warning stay separate.** They are wired differently (error is a blocking failure, warning is caution). Ambiguous sounds go in both. Do not merge them.
- **Sign-off leaves a trace.** `markSorted` writes the effective categories in as manual slots, so "no manual slot" permanently means "never signed off". It also freezes the placement: later gate changes never silently move a sound a human already placed.
- **What each category absorbed**, so these do not come back as separate categories: tap took select and toggle; transition took swoosh, slide, and open/close; success took celebrate and twinkle; notification took chime.
- **Rejected as categories:** send (a use case whose sound is a transition), initiation and completion (covered by success), loading (never used in practice), and every flavor word (those become search tags later, if anything).

### Numbers

A sound's `#nnn` is a permanent address, never a position. `data/pool/numbers.json` is
the append-only registry (id to number, one sequence over imports and keeps). Keeps
register through `POST /api/numbers`; import scripts must write their own entries at
max+1. Full rule and the failure mode it prevents are in CLAUDE.md.

## Similarity and dedupe

The one metric is `lib/audio/similarity.ts`; the Dedupe scan computes it live, and no
precomputed candidate file exists any more.

- Per-layer distance is **deadzone-then-steep**: differences the ear shrugs off are free (pitch within about 1.2 semitones, duration within about 1.9x log-ratio, attack within 8ms absolute, FM index within 0.05), and past the knee they cost steeply.
- Compared terms: pitch, duration, glide amount, layer-onset rhythm relative to layer length, waveform, noise color, envelope curve (ramp versus smooth), sustain, filter presence and type and cutoff, FM (presence penalty scaled by audible index), and echo/reverb wetness plus tail seconds. The core/nuance split survives, and nuance gets short-sound compression.
- **`gain` is deliberately excluded** from the metric and from the gates, because a loudness pass rewrites gains later.
- A sub-audible residual keeps any non-identical pair at or below 95%: 100% is reserved for parameter-identical (gain aside), so the ear-identical band reads roughly 89 to 95.
- The "likely dupe" badge fires at 89% or above, decided on the ROUNDED percent shown on screen, so two equal displayed percents can never disagree on the badge. "Mirrored twin" is claimed only when un-mirroring makes a pair 97% or better, and it displays the un-mirrored percent.
- The Dedupe page floor is `DEDUPE_MIN_PCT` (70%). It is an O(n²) family scan, severity-sorted: violet reach, then amber near-identical, then white family. Per-pair "not similar" verdicts persist to `data/pool/similar-dismissed.json` so the queue only shrinks.
- Rows identify sounds by number plus CURRENT effective categories, never by pack or event name (names mean nothing mid-triage; the name survives as a hover tooltip). "unsorted" renders in place of categories.
- Guardrail badges: "paired" (a live name-pair sister; the standing verdict for paired rows is "not similar", because killing one side orphans the door), "two sides of one door" (anchor and neighbor are counterparts), and "mirrored twin" (keep ONE side; the transition row button adopts both into transition, then the lesser direction gets dupe-marked).
- Pair-atomic marking is REJECTED: pair-versus-pair redundancy needs single-sound dupe to stay possible, so badges plus habit are the guardrail.
- `withinVariationReach(a, b)` is a separate yes/no test against the FROZEN `mutatePatch` math (shared pitch ratio within about 3 semitones, decay and release within 20%, and so on). Attack, waveform, structure, glide, curve and echo never mutate, so any difference there disqualifies. The envelope `curve` check exists because a ramp seed can never mint a smooth sound. A reach-flagged pair means the v1 stop covers both from one seed, so keeping both duplicates the library.
- **Triage is identical-only.** When unsure, keep both: a wrong dupe mark silently removes a distinct seed.
- Retuning the metric requires re-running BOTH the by-ear anchor pairs and the self-audit sweep (near-identical params scoring low, high scores with structural mismatch) and checking the resulting queue size. Never retune from a handful of pairs.
- Draw-time cluster de-weighting in `generate()` is still open work (TODO.md).

## Loudness

Sounds are NEVER rewritten. Leveling solves a play-time volume multiplier, so moving the
master or an offset re-levels the whole library instantly and imported data stays
byte-pristine.

- `lib/audio/offline.ts` renders a patch offline and measures `winDb` and `peakDb`.
- The Calibrate survey measures the library into `data/pool/loudness.json`; fresh engine draws are measured at generate time instead of looked up.
- `LoudnessConfig` in `lib/audio/loudness.ts` is `{ master, offsets, strength }`. `offsets` is per-category dB relative to master, applied by DRAWN category. `strength` below 1 is partial normalization: it compresses the spread so deliberate softness survives proportionally while inaudible extremes are pulled up.
- `loudnessVolume()` clamps to a boost ceiling, a cut floor, and a peak ceiling. A sound sitting far under target is a near-silent outlier, and amplifying it that far would mostly raise its noise floor.
- `bakeVolume()` bakes the solved multiplier into the layer gains for export. The synth computes every layer as gain times volume, so this is exact: the exported file plays identically to what the site played. It returns a new `Patch` and never mutates.
- Calibrate probes bypass leveling on purpose.

## Export

WAV and the JS snippet ship. The JSON recipe is not built; when it is, it lands in
`lib/audio/export/` beside the other two and never anywhere else, because a paywall (if one
ever arrives) gates export and needs exactly one place to sit.

### The JS snippet is TWO things, and that split is the design

A SOUND is data and there is one per export. The PLAYER is the node-building code and there
is one per project. Emitting both together made a three-layer tap read as 230 lines of which
60 were the sound, which reads as "this is a lot of code" rather than "this is my sound".

- `toSoundJs(patch)` is what the Copy sound button gives: a named `const` holding the patch, plus the `playSound(name)` call. That is the whole per-sound payload.
- `PLAYER_JS` is the one-time setup, offered under "Use it in your project" on the product page. It is a standalone copy of `synth.ts` plus `effects.ts` (noise colours, ADSR including the ramp curve, glide, FM, filters with their envelope, reverb, shimmer) and imports nothing from this repo, which is the point. It is therefore the ONE place a change to the real node graph can silently drift; an edit to `synth.ts` or `effects.ts` belongs here too.
- `toSnippet()` still emits both in one paste, for a blank file with nothing else in it.
- `parseSound(text)` is the way back in, behind the workbench Import bench. It scans every `{` in the paste and keeps the first balanced object that parses as JSON AND validates as a patch, so a bare object, a copied sound, and a whole standalone snippet (player code first) all work.

### WAV

The pipeline is render, bake, trim, fade, encode:

- `patchToWav(patch, { volume })` bakes the play-time loudness multiplier into the layer gains, renders through `renderToBuffer` (the SAME node-building as live playback, which is the fidelity guarantee), trims, fades and encodes. It returns a `Blob`; `downloadPatchWav` wraps it in an object-URL anchor click.
- Mono 16-bit PCM at 44.1kHz. Mono because the synth has no pan, so an offline render's channel 0 IS the whole signal and a stereo file would carry two identical copies. 16-bit because a UI blip gains nothing from 24, and at two bytes per sample the data chunk is always even, so the RIFF odd-byte pad case cannot occur. 24-bit, stereo and the ZIP-pack worker are all deferred.
- Trim cuts the leading and trailing run below the synth's own silence floor (`0.0001`, the value envelopes decay toward and never reach). A file therefore starts on its transient rather than on a layer's `delay`, and it is shorter than the `duration` the UI prints: `patchDuration` deliberately carries 0.15s of scheduling headroom that no listener hears.
- Fades exist to stop the cut clicking, not to shape the sound. The fade-out is 6ms; the fade-in is 2ms CLAMPED to the pre-onset region (everything below 1% of peak), because a UI tap can reach full level in 1ms and ramping across a real transient would soften the exact thing being exported. A patch whose envelope opens instantly exports with no fade-in at all, which is correct: that step is what the site played.
- A noise layer draws fresh grains on every render, so an export is the same recipe but not the same sample stream as the click that played it.
- Filenames are the displayed sound name, slugged. That inherits the naming problem in TODO.md: a v2 draw seeded from a hover is called `hover.wav` no matter which category tab drew it.
- A TRANSITION exports as a PAIR: the sound and its `invertPatch` reverse, two files. An interface that only got the send would have to invent the way back. `downloadSoundWav` owns that rule so no surface can disagree with another about it.

## Instrument-first invention (the Craft engine)

A draw is `Instrument x Figure x Space`, cast per category, and that factorisation is the
whole point. An INSTRUMENT (`instruments.ts`) renders one note of one coherent physical
object and knows its plausible register, how it gives up its energy, and its highest
sounding partial. A FIGURE (`figures.ts`) decides pitches, timing and how hard each note
is struck, and names no timbre at all. A SPACE decides ambience. Because the two halves
are independent, one gesture can be a wooden bar, a thumb piano or a struck tube without
any of the three sounding like a parameter collision.

Three properties distinguish it from the `compose.ts` + `wild.ts` + `invent.ts` path:

- **Nothing is rescued.** The root is placed so the highest partial of the chosen
  instrument already clears the category ceiling and the note lengths already fit the
  budget. `enforceLimits` remains as a backstop rather than as the mechanism, so draws
  are not flattened by clamps they were always going to hit.
- **Roles, not one voice per sound.** A figure emits role-tagged events (`lead`, `body`,
  `transient`) and the caster assigns a DIFFERENT instrument to each. A low body under
  two bright notes, or a noise click in front of a tone, is a shape single-voice grammars
  could not express, and it is what hand-curation kept choosing.
- **Struck versus ringing is explicit.** A struck object uses `curve: "ramp"` with zero
  sustain; a ringing or bowed one uses the natural exponential envelope with a small
  sustain and release. Getting that distinction wrong is what made earlier output read as
  synthetic rather than physical.

There are no dice here on purpose. The older stop learned per-cell weights from verdicts
and still converged on output the curator rejected, because the weights were tuning
inside a space whose walls were wrong. Here the design rules are the constraint, so a bad
draw is a rule to edit, not a verdict to file.

## Prospect (the discovery bench): five engines behind one button

**What it is for.** Filling the library by hand, fast. Not a product surface. The premise
is explicit: most draws will be discarded, and that is fine, because a low hit rate is
cheap when judging costs one keystroke and the survivors are curated by ear before
anything reaches a user.

**Five sources, one button.** This is the part worth understanding. Prospect is NOT a
sixth generator with new ideas, and it is not the Craft caster with the categories
deleted (which is what it was first built as, and it sounded exactly like that). Every
press draws from one of five different engines, each contributing something none of the
others can:

| source | engine it comes from | what only it can do | share |
|---|---|---|---|
| `remix` | `create.ts` `createFrom`, the Creations operations | starts from a sound a human already approved, so it inherits a quality floor for free | ~30% |
| `craft` | `craft.ts` `castFrom` on a wide profile | coherent physical objects: instrument x figure x space | ~25% |
| `deck` | `wild.ts` `ULTRA_GESTURES` on a consonant, register-bounded contract | Invent's best path with its walls kept on | ~18% |
| `breed` | `compose.ts` `hybridize` over two library parents | shapes no single grammar contains, skeleton from one parent and timbre from the other | ~15% |
| `wildcard` | `wild.ts` `discovery` | the only source that can genuinely surprise; kept small because raw it is noise | ~12% |

The `remix` and `breed` paths need the curated pool, so the page builds it with
`buildPool` and passes it in. With no library loaded those two sources simply do not
draw.

**The finishing pass is what makes the mixture cohere.** Five engines taking turns would
sound like five engines taking turns. Instead every draw, whatever produced it, goes
through one source-blind pass in `finish()`:

1. **Register.** Whole-patch octave drops until the highest tonal partial clears 1050 Hz
   (under the calibrated `sineCeilingHz`). Whole-patch, so intervals and direction
   survive intact.
2. **Length.** Envelope end past 0.85 s scales delays, decays and releases down together.
3. **Tail.** A gentle shimmer on about two thirds of draws that brought none. This is the
   single change that most reliably reads as finished rather than raw.
4. **Level.** `normalizeGains` balances the layers, then the sum is clamped to a 0.5
   budget, then `enforceLimits`.

Source-blind on purpose: every quality complaint this project ever logged (piercing,
harsh, drags, clipping, thin) was a failure of one of those four, so none of them is
trusted to any individual engine.

**Two anti-repetition guards.** Each draw is re-rolled up to 40 times until it clears the
0.15 `perceptualDistance` threshold against BOTH the last 160 sounds of the sitting AND
every sound in the library. The library half matters because `remix` starts from a
curated sound and can drift back within reach of its own parent, which is a duplicate
rather than a discovery. Measured over 200 consecutive draws: zero session
near-duplicates, zero library duplicates, about 1.2 ms per draw over ~530 seeds. If
nothing clears the bar, the least-similar candidate is returned rather than stalling.

**The near-miss flag.** Draws at or above the rejection bar never reach the curator, so
every sound shown is already legal. What the UI reports instead is how close it landed:
`matchPercent` against the nearest library sound, shown per row. At 70% or above the row
turns orange, names the sound it resembles, and offers a play button for that original so
the two can be A/B'd before keeping. 58-69% is amber. Below that is plain.

**No learning, deliberately.** No dice, no taste writes, no verdict tallies. Discarding a
draw records nothing. The rules ARE the constraint, so a bad draw is a rule to edit rather
than a probability to nudge. The preceding stop learned per-cell weights from ~700
verdicts and still converged on output the curator rejected, because the weights were
tuning inside walls that were wrong.

## There is no post-process that makes a raw draw sound designed (tried, removed)

A "polish" pass was built to give Invent and Wild whatever made Craft sound finished, and
it was removed after being judged by ear. Recorded here so it is not attempted again.

**What it did.** Three differences were measured over 900 draws of each engine: Craft
gave 100% of layers a release stage against 6% elsewhere, 51% a sustain against 1%, and
filtered 64% of layers against 14-28%. The pass added those, plus a summed-gain budget.
A stronger variant tightened the filters further, lengthened the releases, and handed
long ramp envelopes back to the natural curve.

**Why it failed.** Both variants changed the sounds rather than cleaning them, which is
what the curator heard immediately. The premise was wrong: a missing `release` is not a
defect to repair. `synth.ts` already starts every envelope at silence and ramps up, and
already ends either by ramping exponentially to silence or by approaching it
asymptotically via `setTargetAtTime`, so there is no click at either end to fix.
`release` is purely a tail-length control. Same for the rest: filters are tone,
un-ramping is envelope character, the gain budget is balance. All four are design edits
wearing the word polish.

**The artefact scan that settled it.** Invent output was checked for the things a real
cleanup stage removes: onset clicks (1% of layers, and those are `attack === 0` which the
player handles), sub-millisecond attacks (0%), overlapping layers summing past 1.0 (0%,
and loudness levelling scales the patch at play time anyway), near-silent junk layers
(0%), and harsh waveforms high enough to alias (0%). There was nothing to clean.

**The conclusion.** Craft's cleanliness is COMPOSITIONAL, not cosmetic. It comes from
instruments designed as coherent objects, where the filter is chosen alongside the
timbre, the partials sit at ratios a real object would have, and the envelope matches how
that object sheds energy. That is decided when the sound is written, and no post-process
can retrofit it onto material assembled from unrelated parts. The routes to cleaner
output are to draw from Craft, to draw from Prospect (where about a quarter of draws are
Craft), or to widen the instrument bank so more of what Prospect draws is sound from the
start.

## Engine lineage (settled; do not re-litigate)

Names of upstream projects and authors live in THIRD-PARTY-NOTICES.md and nowhere else
(TODO.md carries the standing scrub rule). This section says what is true, generically.

**One player, everything goes through it.** `playPatch` in `synth.ts` is the only function
in the repo that produces sound, over the single `AudioContext` in `context.ts`. Imports and
keeps, product and workbench, all render through it. It is a port of the UPSTREAM AUDIO
LIBRARY, and the decision to stay on it rather than switch to the reference pack's engine is
settled: ours is a strict superset (4 waveforms plus FM, sweeps, 3 noise colours and reverb,
against sine/glide plus white noise and shimmer). Both are the same architecture, a
declarative spec per sound plus a small generic player; the difference was reach, not sound
math.

**"Passing through the engine at generation" is not a thing, and the distinction matters.**
Generation produces a `Patch`, which is a recipe. The player turns a recipe into audio at
PLAY time. So there is nothing to pass through until something is played. Imported packs are
recipes authored upstream and translated into our schema; generated sounds are recipes
written by our generators and then clamped by `enforceLimits`. Both kinds are just recipes,
and both play through the one player.

**Two things came from the reference pack, both ADDITIONS, never substitutions:**

1. `envelope.curve: "ramp"` - hard exponential ramps to a 0.0001 floor. Adopted because our
   `setTargetAtTime` envelope measurably rendered every sound about 1.4x louder in RMS and
   about 2.5x longer-tailed. Verified with an offline A/B harness rendering our synth against
   the upstream engine verbatim until RMS matched within a few percent.
2. The shimmer feedback-delay echo (`createShimmer`/`shimmerTail` in `effects.ts`), which is
   the ringing tail.

Both are declaration-gated, so a patch that does not ask for them renders byte-identical.

**The ramp envelope is the DEFAULT in generation**, which is what gives generated sounds that
character: `tone()` in `compose.ts` emits it unless explicitly disabled, `noise()` always
emits it, and `create.ts` and `wild.ts` use it too.

**There is no ten-step cleaning pass at runtime.** The 10 rules that look like one (5
`pipeline-*` plus 5 `validate-*`, archived in the local docs) are an upstream AGENT skill, and
CLAUDE.md's hard rule keeps that as calibration reference only, never a runtime feature. The
pass that does clean every generated recipe is `enforceLimits`, ours, described below.

## Ear-safety limits

`lib/audio/limits.ts` holds calibrated ceilings (sine ceiling, harsh ceiling, saw open
lowpass, max filter Q, noise band ceiling, max FM depth, harsh floor), calibrated on the
Calibrate tab into `data/pool/limits.json`. Defaults reproduce pre-calibration behavior,
so an empty `limits.json` changes nothing.

`enforceLimits()` runs at generation time in `createFrom`, `compose`/`hybridize` and
`finishWild`. The curated library is untouched and is a separate audit pass. The frozen
variation pass runs a frequency-only rail instead (`capUpwardDrift`): a variation may move a
pitch but may never publish one above `absoluteCeilingHz`, nor above its own seed when the
seed already exceeds it. The full clamp is deliberately not applied there, since inserting
lowpasses would rewrite the pass's character; the rail only refuses values that climbed.

The **prominence gate** is the load-bearing idea: harshness is contextual, not
per-parameter. A bright partial at low gain with a fast decay reads as sparkle, not pain,
so ceilings only apply to layers loud enough and long enough to read like a naked probe.
Harsh timbres carry more energy per unit gain, hence their lower gain bar.

Two rules are ungated and the gate cannot open either. The **buzz floor**, because low raw
saw or square buzz offends at any gain. And `absoluteCeilingHz`, the backstop: the gate reads
a layer's WRITTEN gain, while play-time leveling rescales the whole patch, so a partial the
gate calls quiet can be boosted back to audible.

The gate has one blind spot it cannot close, because it never asks WHEN a layer starts. A
quiet high partial under a loud body is masked and genuinely reads as sparkle; the same
partial arriving after the body has decayed is naked. `exposedTails()` lists those rather
than clamping them, since the fix is a judgement call, and Library carries them on an
"exposed tails" chip.

## Product state

`lib/store.ts` is zustand with the `persist` middleware (localStorage key
`ui-sounds-history`). It holds the current `SoundEntry` plus a history capped at
`HISTORY_CAP`, with restore and clear. A `SoundEntry` carries the patch, its display
name, drawn category, frequency label, duration, timestamp, and
the solved loudness `volume`.

## Licensing and attribution

This repo's own code stays proprietary. Only the licenses of consumed components are
honored. The single source of truth is [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)
at the repo root: one entry per source with usage, license type and full license text.
The future footer notices page renders from it, and a new source gets its entry added
there before its code or data lands.

- **Vendored code is the gotcha.** Ported sources are not in `node_modules`, so license scanners will not find them. Each ported file carries a header comment pointing at THIRD-PARTY-NOTICES.md. Trimming a port is a permitted modification, but the notice obligation stays, and kept lines are never rewritten to dodge it.
- Apache 2.0 adds a patent grant, change-notes and NOTICE propagation. Nothing here is Apache today; learn it if a dependency ever needs it.
- Faithful reproduction comes from vendoring the minimal player logic under MIT with attribution, not from depending on an audio package. A package dependency would not help the standalone JS-snippet export anyway, since that must reproduce the sound without any library.

## Standing design notes

- The curated per-category generator is the core IP. Uniform RNG over the raw parameter space is not viable.
- Anti-click envelope ramps and per-trigger jitter are what make sounds feel polished.
- Export is framed by intent, so nothing reads as "install my package".
- Most UI-sound patches live in a narrow region: waveform plus a short frequency sweep or FM, a tight ADSR (attack near 0, decay 0.05 to 0.3s), an occasional lowpass, light reverb, and jitter.
- Interpolation between pool members is a future option once pools are dense, as is a seeded RNG for shareable and reproducible sounds.

A local archive (not published) holds project history, the done log, positioning
material, the engine gesture notes and superseded design docs. Nothing in it is
instructions or current state. If a fact in there becomes load-bearing, promote it into
a committed doc.
