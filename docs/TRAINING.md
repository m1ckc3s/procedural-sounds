# Training and curation

The mechanics of the learning layers, exactly what each workbench tab's keep and delete
write to disk, and the working guide for a curation session. Concepts and vocabulary are
in [HOW-IT-WORKS.md](HOW-IT-WORKS.md); read that first.

## Which engine learns from what

| Engine | Workbench tab | Code | Learns from clicks? |
|---|---|---|---|
| **v1** (library draw + frozen variation) | Library, Variations | `generate()` in `randomize.ts` | NO. Improves through curation only: more keeps means a richer pool, and favorites draw 1.5x. |
| **v2** (structural remix of a seed) | Creations | `createFrom()` in `create.ts` | YES: op dice in `data/pool/creations-feedback.json`, plus shared taste. |
| **Invent** (hybrid / archetype / character lottery) | Invent | `invent()` in `invent.ts` | YES: cell dice in `data/pool/invent-feedback.json`, plus shared taste. |
| **Craft** (instrument x figure x space) | Craft | `craft.ts` | NO. A bad draw is a rule to edit. |
| **Wild** (ultra + remix, untrained) | Wild | `discovery()` in `wild.ts` | NO, by design. |
| **Experimental** (five engines, no category) | Prospect | `prospect.ts` | NO. Shares are hand-set. |

Only Creations and Invent train anything. Everything else grows the library.

## What each workbench tab's keep and delete actually write

Exactly what hits disk per button, per tab. Anything not listed is not written.

- **Variations. NOTHING ON THIS TAB TRAINS.** It has one button, ADD TO LIBRARY, which
  persists the sound (so it becomes a future seed) and writes NO dice and NO taste. There
  is deliberately no delete button: the frozen variation pass has no learnable parameters,
  so a verdict would have nothing to point at, and a delete button would read as training
  while writing nothing. To pass on a row, leave it and move on.
- **Creations.** KEEP and DELETE both write two things: the op dice in
  `creations-feedback.json` and the shared taste buckets in `taste.json`. KEEP additionally
  persists the sound to the library.
- **Invent.** Identical two-layer behavior, writing to `invent-feedback.json` plus the same
  shared taste file. KEEP additionally persists to the library.
- **Craft, Wild, Prospect.** KEEP persists the sound to the library and nothing else.
  Delete discards the row and records nothing.

**`taste.json` is SHARED between Creations and Invent.** Training one affects the other's
tournament, because both read the same per-category feature buckets. Only the dice files
are per-engine. So a run of Invent deletes in warning also reshapes what v2 serves in
warning, by design; that is the layer that carries the WHY.

**Every keep, from every tab, lands in the to-sort inbox with zero categories.** It is a
member of nothing until a human ticks its categories in the Library inspector and marks it
sorted. Nothing is auto-tagged and the machine proposes nothing.

## What one click is worth (Creations and Invent)

Every KEEP and every DELETE is one labeled verdict, equally informative. Delete-spamming
the bad ones is real training, not noise. Skipped or cleared rows teach nothing.

**One delete fires four analyses:**

1. The DICE tally lands against the recipe mold that made it, shifting future draw odds.
2. The patch is decomposed into FEATURE BUCKETS (register, waveform harshness, duration,
   attack, filter type, layer count, shimmer, noise, sweep) and the delete's blame is
   ANOMALY-WEIGHTED across them: blame lands on the features unusual among that category's
   keeps, not equally on all, because equal blame punishes the innocent half of a
   half-good sound and narrows the pool. The system learns WHY it was wrong.
3. The deleted patch's FINGERPRINT joins a memory ring (the twin ring, two hundred per
   category), and anything perceptually twin to it is silently discarded before the ear
   ever hears it. The neighborhood is banned, not just the sound.
4. COMPOUNDING: keeps become seeds, so the gene pool itself drifts toward the curator's
   ear.

The result is a learned model of one person's ear, entirely as human-readable tallies.

**How much one verdict moves things.** Weights use Laplace smoothing,
`(keeps + 1) / (keeps + deletes + 2)`:

- A fresh cell sits at 0.5 (or its prior: 0.5 natural, 0.35 plausible, 0.2 suspect).
- One DELETE on a fresh cell drops it to 0.333. One KEEP raises it to 0.667.
- On a mature cell with 10 keeps and 10 deletes, one more delete moves it about 4%.
- Five deletes with zero keeps mutes the cell to weight 0. Never drawn again until a human
  edits the JSON. One keep at any point disarms this permanently. No exploration floor.

**Early verdicts are enormously more powerful than late ones.** The first clicks in a
fresh category are shaping the space; the thousandth is fine-tuning it. Judge the opening
batches of a new category with full attention, and do not warm up on them.

**The product runs the same tournament** on v2: per pull it rolls several candidates,
skips anything twin to a deleted sound, and samples the winner proportional to taste and
novelty. So workbench training directly changes what end users hear.

## Curation working guide

### The goal, in one line

Grow every category with characters the curator likes, no ceiling. The library is the
training set and the future browsable catalog: if you like a sound, it gets saved, period.
The keep bar is ONE question: **"do I like it?"** It is NOT "is it distinct?" and NEVER
"is the category full?". Distinctness is the machinery's job (the Dedupe tab, and a later
similarity pass over draw weights). A quota-driven or similarity-driven delete of a good
sound poisons the dice, because delete means "this recipe is bad".

### Live counts live in the workbench, never in docs

Counts change every session. The Library chips are the truth, and every surface reads the
same membership formula. Do not record count snapshots in any doc; a stale snapshot
misleads every future session. Read the chips and work the worst gap first (the thinnest
and least-judged category).

### Keep vs delete: how to use it

- On **Creations and Invent**, a delete is exactly as informative as a keep for the dice.
  Keep what deserves to exist, delete the rest, and the learning is symmetric. Do NOT
  keep-all or delete-all to "send a signal"; the signal IS the honest per-row verdict.
- **Rows you never judge teach nothing.** "Clear" and "regenerate" discard unjudged rows
  silently. Judge every row of a batch before rerolling. A 30-row batch fully judged beats
  a 50-row batch half-skipped.
- On **Variations, Craft, Wild and Prospect**, keep what you like. Nothing else is
  recorded, so passing on a row costs nothing.
- **Favorites (stars):** hold off until a category is grown, then do one starring pass.
  Favorites weight the product draw, and starring mid-growth biases against the new stuff.

### The per-category workflow

For each category, worst gap first:

1. **Creations first**, where the leverage is: run 3-5 batches, judge every row. Every
   click moves a cell that is still young.
2. **Then Craft and Invent** for new DNA. Craft is the higher-quality inventor; Invent
   still trains and still surprises. Expect to keep roughly 10-25% of an Invent batch.
3. **Sort the inbox.** Open Library, work the to-sort chip, tick categories by ear, mark
   sorted. Nothing you kept is a member of anything until this step.
4. **Cross-aisle pass** occasionally: walk an aisle newest-first and check that the sounds
   there belong. For imports, veto misfits; for keeps, untick.
5. Repeat, then next category.

**Report patterns out loud.** "Bells are always too long", "every sawtooth creation in
warning is trash": the dice can only reweight existing recipes, so a pattern report
becomes a grammar or palette edit in code, which is the bigger lever. That loop (verdict
to dice, pattern to grammar) is the whole training system.

### The limit of clicking

Verdicts reweight recipes that already exist. They cannot add one. When a category's keep
rate plateaus, the lever is no longer the mouse, it is the grammar: say in words what is
missing or wrong and edit the generator's space in code. That is design-time collaboration
in code, NOT runtime natural-language sound generation, which stays forbidden.

### How much data the dice need

Each op or cell needs ~20+ verdicts before its weight means much; ~150-200 verdicts per
category makes the dice trustworthy. At 30-50 rows per batch, that is 4-6 fully-judged
batches per category. The feedback JSONs are the running tally and accumulate forever; read
progress from the Atlas matrices.

These numbers say when the DICE are trustworthy, which is not the same as when the output
is good. A category can carry several hundred verdicts, have well-settled dice, and still
have a low keep rate, because dice only reallocate weight over recipes that already exist.
Volume fixes noise; it does not fix a space that lacks the character you want. When more
verdicts stop moving the keep rate, the answer is a grammar edit or a different engine,
not another batch.
