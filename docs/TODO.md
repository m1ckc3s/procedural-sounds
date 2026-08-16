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

