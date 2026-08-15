# Contributing

Thanks for looking. This is a beta, built mostly by one person and an agent, and there is
plenty of room to help. Below is where help is most useful, then the rules that keep the
project coherent, then how curation contributions get merged.

Read [`.claude/CLAUDE.md`](.claude/CLAUDE.md) before writing code. It is short, it is the
rulebook, and pull requests that break a hard rule in it will be asked to change.

## Where help is most useful

**Install and packaging.** Right now the only way to use a sound is to export it from the
running app. An npm package that ships the player and lets a project `import` a sound would
be the biggest single improvement. The player is already standalone and dependency-free
(`lib/audio/export/snippet.ts`, `PLAYER_JS`), so this is packaging work, not audio work.

**Training data.** The library grows by curation: open the workbench, generate, keep what is
good, delete what is not, sort keeps into categories by ear. Every verdict trains the
generators. If you have ears and patience, this is the most valuable thing anyone can do.
Read [`docs/TRAINING.md`](docs/TRAINING.md) first, then see "Curation pull requests"
below for how it merges.

**Sounds.** New hand-written recipes for the library. Same path as training data: they enter
through the workbench (Editor, or Import to paste a recipe), land in the to-sort inbox, and
get sorted by ear.

**Stage animations.** The product's per-category stage widgets in
`components/product/SoundStage.tsx`. Character and motion work; the whole thing is CSS
keyframes and SVG.

**Generators.** New instruments, figures, archetypes and characters in `lib/audio/`. The
Atlas at `/workbench/atlas` renders everything each generator can say, live from the code
constants, so it is the map for this. Read [`docs/HOW-IT-WORKS.md`](docs/HOW-IT-WORKS.md)
first.

**Docs and the Atlas copy.** Anything in `docs/` that is stale or unclear.

The live work list is [`docs/TODO.md`](docs/TODO.md). Anything on it is fair game;
open an issue first if you are about to take a large item.

## Rules that are not negotiable

The full list is in CLAUDE.md. The ones contributors hit most:

- No audio library as an npm dependency. The Web Audio API is the engine; the code is a
  recipe player over it.
- No natural-language or LLM sound generation, anywhere.
- `Patch` (`lib/audio/patch.ts`) is the one recipe format shared by the player, every
  generator, and export. The player surface is a whitelist; do not add features to it
  without discussion.
- Sound numbers are permanent addresses. Nothing ever renumbers.
- Nothing is auto-tagged. Every keep enters the to-sort inbox with zero categories and is
  sorted by a human ear.
- Components are copied in as editable source, never added as component packages. Never
  Radix. `components/ui/btn.tsx` is read-only.
- No em dashes in repo text.

## Curation pull requests

Curation state is committed to git as data, so a curation contribution is a pull request
that touches `data/pool/*.json`. To keep those mergeable:

- Keep curation PRs to `data/pool/` only. Code changes go in separate PRs.
- Sound numbers are assigned at max+1 as you keep, and they are provisional until merged.
  Two curation PRs open at once will both claim the same numbers, and the second to merge
  gets renumbered on the way in. Once a number is on `main` it is permanent.
- Say in the PR what you curated: which tabs, which categories, roughly how many verdicts.
- Do not edit `data/reference/reference-sounds.json` in a curation PR. That file is
  imported reference data with its own attribution.

## Code pull requests

- `npm run lint` and a clean `npx tsc --noEmit` before opening.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `perf:`.
- Comments: near-zero. Say what the code cannot say itself, and nothing else. No change
  history in comments; git has it.
- If a change lands a feature, update `docs/ARCHITECTURE.md` in the same PR. If it
  finishes a TODO item, delete the item.
- Third-party code or data needs a row in `THIRD-PARTY-NOTICES.md` before it lands.

## License

MIT, see [LICENSE](LICENSE). By contributing you agree that your contribution is licensed
under the same terms.
