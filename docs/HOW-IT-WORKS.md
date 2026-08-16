# How it works

The explainer. What the machine actually does, in plain language, plus a glossary for
every internal word. Read this before anything else in the repo.

[TRAINING.md](TRAINING.md) covers the learning system in more mechanical detail and is the
curation guide. [ARCHITECTURE.md](ARCHITECTURE.md) says what exists and where. This doc is
the concepts.

## Read this part first

**The engines are unrelated generators, not intensity settings on one generator.**

v1 copies a sound out of a library and nudges a few numbers. Wild writes a sound from
nothing and never touches the library. They share no code path. What separates the
engines is **distance from the curated library**, not "amount of randomness applied".

The practical consequence: there is no shared pipeline to fix. Making Wild less harsh does
nothing for Invent. Adding a move to the creator affects v2 only. The only machinery
genuinely shared by everything is downstream: the `Patch` format they all emit, the
ear-safety clamps, the play-time loudness leveling, and the perceptual distance metric.

## The shape of the whole system

A **`Patch`** is a recipe for one sound: a list of layers, each with a sound source (an
oscillator shape or noise), an envelope (how it swells and fades), a gain, an optional
filter, and optional effects. It is plain JSON. It is the only format in the system, and
everything below produces one.

`synth.ts` is the **recipe player**. Give it a patch and it builds the Web Audio graph and
plays it. It is deliberately dumb: it has no opinions and makes no choices. The Web Audio
API is the engine; this code is the recipes, the generators, and the taste.

Everything interesting is upstream of that: several generators, each with its own way of
inventing a patch. Two of them learn from human verdicts. The rest do not.

## The engines

The product ships three: **v1**, **v2**, and the **experimental** button. The rest live in
the workbench, where they fill the library the product draws from. v1 and v2 are the
internal names (the workbench sidebar labels tabs with them); the product's toggle calls
them **Familiar** and **Exotic**, since they are peers differing in how far from the
library a draw wanders, not versions.

| Engine | Where | Where it starts | What it can produce | Learns? |
|---|---|---|---|---|
| **v1** | product | the category's curated library | a library sound as-is, or the same sound nudged | no |
| **v2** | product | one library sound | that sound rebuilt with 1 to 3 structural edits | yes (op dice) |
| **Experimental** (Prospect) | product + workbench | five engines at once | anything, with no category | no |
| **Invent** | workbench | nothing, or two library sounds | a new character inside the category's rules, or a cross-bred child | yes (cell dice) |
| **Craft** | workbench | nothing | a coherent physical object: instrument x figure x space | no |
| **Wild** | workbench | nothing, or any two sounds from anywhere | something with no category and no rules | no |

### v1: the shelf, plus strict variations of the shelf

**v1 is two behaviors under one name, and it matters that you know this.** About a quarter
of the time it hands back a library sound exactly as it is. The rest of the time it hands
back a **variation**: the same sound with a few numbers nudged (pitch, timing, gain) and
its structure untouched.

So v1 is NOT just "the library". Roughly three pulls in four are procedurally generated,
under the strictest rules in the system: one tick up or one tick down from something a
human already approved. Favorited sounds are drawn slightly more often.

The variation pass is FROZEN by decision. Its job is to keep repeat listens from feeling
identical, not to invent anything, and its output is never saved back into the library.
The one thing bolted onto it since is a frequency rail: a variation may move a pitch, but
never publish one above the absolute ear-safety ceiling, and never above its own seed when
the seed already exceeds it. If v1 sounds bad, the fix is curation (cull the pool), not
code.

### v2: remixes of a library sound

Takes one library sound, untouched, and applies one to three **structural edits** drawn
from that category's palette: swap a waveform, add or remove a layer, retime the layers,
add a filter, add shimmer, and so on. The result keeps a family resemblance to its seed
but is genuinely a different sound.

Which edits get drawn is learned (see the dice, below). Each product pull quietly runs a
small tournament: several candidates, twins of anything you have rejected discarded, then
a weighted lottery that favors both your taste and novelty against the last few sounds
you heard.

### Invent: invention inside the category's rules

Every Invent pull is one of three things:

1. **A hybrid.** Two sounds from that same category are bred together, preferring parents
   from different origins. One parent donates the skeleton (how many notes, when they
   land, how long each rings), the other donates the voice (what it is made of, what
   register it sits in, what filter colors it). The child is never a replay of either.
2. **An archetype.** A hand-written per-category grammar, for example "a consonant chord
   rolled upward" or "a single low thud". No seed involved; it writes the sound itself.
3. **A character.** A hand-written musical figure (two tuned knocks, a harp gliss, a
   ball-drop settle) performed inside a **tamed contract** that tells it what key and what
   tone of voice to use, and proposes a base pitch inside a range chosen for that category.

The choice between them is one weighted lottery over every archetype and every character,
and every one of them is available to every category. A celebration shape in the error
category is not forbidden, only unlikely. See "priors are weights, not walls" below.

Invent is the older of the two invention engines and its keep rate is the reason Craft
exists. It still runs, still trains, and still feeds the library.

### Craft: instrument-first invention

Where Invent generates and then rescues, Craft casts. A draw picks a plausible
**instrument** (42 coherent single-note voices, wood, tine, metal, string, air and so on),
a plausible **figure** (the gesture shape), and a plausible **space** (the room), then
places the root so the whole thing already sits inside the category's register. Nothing is
generated and then clamped into shape; the design rules are the constraint.

There are no dice and no learning here on purpose. A bad Craft draw is a rule to edit, not
a verdict to file, and the Atlas shows every instrument, figure and space so the rule is
findable.

### Wild: the untrained one

Ignores the category entirely. Roughly seventy percent of the time it invents from nothing
using an **exotic contract**, which opens up strange scales and a wider pitch range that
the tamed engines never touch. The rest of the time it cross-breeds two sounds from
anywhere in the library, may draw archetypes off-leash, and then applies **warps**, which
are deliberately violent transformations.

It never learns, on purpose. That is its identity. It improves only when a human edits its
grammar, its palettes, or its finishing pass.

### Experimental: five engines behind one button

The product's eighth button, and the workbench's Prospect tab, are the same thing: one
press draws from five sources at once, with no category and no dials. Roughly: a v2-style
remix of an approved sound (~30%), a Craft cast (~25%), the character deck on a tamed
contract (~18%), two library parents crossed (~15%), and the untrained wildcard (~12%).
The shares are hand-set, not learned. It gets a light freshness pass (of three candidates
it keeps whichever is least like the last few you heard) but no verdict ever changes its
odds. Its keeps go down the ordinary path into the to-sort inbox with no category, since
the machine does not know what it made.

## The lifecycle

If someone asks what actually separates the engines, the useful answer is not six
definitions. It is one loop, because the engines feed each other.

**v1 is the vetted shelf, plus strict variations of it.** The shelf holds two kinds of
sound a listener cannot tell apart: sounds imported from open source packs to seed the
first library, and sounds this project generated that a human then kept. A keep is not just
a save; it goes through vetting, sorting into categories by ear, and sometimes
de-duplication. So the shelf is curated, not collected.

**v2 expands the shelf.** It changes what a sound IS rather than what it measures. It is
not RNG: the moves are hand-written, constrained per category, and steered by learned dice.
v2 can produce sounds v1 is incapable of producing no matter how many times you press it.

**Invent and Craft mostly do not inherit the shelf.** Their archetypes, characters,
instruments and figures are hand-written vocabularies, so what they make is genuinely new
DNA. Invent's hybrid path is the exception: it breeds two shelf sounds.

**Wild inherits everything above it** and adds what the tamed engines refuse: exotic
scales, a wider pitch range, warps, and cross-category breeding.

**The loop is the point.** Invent, Craft and Wild invent, a human keeps the good ones, the
curation flow vets and categorizes them, and they land on the shelf. From that moment v1
plays them, v2 expands them, and Invent can breed them as hybrid parents. The system feeds
its own inputs, which is why the library and the training data are the same asset, and
why a good curation session improves every engine downstream of it permanently.

## How the learning works

Only v2 (the Creations tab) and Invent learn. Every keep or delete in those two workbench
queues trains **two separate layers**, and they answer different questions.

**The dice answer "which recipe".** Each category keeps a tally of keeps and deletes for
every possible move: for v2 that is each structural edit, for Invent each archetype, each
character, and the hybrid option. Around 60 to 70 trainable cells per category (it varies by category). A cell's weight
is a smoothed keep rate, `(keeps + 1) / (keeps + deletes + 2)`, so a single keep reads as
"promising" rather than "perfect". Weights feed a proportional lottery.

**Priors are weights, not walls.** A cell with no verdicts yet starts at a hand-assigned
value: 0.5 if that combination is a natural fit, 0.35 if plausible, 0.2 if it looks like a
bad idea. The moment that exact cell gets one real verdict, the hand-assigned opinion is
gone forever, in either direction. So the system starts as a designer's judgment and
converts, cell by cell, into measured evidence.

**Mute.** Five deletes with zero keeps sets a cell's weight to exactly zero and it stops
being drawn. One keep at any point disarms this permanently. There is no exploration floor,
so a muted cell cannot revive itself; bringing one back means editing the JSON by hand.

**Taste answers "which qualities".** Separately from the dice, every patch is reduced to
nine feature buckets: pitch band, waveform harshness, duration, attack speed, filter type,
layer count, shimmer, noise, and pitch sweep. Each bucket keeps its own keep/delete tally,
so the system learns that you dislike piercing highs or long tails in general, across
every recipe at once. A bucket needs about four verdicts before it counts.

**Blame goes to the unusual feature.** A keep credits all nine buckets, since the whole
combination worked. A delete does not blame all nine equally, because that punished the
innocent features of a half-good sound and slowly narrowed everything toward one flavor.
Instead the blame is weighted by how *unusual* each feature is next to what you have been
keeping in that category. If almost all your kept success sounds are soft-waved, deleting
another soft-waved sound barely dents "soft" and dumps the blame on its rare piercing
pitch, which is probably what actually killed it. A feature with no keep history yet takes
zero blame, because with no keeps there is no notion of unusual.

**The twin ring.** Every sound you reject in the Creations or Invent queues is kept in
full, up to the most recent two hundred per category. Any new candidate that lands
perceptually close to one of them is thrown away before you ever hear it. You are
rejecting a neighborhood, not just a sound.

**The tournament.** Each product press of v2 quietly makes several candidates, discards
any that are twins of something you rejected, and then holds a weighted lottery among the
survivors. A candidate's weight combines how much your taste likes its qualities with how
different it is from the last few sounds you heard. It is a lottery rather than "pick the
best" on purpose: always picking the winner made every pull converge on the same safe
average.

**Where the signal comes from.** The product page writes nothing. All learning originates
in the workbench, from curation. The loop closes the other way: a kept sound is saved into
the pool and becomes parent material for v1, v2, and Invent hybrids.

Two files hold the dice, one per learning engine, and a single shared file holds the taste
buckets for both.

## How a sound gets its categories

Membership is one formula and there is never a second source for it:

**a keep = manual slots**
**an import = manual slots UNION gates MINUS vetoes**

Both are empty while the sound is still in the to-sort inbox.

**Nothing is auto-tagged.** Every keep, from every tab, enters the to-sort inbox with zero
categories, and the machine proposes nothing: an Invent draw kept under "notification" may
well have been kept because the ear heard an error, so suggesting an answer would decide
it. The curator ticks by ear, and "mark sorted" is the only thing that releases a sound
into the aisles, the chip counts, the seed pools and the product draws.

**Gates** are automatic guesses from the sound's own numbers, and they run on IMPORTS only.
An import arrives with no categories at all, so a guess is the only thing standing between
it and invisibility. Some gates are mechanical: under about 140 ms is hover material, short
with a fast attack is tap, and anything that MOVES (a pitch glide, a noise sweep, a filter
envelope) is a transition. Others are semantic guesses from shape (rising and clean
suggests success, harsh and short suggests error). Gates are deliberately over-inclusive:
a wrongly present import is audible during review and gets vetoed; a wrongly absent one is
invisible forever.

## Ear safety and loudness

**Ear-safety limits** are hand-calibrated clamps (pitch ceilings for clean and harsh
timbres, filter resonance, FM depth, a lowpass on bright saw and square) applied to
everything the machine generates. They are set by listening, on the workbench's Calibrate
tab, and never applied retroactively to sounds a human already kept; the library gets a
review queue instead.

**The prominence gate** is the load-bearing idea: harshness is contextual. A brief, quiet
high partial reads as sparkle rather than pain, so ceilings only bind layers loud enough
and long enough to actually offend. Two rules sit outside the gate and cannot be opened by
it: a buzz floor for low raw saw and square, and an **absolute ceiling** no tonal layer may
pass at any gain, because play-time leveling can boost a partial the gate called quiet back
to audible.

**Loudness leveling** never rewrites a patch. Each sound is measured offline, and a
play-time volume is solved against a master target with per-category offsets. Export bakes
that volume into the layer gains so the file plays exactly as the site did.

## Glossary

- **Patch** - the recipe for one sound. Plain JSON, the only format in the system.
- **Layer** - one voice inside a patch. Never call these "voices" in this codebase.
- **Contract** - the brief handed to a character before it performs: base pitch, scale, waveform, optional FM, attack speed, note spacing, and whether notes ring out or are cut. The same character performs differently under a different contract.
- **Tamed contract** - the polite brief used by Invent: consonant scales only, base pitch inside the range chosen for that category, mostly pure sine tones.
- **Exotic contract** - the Wild brief: odd scales (whole-tone, quartal, hirajoshi), a wider global pitch range, more FM.
- **Register band** - the pitch range that suits a category, the way a bass and a soprano have ranges. Error sounds sit low, notifications sit high.
- **Character** (called a *gesture* in the code) - a hand-written musical figure that needs a key handed to it. Around 37 of them, shared by Invent and Wild.
- **Archetype** - a hand-written complete recipe that supplies its own pitch and needs no contract. Around 32 of them, each with a home category, all available everywhere.
- **Instrument** - one of Craft's 42 coherent single-note voices, grouped by family (wood, tine, metal, string, body, transient, air, digital, sustained).
- **Figure** - Craft's gesture shape: how many strikes, when they land, how they decay.
- **Space** - Craft's room: dry, or one of a few reverb and shimmer treatments.
- **Motif** - hitting the same character two or three times at different scale degrees instead of once, so a lone ping becomes a phrase. Earlier hits are shortened and quieted so the last one lands.
- **Hybrid** - a child bred from two parents, one donating structure and the other donating timbre.
- **Warp** - a deliberately violent transformation, used only on the Wild path.
- **Dice** - the per-category keep/delete tallies that steer which recipe gets drawn.
- **Prior** - the starting weight for a cell that has no verdicts yet. Replaced permanently by real data after one verdict on that cell.
- **Muted cell** - a recipe that got five deletes and zero keeps. Weight zero, never drawn, revivable only by hand.
- **Feature bucket** - one of the nine qualities every patch is reduced to for the taste model.
- **Twin ring** - the memory of recently rejected sounds, used to discard lookalike candidates before they play. Capped at two hundred per category.
- **Tournament** - the multi-candidate weighted lottery run on each product press of v2.
- **Ear-safety limits** - hand-calibrated clamps applied to everything the machine generates. Not learned, and never applied retroactively to kept sounds.
- **Prominence gate** - the rule that ear-safety clamps only bind layers loud enough and long enough to actually offend.
- **Absolute ceiling** - the one pitch limit the prominence gate cannot open.
- **Gates** - the automatic category guesses run on imports.
- **Veto** - a human removing an import from a category the gates cast it into. Vetoes always win. Keeps are never gate-cast, so vetoes do not apply to them.
- **To-sort inbox** - where every keep waits, category-less, until a human sorts it.
- **Number** - a sound's permanent address, `#nnn`, assigned once and never changed or reused.

## Honest caveats

Things that are easy to get wrong.

- **The contract proposes a base pitch, it does not pin one.** Roughly a third of the characters re-clamp the pitch to their own register, because a wood block and a glass ping do not belong in the same octave.
- **The twin ring forgets.** It holds the most recent two hundred rejects per category, not everything forever.
- **Only queue rejections train.** Deleting a sound from the Library removes it from the pools but does not enter the twin ring. The twin ring is fed by the Creations and Invent review queues only.
- **Taming is mostly a no-op.** Only hover and tap declare gain or decay caps. For the other five categories the taming step does nothing, and the category constraint comes from the pitch band alone.
- **Priors evaporate one cell at a time.** At any moment the Invent lottery is a mixture of hand-authored opinion and measured evidence, cell by cell.
- **The product tournament and the workbench tournament are not identical.** The workbench adds hard distance guards against the existing library and against other rows in the same batch, but it picks the top-scoring candidate outright and has no novelty term. The product samples with novelty pressure.
