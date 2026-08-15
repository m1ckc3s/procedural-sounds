# sonaut

Procedural interface sounds, with taste.

Every sound is synthesized live in the browser from a recipe. There are no audio files
anywhere in the product. Pick a category, generate until one fits, hear it in context,
export it as a WAV or as a few lines of JavaScript.

## Where this is at

**Early beta, and very much a work in progress.** The core loop works: generate, hear it in
context, export. The library is growing, the generators are learning, and a lot of what is
here is the first version of itself. Do not read this repo as a finished project. Read it as
one you can help build.

I am looking for help, and PRs are welcome. In rough order of how much they would matter:

- **Installation and packaging.** Today the only way to use a sound is to export it from the
  running app. An npm package that ships the player and lets a project `import` a sound is
  the single biggest missing piece. The player is already standalone and dependency-free.
- **Training data.** The library grows by curation, and every keep or delete trains the
  generators. If you have ears and patience this is the most valuable thing anyone can do.
- **The generators.** New instruments, figures, archetypes and characters, and better
  training for the ones that exist.
- **The front end.** The stage animations, the product page, the workbench.
- **The docs.** Anything in `docs/` that is stale or unclear, and the Atlas copy.

[CONTRIBUTING.md](CONTRIBUTING.md) has the specifics, including how curation contributions
get merged. [`docs/TODO.md`](docs/TODO.md) is the live work list.

## Run it

Node 24 (Next 16, React 19, Tailwind 4).

```bash
npm install
npm run dev
```

Open the product at `/`. At the bottom of the page there is a **dev mode** link. That is
the workbench, and it only exists when you run locally: its routes write curation state to
`data/pool/*.json` on your filesystem, and a production build closes them.

Inside the workbench you can:

- **Library**: browse everything, sort new keeps into categories by ear, and audit the
  library against the ear-safety ceilings.
- **Variations, Creations, Invent, Wild, Craft, Prospect**: generate in batches from each
  engine, keep what is good, delete what is not. Every verdict on Creations and Invent moves
  that engine's dice. Keeps from every tab land in the to-sort inbox with no category until
  you sort them.
- **Editor and Import**: hand-write a recipe, or paste one back in.
- **Calibrate**: set the ear-safety ceilings and loudness targets by listening.
- **Atlas**: everything every generator can say, rendered live from the code and the
  current training state.

Read [`docs/TRAINING.md`](docs/TRAINING.md) before a curation session. It says what
each tab's keep and delete actually write.

## How it works

The short version: a hand-curated library, a handful of generators that draw from and remix
it, and a learning layer that shifts each generator's odds every time a curator keeps or
deletes what it made. The library and the training data are the same asset.

On provenance: the synth core began as an adaptation of an open source recipe player, and a
few open source sound packs seeded the very first library. Everything that generates,
learns and curates is original to this project, as are the instruments, figures and
characters the generators draw from, and the library has been growing past its seeds ever
since. The specific projects and their licenses are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), also rendered at `/licenses`.

The long version lives in [`docs/`](docs/):

- [GETTING-STARTED.md](docs/GETTING-STARTED.md) sets up the workbench and explains each tab.
- [HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) is the explainer, with a glossary.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) is what is built right now.
- [CLAUDE.md](.claude/CLAUDE.md) is the rulebook the whole project holds to.

## License

MIT. See [LICENSE](LICENSE).
