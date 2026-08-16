"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import referenceJson from "@/data/reference/reference-sounds.json";
import { CATEGORIES, type Category } from "@/lib/audio/categories";
import { createFrom, type OpStats } from "@/lib/audio/create";
import { layersOf, type Patch } from "@/lib/audio/patch";
import { newMemory, prospect, type ProspectSeed } from "@/lib/audio/prospect";
import {
  buildPool,
  generate,
  type ApprovedPools,
  type Exclusions,
  type ReferenceData,
  type SlotOverrides,
} from "@/lib/audio/randomize";
import { loudnessVolume, type LoudnessConfig } from "@/lib/audio/loudness";
import { CURATION } from "@/lib/curation";
import { measurePatch } from "@/lib/audio/offline";
import { patchDuration, playPatch } from "@/lib/audio/synth";
import { isIOS } from "@/lib/audio/context";
import { perceptualDistance } from "@/lib/audio/similarity";
import { isDeletedTwin, tasteScore, type TasteData, type TasteStore } from "@/lib/audio/taste";
import { invertPatch } from "@/lib/audio/invert";
import { Button } from "@/components/ui/btn";
import { ExportButtons } from "@/components/product/ExportButtons";
import { HistoryList } from "@/components/product/HistoryList";
import { RUNGS } from "@/lib/rungs";
import { EXPERIMENTAL_LABEL, soundName } from "@/lib/audio/naming";
import { SoundStage } from "@/components/product/SoundStage";
import { UsageSteps } from "@/components/product/UsageSteps";
import { useProductStore, type SoundEntry } from "@/lib/store";
import { APP_VERSION } from "@/lib/version";

const reference = referenceJson as unknown as ReferenceData;
const PRODUCT_CATEGORIES = CATEGORIES;
const REPO_URL = "https://github.com/m1ckc3s/procedural-sounds";
const X_URL = "https://x.com/mickces";

const EXPERIMENTAL_HINT =
  "Category-agnostic draws from five procedural engines at once. In testing. Press at your own risk.";

// Every remaining stop is curated and every one is governed by the category tabs, so
// there is no longer a zone split to encode.
const RUNG_ENTRIES = RUNGS.map((r, i) => ({ r, i }));

// The scope needs a number, not the display string: freqLabel can read "838→559 Hz".
function leadHz(patch: Patch): number {
  for (const layer of layersOf(patch)) {
    if (layer.source.type === "noise") continue;
    const f = layer.source.frequency;
    return typeof f === "number" ? f : f.start;
  }
  return 440;
}

function freqLabel(patch: Patch): string {
  for (const layer of layersOf(patch)) {
    if (layer.source.type === "noise") continue;
    const f = layer.source.frequency;
    if (typeof f === "number") return `${Math.round(f)} Hz`;
    return `${Math.round(f.start)}→${Math.round(f.end)} Hz`;
  }
  return "noise";
}

// Hoisted out of the component: react-hooks/purity forbids impure calls in anything it
// can reach from render, and these are only ever called from a click handler.
function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

// One button per SOURCE. The dot is a status indicator rather than decoration: it names
// the source at a glance and is the only per-source colour, so the grid reads as one
// control set instead of eight competing buttons.
//
// Every button rests in the SAME raised card treatment, selected or not. A filled
// selected state was tried and removed: these are eight peers to tap between freely, so
// darkening the last one pressed reads as a mode you are stuck in rather than a record
// of where you have been. Selection stays available to assistive tech via aria-pressed
// and is drawn as a ring only.
const SOURCE_DOT: Record<string, string> = {
  tap: "bg-sky-500",
  hover: "bg-violet-500",
  transition: "bg-cyan-500",
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  notification: "bg-blue-500",
  experimental: "bg-fuchsia-500",
};

// The experimental button wears a faint pastel gradient so it reads as a different KIND of
// button, not just the eighth in the grid. Gradient utilities set background-image, so they
// paint over bg-card and survive the hover background without extra overrides.
const EXPERIMENTAL_WASH =
  "bg-gradient-to-br from-fuchsia-100/70 via-card to-sky-100/60 dark:from-fuchsia-950/45 dark:via-card dark:to-sky-950/40";

// The horizontal sibling of the aside arrow under the grid. Drawn once pointing right and
// mirrored for the left-pointing case, so the pair stays symmetrical by construction.
function SketchArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 15"
      width="28"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 align-middle ${className ?? ""}`}
    >
      <path d="M2 10.5C8 5 16 3.5 29 5.5" />
      <path d="M23.5 1.8c2 1 3.8 2.2 5.5 3.7" />
      <path d="M23 10c2.2-1.2 4.2-2.7 6-4.5" />
    </svg>
  );
}

function SourceButton({
  label,
  dotKey,
  selected,
  onPick,
  wash,
}: {
  label: string;
  dotKey: string;
  selected: boolean;
  onPick: () => void;
  wash?: string;
}) {
  return (
    <Button
      shape="rounded"
      press="shrink"
      variant="ghost"
      className={`w-full justify-center gap-2 bg-card capitalize shadow-100 enabled:hover:bg-card enabled:hover:shadow-200 ${
        selected ? "ring-1 ring-foreground/15" : ""
      } ${wash ?? ""}`}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className={`relative flex shrink-0 items-center justify-center ${selected ? "size-2.5" : "size-1.5"}`}>
        {selected && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${SOURCE_DOT[dotKey] ?? "bg-muted-foreground"}`}
          />
        )}
        <span
          className={`relative inline-flex size-full rounded-full ${SOURCE_DOT[dotKey] ?? "bg-muted-foreground"}`}
        />
      </span>
      {label}
    </Button>
  );
}

// Same taste tournament as the workbench queues (minus the library-distance guards):
// 4 candidates per pull, deleted-twins skipped. Winner is SAMPLED ∝ tasteScore² - argmax
// collapsed every pull onto the taste mode. `avoid` deprioritizes candidates
// (anti-repeat) unless they're all that's left. `recent` adds novelty pressure
// a candidate perceptually close to a recent pull gets its weight cut, so
// the tournament stops re-electing near-copies of what just played - taste alone favors
// them because the taste buckets were trained on library-shaped keeps.
function pickBest<T extends { patch: Patch }>(
  make: () => T,
  catTaste: TasteData | undefined,
  avoid?: (c: T) => boolean,
  recent?: Patch[],
): T {
  const contenders: T[] = [];
  for (let i = 0; contenders.length < 4 && i < 16; i++) {
    const c = make();
    if (isDeletedTwin(catTaste, c.patch)) continue;
    contenders.push(c);
  }
  if (contenders.length === 0) return make();
  let field = avoid ? contenders.filter((c) => !avoid(c)) : contenders;
  if (field.length === 0) field = contenders;
  const novelty = (p: Patch) => {
    if (!recent || recent.length === 0) return 1;
    const d = Math.min(...recent.map((q) => perceptualDistance(p, q)));
    return Math.min(1, Math.max(0.3, d / 0.45));
  };
  const weights = field.map((c) => (tasteScore(catTaste, c.patch) * novelty(c.patch)) ** 2);
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < field.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return field[i];
  }
  return field[field.length - 1];
}

export default function Home() {
  // Initial state is the build-time snapshot, never empty defaults. Production has no API
  // (proxy.ts closes it), so whatever is here at first render is all a visitor ever gets:
  // seeding these with `{}` once shipped the raw imports, trashed sounds included, with
  // untrained dice, and every fetch below failed silently. See lib/curation.ts.
  const [slots, setSlots] = useState<SlotOverrides>(CURATION.slots);
  const [approved, setApproved] = useState<ApprovedPools>(CURATION.approved);
  const [deleted, setDeleted] = useState<string[]>(CURATION.deleted);
  const [duplicates, setDuplicates] = useState<string[]>(CURATION.duplicates);
  const [exclusions, setExclusions] = useState<Exclusions>(CURATION.exclusions);
  const [favorites, setFavorites] = useState<string[]>(CURATION.favorites);
  // Unsorted keeps are members of nothing, so the product never draws one before it has
  // been signed off in the workbench inbox.
  const [toSort, setToSort] = useState<string[]>(CURATION.toSort);
  const [opStats, setOpStats] = useState<OpStats>(CURATION.opStats);
  const [taste, setTaste] = useState<TasteStore>(CURATION.taste);
  const [loudness, setLoudness] = useState<LoudnessConfig>(CURATION.loudness);
  const [category, setCategory] = useState<Category>("tap");
  const [rung, setRung] = useState(0);
  // The eighth button. Its draws answer to no category, so they store `category: null`
  // and own the generic stage rather than any category widget.
  const [experimental, setExperimental] = useState(false);
  const prospectMemory = useRef(newMemory());
  const [stageFire, setStageFire] = useState(0);
  const current = useProductStore((s) => s.current);
  const setCurrent = useProductStore((s) => s.setCurrent);
  const history = useProductStore((s) => s.history);

  // Dev-only live refresh over the snapshot, so a workbench keep is audible on localhost
  // without a rebuild. Keyed on the SAME NODE_ENV test proxy.ts uses to close /api, so the
  // two cannot disagree: production never issues these requests. A failure is loud here
  // on purpose; the swallowed version of this is how the empty-state bug went unnoticed.
  useEffect(() => {
    localStorage.removeItem("ui-sounds-history");
    if (process.env.NODE_ENV === "production") return;
    const refresh = <T,>(route: string, apply: (v: T) => void) =>
      fetch(route)
        .then((r) => {
          if (!r.ok) throw new Error(`${route} ${r.status}`);
          return r.json() as Promise<T>;
        })
        .then(apply)
        .catch((e) => console.warn("[curation refresh]", e));
    refresh<SlotOverrides>("/api/slots", setSlots);
    refresh<ApprovedPools>("/api/pool", setApproved);
    refresh<string[]>("/api/deleted", setDeleted);
    refresh<string[]>("/api/duplicates", setDuplicates);
    refresh<Exclusions>("/api/exclusions", setExclusions);
    refresh<string[]>("/api/favorites", setFavorites);
    refresh<string[]>("/api/tosort", setToSort);
    refresh<OpStats>("/api/creations-feedback", setOpStats);
    refresh<TasteStore>("/api/taste", setTaste);
    refresh<{ config?: LoudnessConfig }>("/api/loudness-map", (s) => s?.config && setLoudness(s.config));
  }, []);

  const pool = useMemo(
    () => buildPool(reference, slots, approved, deleted, duplicates, exclusions, favorites, toSort),
    [slots, approved, deleted, duplicates, exclusions, favorites, toSort],
  );

  const play = (patch: Patch, volume?: number) => {
    void playPatch(patch, volume !== undefined ? { volume } : undefined);
  };


  // atCategory is passed when the caller knows the category better than state does: a tab
  // click generates in the category it just selected, and `category` has not re-rendered yet.
  const makeSound = (atRung: number, atCategory: Category): { patch: Patch; name: string; seedId?: string } | null => {
    const cat = atCategory;
    switch (RUNGS[atRung].key) {
      case "core": {
        const r = generate(pool, cat);
        return r && { patch: r.patch, name: soundName(cat, r.patch), seedId: r.seed.id };
      }
      case "orbit": {
        const seed = generate(pool, cat, 0);
        if (!seed) return null;
        const recent = history.slice(0, 6).map((e) => e.patch);
        const r = pickBest(() => createFrom(seed.patch, cat, opStats), taste[cat], undefined, recent);
        return { patch: r.patch, name: soundName(cat, r.patch) };
      }
    }
    return null;
  };

  // ONE draw per gesture, enforced synchronously. A controlled Tabs root can deliver
  // onValueChange more than once for a single click, and every delivery would otherwise
  // start its own draw and play it on top of the first. Comparing the incoming value to
  // state is not enough, because the duplicates arrive in the same tick, before any state
  // has committed. This ref flips before the first await, so a duplicate is dropped before
  // it can reach a generator.
  const drawing = useRef(false);
  // 500ms between plays, on every button that makes sound.
  const lastPlayAt = useRef(0);
  const debounced = () => {
    const now = nowMs();
    if (now - lastPlayAt.current < 500) return true;
    lastPlayAt.current = now;
    return false;
  };
  const onGenerate = async (atRung: number, atCategory: Category = category) => {
    if (drawing.current || debounced()) return;
    drawing.current = true;
    try {
      await draw(atRung, atCategory);
    } finally {
      drawing.current = false;
    }
  };

  // The experimental button shares the whole tail of `draw` (levelling, history entry,
  // stage fire) and differs only in what produced the patch and in carrying no category.
  const drawExperimental = async () => {
    const seeds: ProspectSeed[] = pool.all
      .filter((sound) => sound.playable)
      .map((sound) => ({ patch: sound.patch, label: sound.event }));
    const made = prospect(prospectMemory.current, seeds, opStats);
    let volume: number | undefined;
    if (!isIOS()) {
      try {
        const m = await measurePatch(made.patch);
        volume = loudnessVolume(loudness, m, null);
      } catch {}
    }
    setCurrent({
      id: newId(),
      name: soundName(EXPERIMENTAL_LABEL, made.patch),
      category: null,
      freqLabel: freqLabel(made.patch),
      duration: patchDuration(made.patch),
      patch: made.patch,
      at: nowMs(),
      ...(volume !== undefined ? { volume } : {}),
    });
    setExperimental(true);
    play(made.patch, volume);
    setStageFire((k) => k + 1);
  };

  const onGenerateExperimental = async () => {
    if (drawing.current || debounced()) return;
    drawing.current = true;
    try {
      await drawExperimental();
    } finally {
      drawing.current = false;
    }
  };

  const draw = async (atRung: number, atCategory: Category) => {
    const made = makeSound(atRung, atCategory);
    // Empty pool: still move the selection, or the button reads as dead.
    if (!made) {
      setRung(atRung);
      return;
    }
    // Loudness leveling: solve the play volume to the master target (+ the drawn category's
    // offset). A library draw levels from the surveyed measure of its seed (a variation nudges
    // numbers, not level). Only an engine draw needs a live offline render, and NEVER on iOS.
    let volume: number | undefined;
    const known = made.seedId ? CURATION.loudnessMeasures[made.seedId] : undefined;
    if (known) {
      volume = loudnessVolume(loudness, known, atCategory);
    } else if (!isIOS()) {
      try {
        const m = await measurePatch(made.patch);
        volume = loudnessVolume(loudness, m, atCategory);
      } catch {}
    }
    const entry: SoundEntry = {
      id: newId(),
      name: made.name,
      category: atCategory,
      freqLabel: freqLabel(made.patch),
      duration: patchDuration(made.patch),
      patch: made.patch,
      at: nowMs(),
      ...(volume !== undefined ? { volume } : {}),
    };
    // The zone and the sound MUST land in the same batch. Setting rung on click instead
    // left a window across `await measurePatch` where the zone had already flipped but
    // `current` was still the previous sound, so `stageMatch` failed and the idle astronaut
    // rendered between two real sounds. Nothing about the draw needs rung set early: every
    // generator path takes `atRung` directly.
    // setExperimental lives HERE, not at the top of draw: flipped early, the render during
    // `await measurePatch` had experimental=false while `current` was still the category-less
    // experimental sound, so stageMatch failed and the idle blob flashed between two sounds.
    // Same batching rule as rung, for the same reason.
    setExperimental(false);
    setRung(atRung);
    setCategory(atCategory);
    setCurrent(entry);
    play(made.patch, volume);
    setStageFire((k) => k + 1);
  };

  // The stage only owns sounds drawn in the active category, so a stale cross-category
  // current must not be replayable from it and history replays of other categories do
  // not animate it. An experimental draw carries no category, so it owns the generic
  // stage and only matches entries stored with `category: null`.
  const stageMatch = (cat: string | null) => (experimental ? cat === null : cat === category);

  const onReplay = (entry: SoundEntry) => {
    if (debounced()) return;
    play(entry.patch, entry.volume);
    if (stageMatch(entry.category)) setStageFire((k) => k + 1);
  };

  // Stage reverse control: inverted patch at the same leveled volume; no stageFire bump
  // (the stage animates the expand direction itself).
  const onReplayReverse = () => {
    if (debounced()) return;
    if (current) play(invertPatch(current.patch), current.volume);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Absolute, not fixed: the corner cluster scrolls away instead of sitting over the
          stage and the history list on a short viewport. */}
      <nav
        aria-label="Project links"
        className="absolute top-5 right-4 z-20 flex items-center gap-2 sm:right-5"
      >
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[11px] whitespace-nowrap text-muted-foreground shadow-100">
          v{APP_VERSION}
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          className="flex size-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-100 transition-colors hover:text-foreground hover:shadow-200"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="X profile"
          className="flex size-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-100 transition-colors hover:text-foreground hover:shadow-200"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </nav>

      {/* Below lg the header clears the absolute corner cluster (top-5 + h-9) instead of
          sliding under it. */}
      <header className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 pt-[76px] pb-6 lg:py-6">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-xs text-muted-foreground shadow-100 transition-colors hover:text-foreground"
        >
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium tracking-wide text-background uppercase">
            beta
          </span>
          Work in progress, open source and looking for collaborators
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-6">
        <section className="pt-6 pb-10 text-center">
          <h1 className="mx-auto max-w-2xl text-[44px] leading-none font-normal tracking-[-0.05em] text-balance md:text-[64px]">
            Procedural interface sounds, with taste
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[18px] leading-6 text-muted-foreground text-balance">
            Generated live, trained on thousands of hand-curated sounds and calibrated by
            ear, from a library that never stops growing
          </p>
          {/* The punchline gets its own line and full-strength ink: the product exists
              because every site ships the same handful of kit sounds. */}
          <p className="mx-auto mt-3 max-w-xl text-[18px] leading-6 text-balance">
            Never the same kit as every other site
          </p>
        </section>

        <section className="pb-16">
          <SoundStage
            category={category}
            orb={experimental}
            fireKey={stageFire}
            hasSound={!!current && stageMatch(current.category)}
            onTrigger={() => current && onReplay(current)}
            onTriggerReverse={onReplayReverse}
            meta={
              current && stageMatch(current.category)
                ? {
                    name: current.name,
                    freqLabel: current.freqLabel,
                    hz: leadHz(current.patch),
                    seconds: current.duration,
                    patch: current.patch,
                  }
                : undefined
            }
            footer={
              <span className="flex flex-1 items-center justify-center gap-3">
                <ExportButtons entry={current && stageMatch(current.category) ? current : null} />
              </span>
            }
          />

          {/* One button per SOURCE, not a scale. The stops were never degrees of one
              quantity, so a slider was always the wrong instrument: the seven categories
              are peers, and the eighth ignores category entirely. The familiar/exotic toggle sits
              under them because it modifies the seven, not the eighth. */}
          <div className="mx-auto mt-10 max-w-xl">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PRODUCT_CATEGORIES.map((cat) => (
                <SourceButton
                  key={cat}
                  label={cat}
                  dotKey={cat}
                  selected={!experimental && cat === category}
                  onPick={() => void onGenerate(rung, cat)}
                />
              ))}
              <SourceButton
                label="experimental"
                dotKey="experimental"
                selected={experimental}
                onPick={() => void onGenerateExperimental()}
                wash={EXPERIMENTAL_WASH}
              />
            </div>

            {/* The eighth button is the only one whose label does not say what it draws: the
                seven name a category and this one answers to none, so without an aside it
                reads as an eighth category. The right padding is half a grid column, which is
                what lands the arrowhead under the button rather than at the grid edge. */}
            <div className="mt-3 flex justify-end pr-[25%] sm:pr-[12.5%]">
              <span className="flex items-end gap-1.5 text-[12px] leading-tight italic text-muted-foreground">
                ignores the categories entirely
                <svg
                  viewBox="0 0 42 36"
                  width="36"
                  height="31"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                >
                  <path d="M3 30C13 34 24 31 30.5 21c2-3.1 3.6-7.4 5-14.5" />
                  <path d="M31 12.5c1.6-2 3.1-4 4.5-6" />
                  <path d="M38.5 13c-1.2-2.3-2.2-4.5-3-6.5" />
                </svg>
              </span>
            </div>

            {/* Both tier hints stay visible, flanking the toggle and pointing at their own
                half of it: the hint is what the tier IS, so hiding the unselected one made
                the toggle a mystery box. Selection is carried by text color alone. */}
            <div className={`mt-6 flex items-center justify-center gap-3 transition-opacity ${experimental ? "opacity-40" : ""}`}>
              <button
                type="button"
                onClick={() => void onGenerate(0, category)}
                className={`flex-1 cursor-pointer text-right text-[11px] leading-tight tracking-tight transition-colors ${
                  !experimental && rung === 0 ? "text-foreground" : "text-muted-foreground/70 hover:text-muted-foreground"
                }`}
              >
                {RUNGS[0].hint} <SketchArrow className="ml-1" />
              </button>
              <div
                role="group"
                aria-label="Generation tier"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-muted p-1"
              >
                {RUNG_ENTRIES.map(({ r, i }) => (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={!experimental && i === rung}
                    onClick={() => void onGenerate(i, category)}
                    className={`h-8 cursor-pointer rounded-lg px-4 text-[13px] transition-colors ${
                      !experimental && i === rung
                        ? "bg-surface-4 text-foreground shadow-surface-4"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.short}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void onGenerate(1, category)}
                className={`flex-1 cursor-pointer text-left text-[11px] leading-tight tracking-tight transition-colors ${
                  !experimental && rung === 1 ? "text-foreground" : "text-muted-foreground/70 hover:text-muted-foreground"
                }`}
              >
                <SketchArrow className="mr-1 -scale-x-100" /> {RUNGS[1].hint}
              </button>
            </div>

            {experimental && (
              <p className="mx-auto mt-3 max-w-md text-center text-[12px] leading-snug text-balance text-foreground">
                {EXPERIMENTAL_HINT}
              </p>
            )}
          </div>
        </section>

        <section className="pb-14">
          <h2 className="mb-6 text-[30px] leading-[1.1] font-normal tracking-[-0.05em]">Recent sounds</h2>
          <HistoryList onPlay={onReplay} />
        </section>

        <section className="pb-16">
          <h2 className="mb-6 text-[30px] leading-[1.1] font-normal tracking-[-0.05em]">
            Use it in your project
          </h2>
          <UsageSteps />
        </section>

        <section className="pb-16">
          <h2 className="mb-6 text-[30px] leading-[1.1] font-normal tracking-[-0.05em]">
            Work in progress
          </h2>
          <div className="max-w-2xl space-y-4 text-[15px] leading-7 text-muted-foreground">
            <p>
              This is an early beta. The core loop works, the library is growing, the generators
              are learning, and a lot of what is here is the first version of itself. It is
              open source and I would love for it to become a community project.
            </p>
            <p>
              Help is needed and appreciated on all of it: an npm package so a sound can be
              imported instead of exported, more training data (run it locally, open dev mode,
              generate, keep what is good), better generators and instruments, the front end and
              its animations, the docs and the Atlas.
            </p>
            <p>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
              >
                The repo is on GitHub
              </a>
              , and CONTRIBUTING.md there says where to start. Open a PR.
            </p>
          </div>
        </section>

      </main>

      <footer className="mt-10 border-t">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 py-8 text-center text-xs text-muted-foreground">

          <span className="flex items-center gap-4">
            {/* Cosmetic only; proxy.ts is what actually closes /workbench in production. */}
            {process.env.NODE_ENV !== "production" && (
              <a href="/workbench" className="transition-colors hover:text-foreground">
                dev mode
              </a>
            )}
            <a href="/licenses" className="transition-colors hover:text-foreground">
              third-party notices
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
