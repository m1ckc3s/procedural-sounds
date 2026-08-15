# TODO (live work only)

Rules: [CLAUDE.md](../.claude/CLAUDE.md). Product map: [ARCHITECTURE.md](ARCHITECTURE.md). Training + curation guide: [TRAINING.md](TRAINING.md). Parked research + history lives in the local archive (not published). Upstream port pin, if more player files ever need porting: commit `3a9fe941c589d26d3487db17f5183eb9cecf3258` (the repo and raw-URL pattern are in the local archive's port map).

Hygiene rule: when an item is done, delete it from this file entirely (no strikethroughs, no DONE markers) and append a dated line to the done log in the local archive (not published). This file holds only live work.


### 1 Attributed delete blame (replaces the exploration-floor idea, which is REJECTED)

**The problem, with numbers.** Op and archetype dice mute a cell at 5 deletes with zero
keeps, and `create.ts` states plainly that a muted cell is never drawn so it cannot revive
itself. That is a one-way door. It is also mostly firing on noise: at a 20% true keep rate,
the chance any given cell throws five straight deletes by luck alone is 0.8^5 = 33%, so
roughly a third of perfectly average cells get executed within their first five draws. The
damage today: transition Creations has 3 of its 9 ops dead, notification, hover and tap have
one each, and Invent has roughly 24 of 66 cells muted in success and 24 of 61 in hover.

**The rejected fix.** Adding an exploration floor so a condemned cell still draws about 1 in
50. Rejected, correctly: a swoosh does not belong in notification at ANY rate,
and a floor just makes the wrong sound rare instead of absent. It also treats the symptom.

**The real fix: stop guessing why a delete happened and ask.** `taste.ts` currently
anomaly-weights blame across 9 features, which is a heuristic for not knowing. The curator is
right there and can say. Shape:

- Fire a modal only on CONSEQUENTIAL deletes (a cell one delete from muting, or every Nth
  delete on a cell). Never on every delete: batches run 30-50 rows and throughput is what
  makes dice trustworthy at all.
- The modal lists the sound's actual features as rows (the layers by name, shimmer, envelope
  curve, waveform, duration, pitch band) with a play button per row that renders an ABLATION:
  the same patch with that one element removed or neutralized. Whichever removal fixes the
  sound identifies the culprit, which is a far better question than asking someone to name a
  frequency band. Layers solo, shimmer is a droppable effects array, curve is one flag, a
  waveform swaps to sine, so this is implementable with the existing player.
- Check the offenders, confirm, delete.

**What the checkboxes must change, and this is the whole point:**

- Blame the OP or ARCHETYPE ("swoosh") and the dice takes the full hit. Five of those and the
  cell mutes permanently and CORRECTLY, because a human said the move is wrong here.
- Blame only execution ("shimmer", "too long") and the dice takes NO hit at all. The curator
  just said the move was fine, so only those feature buckets get the blame.

That makes the hard mute accurate rather than removing it, which is why the floor is not
needed. Keep the mute.

**Do not un-mute the existing dead cells until this ships.** Re-earned verdicts are only
worth having once they can be attributed; un-muting first just re-runs the same coin flip.


## Current (parallel): product UI design pass (`app/`)

- Internal labels leak: "cross-breed", "wave-swap", and `g:*` archetype keys must never reach a user surface.
- UI sounds for the product's own UI: pick favorites for the buttons and the slider ticks, then wire them to the real controls.
- Step 3 of "Use it in your project" is a one-line `addEventListener` example. The clever version (attaching a sound to a button without hand-writing the wiring) is still open.
- Design tokens and polish: color tokens, line spacing, animations.

## export module (`lib/audio/export/`)

WAV and the JS snippet ship, wired to the stage buttons, every recent-sounds row and the
usage steps. MP3 is dropped for good (lamejs is uninstalled and the LGPL question died with
it). What is left:

- `toJson(patch)`: `JSON.stringify(patch, null, 2)`. Lands in `lib/audio/export/`, never beside it, so usage gating stays in one place.
- User-side waveform (feeds the design-pass waveform items above): the user always sees the MIX, never layers. Offline-render the whole patch to one buffer and draw one waveform shape. Per-layer stacked waveforms are a workbench-editor concept only.
- Deferred, likely forever: 24-bit, stereo, and the worker/fflate ZIP-pack machinery. A single-sound WAV encodes in about 1ms so no jank is possible, and the pack pattern is in the local archive's WAV-encoder study if it is ever needed.
- Snippet drift guard: `PLAYER_JS` is a hand-maintained copy of `synth.ts` plus `effects.ts`. Nothing checks that they agree. A test that renders both offline and compares buffers would close it.
