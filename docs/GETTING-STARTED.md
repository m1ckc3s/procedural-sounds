# Getting started

Setup, the two surfaces, what each workbench tab does, and where to go next.
Conceptual background is [HOW-IT-WORKS.md](HOW-IT-WORKS.md); rules are [CLAUDE.md](../.claude/CLAUDE.md).

## Run it

Node 24 is what this is developed on (Next 16 / React 19 / Tailwind 4, so do not expect
an old Node to work).

```bash
npm install
npm run dev
```

Two surfaces:

- **`/`** the product. The sound stage, eight source buttons (seven categories plus one experimental), and a v1/v2 toggle. The four-stop slider is retired: only the two curated stops ship.
- **`/workbench`** the curation tool. This is where the sound library is grown and the
  generators are trained. Dev only: a production build returns 404 for it and for every
  `/api` route (`proxy.ts`).

**The workbench only works under `npm run dev`.** Its API routes write curation state
straight to `data/pool/*.json` on the local filesystem, so it cannot run on a serverless
host, and curation state is committed to git like source. Sound is browser audio, so a
first click is required before anything plays (autoplay policy).

Other commands: `npm run build`, `npm run lint`.

## How it works, in one paragraph

`lib/audio/synth.ts` is a recipe player over the Web Audio API: a `Patch` describes
layers, oscillators or noise, envelopes, filters, and effects, and the player renders it.
Everything else generates patches. The product's v1 draws a curated library seed, v2
remixes one, and the experimental button samples five engines at once. In the workbench,
Invent writes new characters from category grammars and cross-pack hybrids, and Wild runs
the untrained discovery paths. Generators learn from curation verdicts recorded in the
workbench (dice weights plus a feature-bucket taste model), which is why the library and
the training data are the same asset.

## The workbench, in one table

`/workbench` is one page driven by `?tab=`. What each tab is for:

| Tab | What it does |
|---|---|
| Library (`?tab=review`) | The sound library, per-category aisles plus a "to sort" inbox and an inspector. Where sounds get their categories. |
| Variations | The frozen variation pass. Trains NOTHING by design, so it has one button ("add to library") and no delete. |
| Creations | The creator (`createFrom`): structural remixes of a seed. Keep/delete here trains v2. |
| Craft | Instrument-first invention: instrument x figure x space, per category. No dice; a bad draw is a rule to edit. Vetoes remove a component for good. |
| Invent | The hybrid / archetype / character lottery. Keep/delete trains its dice. Feeds the library. |
| Prospect | One button, five engines (remix, craft, deck, breed, wildcard), no category. Also behind the product's experimental button. |
| Wild | The untrained discovery paths. Never learns; keeps land in the to-sort inbox. |
| Dedupe | Whole-library similar-pair triage. |
| Editor | Open a sound by number, tweak it, then either keep it as a NEW sound or replace the original in place. |
| Import | Own route. Paste a sound copied off the product page ("Copy sound") back into the library. Shows its nearest library match first, then keeps it through the ordinary to-sort path. |
| Calibrate | Ear-safety probe ladders plus the loudness controls. |
| Atlas | Own route. Renders every engine's vocabulary, allocations, and live dice from the code, plus an "under the hood" glossary. Read this to understand the generators. |
| Trash | Everything deleted or marked duplicate. Restore lives ONLY here. |

## Docs

| File | What it is |
|---|---|
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | **Read this first.** What each engine does, how the learning works, and a glossary for every internal term. |
| [TRAINING.md](TRAINING.md) | What each workbench tab's keep and delete write, and the curation working guide. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What is built right now, plus settled decisions. |
| [TODO.md](TODO.md) | Live work only. |
| [CLAUDE.md](../.claude/CLAUDE.md) | Project rules, the docs map, and the hard rules that must not be broken. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Where help is most useful and how contributions merge. |
| [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) | The single source of truth for attribution and licensing. |

## If you are joining this project

1. Read `HOW-IT-WORKS.md`. It explains the engines and defines the vocabulary the rest of
   the code uses.
2. Read `CLAUDE.md` end to end. The hard rules are not optional, and several are
   non-obvious: a sound's `#number` is a permanent address and must never change, no audio
   library may be added as a dependency, category membership has exactly one formula, and
   `components/ui/btn.tsx` is read-only.
3. Run the app and click around both surfaces.
4. If you are here to curate, read `TRAINING.md` next.

Third-party sound packs and components are vendored under MIT with attribution. Any new
source gets a row in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) before its code or
data lands.
