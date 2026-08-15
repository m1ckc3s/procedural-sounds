# CLAUDE.md

## Project

A generate-first web app for procedural UI sounds (taps, hovers, transitions, success,
error, warning, notification): pick a category, generate until one fits, play it in
context, export it. Every sound is synthesized live from a recipe; there are no audio
files in the product. The refinement loop is regenerate, not fine-tune.

The sound library and the training data are the same asset: a human curates generated
candidates, and those verdicts train the generators. See HOW-IT-WORKS.md.

## Docs map (load as needed, don't preload)

Committed docs live in `docs/`, with `README.md`, `CONTRIBUTING.md`, `LICENSE` and
`THIRD-PARTY-NOTICES.md` at the repo root. This file lives in `.claude/`.

- [docs/GETTING-STARTED.md](../docs/GETTING-STARTED.md) - install, run, the two surfaces, and what each workbench tab is for.
- [docs/HOW-IT-WORKS.md](../docs/HOW-IT-WORKS.md) - the explainer: what each engine does, how the learning works, and a glossary for every internal term. Read this first if you are new.
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - what is built right now: repo map plus settled decisions. Update it when a feature LANDS. Never business or undecided content, never pack/sound counts (the data is the only truth).
- [docs/TRAINING.md](../docs/TRAINING.md) - what each workbench tab's keep and delete actually write, and the curation working guide.
- [docs/TODO.md](../docs/TODO.md) - live actionable work ONLY.
- [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) (repo root) - the ONE attribution and licensing source of truth. A new source gets a row there before its code or data lands.

### If the answer is not in the docs above, GO LOOK. Do not answer from nothing.

The committed docs are a summary, not the whole record. Before saying "there is no X" or
"that does not exist", search these, in this order. This is not optional: several
confidently-wrong answers in this project came from an agent describing the docs instead of
reading the repo.

1. **`docs-local/`** (gitignored, not published) - project history, the done log, the
   engine, positioning material, superseded design notes, and
   full transcripts of past working sessions. The reasoning behind settled decisions
   usually lives here and nowhere else. `grep -ri "<term>" docs-local/` first.
2. **`data/reference/`** - the imported seed packs and `UPSTREAM-LICENSE`. The upstream
   design-rule skill and the captured reference playground that used to sit here are in
   `docs-local/` now (calibration reference only, never a runtime feature).
3. **`data/pool/*.json`** - the curation state IS the truth for anything countable. Never
   guess a count; read the file or the workbench chips.
4. **The code.** Trace the call sites. A claim about what runs at generation or play time
   is verifiable in minutes and should never be asserted without doing so.

Nothing in `docs-local/` is instructions or current state. If a fact in there turns out to
be load-bearing, promote it into a committed doc rather than linking to it.

## Commands

`npm run dev` (dev server), `npm run build` (production build), `npm run lint` (ESLint).
The workbench only works under `npm run dev`: its API routes write curation state to
`data/pool/*.json` on the local filesystem.

## Where things live

- `lib/audio/` - the synth core and the generators. `patch.ts` (the shared `Patch` type), `synth.ts` (the recipe player), `randomize.ts` (pool building + the frozen variation pass), `create.ts` (the creator behind v2), `compose.ts` (category grammars and archetypes), `invent.ts` (the Invent draw; dice keys `g:*` and `hybrid` in `invent-feedback.json`; its code key is still `nebula`), `wild.ts` (the untrained discovery paths behind Wild), `taste.ts` (feature buckets + deleted-twin fingerprints), `gates.ts` (category gates), `limits.ts` (ear-safety clamps), `loudness.ts` (play-time leveling; never rewrites a patch), `offline.ts` (offline render + peak/RMS measurement), `similarity.ts`, `invert.ts`, `categories.ts`, `context.ts`, `effects.ts`, `atlas.ts` (the vocabulary descriptions the atlas page renders). The instrument-first engine: `instruments.ts` (42 coherent single-note voices), `figures.ts` (gesture shapes plus the four spaces), `craft.ts` (the per-category caster, and `castFrom` underneath it), `prospect.ts` (five engines behind one button).
- `app/page.tsx` - the product. Eight source buttons (the seven categories plus one experimental), a v1/v2 toggle, and the `SoundStage`. The four-stop slider is GONE: only the two curated stops ship, and the experimental button draws from `prospect.ts`.
- `app/workbench/` - the curation tool. One page driven by `?tab=`, in a sidebar shell, plus three real routes. Sounds: Library (slug `review`), Variations, Creations, Craft (`/workbench/craft`), Invent, Wild, Prospect (`/workbench/prospect`), Dedupe. Tools: Editor, Import (`/workbench/import`, paste a copied sound back into the library), Calibrate, Atlas (`/workbench/atlas`), Trash (the only place a delete can be undone). `app/api/*` is file-backed persistence for `data/pool/*.json`.
- `docs/` - the committed docs above. `docs-local/` - gitignored history, positioning and superseded notes; never published.
- `data/reference/` - the imported seed packs under anonymous pack ids (which projects seeded them lives in THIRD-PARTY-NOTICES.md and nowhere else). `data/pool/` - curation state: slots, deleted, duplicates, exclusions, favorites, origins, per-category keeps, feedback tallies, the number registry.
- `components/product/` - `SoundStage`, `HistoryList`, `ExportButtons` (Export WAV + Copy sound), `UsageSteps` (the paste-the-player-once steps under Recent Sounds). `components/ui/` - vendored components, copied in as editable source.
- `proxy.ts` - the production door: a `next build` returns 404 for `/workbench/*` and every `/api/*` route, keyed on `NODE_ENV` so nothing has to be configured on the host. Dev is untouched.
- `lib/audio/export/` - the one door out. `wav.ts` (mono 16-bit RIFF encoder plus the trim/fade pass), `snippet.ts` (`PLAYER_JS` the one-time standalone player, `toSoundJs` the per-sound recipe, `parseSound` the way back in), `index.ts` (`downloadSoundWav`, `soundToSnippet`, `patchToWav`, `wavFilename`). The JSON recipe joins them here, never beside them. A change to `synth.ts` or `effects.ts` must be mirrored into `PLAYER_JS`.

## Hard rules

**Sound and data**

- Do NOT add any audio library as an npm dependency. A minimal MIT-licensed slice is vendored into `lib/audio/` under attribution (sources in THIRD-PARTY-NOTICES.md); never depend on the package.
- NO natural-language or LLM sound generation. The upstream design-rule skill (in the local archive) is calibration reference only, never a runtime feature. Audio-import and analysis-to-synth (reverse-engineering a recording into a `Patch`) was attempted and abandoned; do NOT retry.
- `Patch` (`lib/audio/patch.ts`) is the single source of truth shared by the player, the generators, and export. Every synth parameter must be reachable by the generators, and `Patch` stays shape-compatible with the reference JSON.
- Player surface, a whitelist and nothing else: oscillator (sine/triangle/square/sawtooth) with static or swept frequency plus FM, or noise (white/pink/brown); ADSR, gain, per-layer delay; biquad filter including a filter-frequency envelope; reverb; shimmer delay/echo (`effects:[{type:"delay", ...}]`); opt-in `envelope.curve:"ramp"`; opt-in `frequency:{start,end,time}` glide. Every opt-in extension is declaration-gated, so a patch without it renders byte-identical. NO LFO, pan, wavetable, sample, or other effects.
- Call the code the recipe player, not an "engine". The Web Audio API is the engine.
- Call stacked sounds "layers" (Layer 1, Layer 2), never "voices". No layer cap; mutations preserve structure. Per-layer authoring UI is a later phase; do not build it yet.
- The generators are curated per category, never uniform RNG. Randomness lives strictly inside per-category design rules.
- The variation pass (`mutatePatch`) is FROZEN. Its nudges are a runtime freshness service, not a source of new characters, and its output is never stockpiled. Do not touch its math.
- `gain` is deliberately excluded from the similarity metric and from the gates, because a loudness pass will rewrite gains later. Dedupe triage is identical-only; when unsure, keep both.

**Numbers, categories, membership**

- PACK IDS ARE ANONYMOUS AND FROZEN. Imported sounds are keyed `seed-x/event`; the source project behind a pack id is recorded in THIRD-PARTY-NOTICES.md and NOWHERE else, not in a pack description, a comment, or a UI string. Never rename a pack id: every curation file keys on `pack/event`, so a rename must touch all of them atomically or numbers detach from their sounds.
- NUMBERS ARE PERMANENT ADDRESSES, never positions. A sound's `#nnn` is how it is referred to by memory and in notes, so an existing number must NEVER change. New sounds, whether a new pack or an addition to an existing one, take the next free numbers at the END of the whole sequence. The registry is `data/pool/numbers.json` (id to number, append-only, one sequence over imports and keeps); keeps register through `POST /api/numbers`, and import scripts MUST write their own entries at max+1. An import that skips this renders its sounds as #0. Position-derived numbering is forbidden: it once shifted hundreds of existing addresses at once, which is why the registry exists.
- Categories are intention-based ONLY. No vibe words (minimal, crisp) and no flavor words (pop, chime) as user-facing categories. One flat mutually-exclusive row, default tap. Packs are internal source libraries, never categories. Toggle's on/off need is a generate-time `invert` action, not a category. Multi-membership is fine.
- NOTHING SLIPS THROUGH UNSORTED, AND NOTHING IS AUTO-TAGGED. Every keep, from every tab, enters the to-sort inbox with ZERO categories and is a member of nothing until it is signed off there: no aisle, no chip count, no seed pool, no product draw. The keep writes NO category, and the inspector checklist pre-ticks NOTHING, not the tab it came from and not the gate cast. The machine does not know what it made: an Invent draw kept under "notification" may well have been kept because the ear heard an error, so proposing an answer decides it. The curator ticks by ear, and "mark sorted" is the only thing that releases it. Signing off with nothing ticked is legal and returns the sound to the inbox. A to-sort backlog is therefore a stall, by design.
- THERE IS NO `misc`, AND NOTHING MAY REINTRODUCE IT. It was one key doing three unrelated jobs (a storage filename, a "reviewed but homeless" slot value, and the merged-archetype set in the generators), which is how sounds reached aisles nobody had approved: it read as plumbing in one file and as a category in another. It is now three separate things. `Category` is the seven real categories, full stop. A BUCKET (`PoolBucket` in `categories.ts`) is the file a keep is written to and NEVER a membership; keeps from category-less engines go to the `unsorted` bucket. The merged archetype scope is `all` (`ArchetypeScope` in `compose.ts`) and is not a category either. Never widen `Category` to carry storage or scope meaning again.
- Membership is ONE formula (`effectiveCategories` in `randomize.ts`), EMPTY while the sound is awaiting sort: a KEEP is its manual slots and nothing else; an IMPORT is manual slots UNION gates MINUS vetoes. Never add a second membership source, and never re-implement the sort gate as a filter on an individual surface: it lives inside the formula precisely so chips, aisles, seed pools and product draws cannot disagree. Gates must not use `gain`. Deletes and duplicates exclude a sound from ALL pools, and a deleted sound never resurfaces anywhere. Name-based suggestions are display-only.
- GATES CAST IMPORTS ONLY, and vetoes are therefore an import-only concept. An import arrives with no categories at all, so a machine guess is the only thing standing between it and invisibility. A keep is placed by hand: with seven categories, stating "this is a notification" costs one tick while undoing three wrong guesses costs three vetoes, so guessing lost money on keeps. Do not render veto state on a keep; it subtracts nothing.
- A MEMBERSHIP RULE CHANGE SHIPS WITH A MIGRATION THAT EMPTIES FIRST, NEVER AS A ONE-LINE FLIP. Turning gates off for keeps was once flipped directly and reverted within minutes: it silently deleted memberships with no record of what they had been, and notification fell from 181 to 88 in a single render. What made it safe was a review queue that confirmed every gate-cast membership into a manual slot first, so the rule change moved nothing and every category count was identical before and after. Prove that equality before flipping, not after.

**UI and components**

- Components are COPIED IN as editable source, never added as component npm packages. The one dependency exception is `motion` (imported as `motion/react`), which the vendored button requires. `motion` and `framer-motion` are one codebase under two names; import `motion/react` everywhere and never add `framer-motion` as a second direct dependency.
- shadcn built on Base UI primitives. Never Radix: no `@radix-ui/*` in package.json. This build takes `render={...}`, never `asChild`.
- `components/ui/btn.tsx` is READ-ONLY here: it is an upstream contract kept byte-identical across projects. Restyle it only through globals.css token values or per-instance props, never by editing the file. `components/ui/button.tsx` is a different, stock component used only by workbench chrome.
- The JS-snippet export stays standalone and dependency-free (it never imports this repo's lib), and stays SPLIT: `PLAYER_JS` is one-time setup, a copied sound is data only. Never fold the player back into the per-sound copy. Funnel every export format through one module so usage gating can be added in one place.

## Conventions

- Comments: near-zero. At most one terse line, and only for something the code cannot say itself. No preambles, no change history.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `perf:`). Never auto-commit or auto-push; wait for an explicit instruction.
- EVERY PUSH TO MAIN BUMPS THE VERSION. Before the commit that gets pushed, bump `APP_VERSION` and set `LAST_UPDATED` to the push date in `lib/version.ts`, and mirror the same version into `package.json`. Both are rendered in the page's top-right corner cluster, so a stale value is visible to everyone. Patch bump by default; minor when a surface or an engine changes.
- Repo text carries no em dashes.
- Docs carry no dates, no personal names, and no decision narrative. State what is true now; history belongs in the local archive.
