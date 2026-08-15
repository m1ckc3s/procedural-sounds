"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Pencil, Star, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter, useSearchParams } from "next/navigation";
import referenceJson from "@/data/reference/reference-sounds.json";
import numbersJson from "@/data/pool/numbers.json";
import {
  CATEGORIES,
  CATEGORY_USE_CASES,
  SUGGESTED_EVENT_CATEGORIES,
  UNSORTED_BUCKET,
  categoryId,
  type Category,
  type PoolBucket,
} from "@/lib/audio/categories";
import { type InventStats } from "@/lib/audio/compose";
import { ARCHETYPE_INFO, GESTURE_INFO } from "@/lib/audio/atlas";
import { invent } from "@/lib/audio/invent";
import { createFrom, type CreateOp, type OpStats } from "@/lib/audio/create";
import { gateCategories, type GatedCategory } from "@/lib/audio/gates";
import { invertPatch } from "@/lib/audio/invert";
import { layersOf, type Patch } from "@/lib/audio/patch";
import {
  FAMILY_THRESHOLD,
  classifyTraits,
  matchPercent,
  perceptualDistance,
  traitDiffs,
  withinVariationReach,
} from "@/lib/audio/similarity";
import { TweakPanel } from "@/components/TweakPanel";
import {
  buildPool,
  effectiveCategories,
  generate,
  soundCategories,
  type ApprovedPools,
  type Exclusions,
  type GenerateResult,
  type ReferenceData,
  type SlotOverrides,
} from "@/lib/audio/randomize";
import { isDeletedTwin, recordTasteVerdict, tasteScore, type TasteStore } from "@/lib/audio/taste";
import {
  DEFAULT_LIMITS,
  auditLimits,
  exposedTails,
  type ExposedTail,
  type LimitAudit,
  type Limits,
} from "@/lib/audio/limits";
import { discovery } from "@/lib/audio/wild";
import { DEFAULT_LOUDNESS, loudnessVolume, type LoudnessConfig } from "@/lib/audio/loudness";
import { measurePatch, type LoudnessMeasure } from "@/lib/audio/offline";
import { patchDuration, playPatch } from "@/lib/audio/synth";
import { SoundPreview } from "@/components/SoundPreview";
import { Toaster, toast } from "sonner";

const reference = referenceJson as unknown as ReferenceData;

interface Entry {
  id: string;
  num: number;
  pack: string;
  event: string;
  patch: Patch;
}

interface VarRow {
  key: string;
  patch: Patch;
  seedId: string;
  seedLabel: string;
  seedPatch: Patch;
  nearestLabel: string;
  nearestPct: number;
  ops?: CreateOp[];
}

interface InventRow {
  key: string;
  patch: Patch;
  archetype: string;
  parents: { label: string; patch: Patch }[];
  nearestLabel: string;
  nearestPct: number;
}

interface WildRow {
  key: string;
  patch: Patch;
  label: string;
  nearestLabel: string;
  nearestPct: number;
}

// Numbers come from the PERMANENT REGISTRY (data/pool/numbers.json, id -> number,
// append-only, one sequence over imports + keeps). Position-derived numbering is dead:
// new sounds always take max+1 at the end and nothing ever shifts. New import scripts
// must write their registry entries; keeps register via POST /api/numbers.
const NUMBERS: Record<string, number> = numbersJson;

const ENTRIES: Entry[] = (() => {
  const out: Entry[] = [];
  for (const [pack, { sounds }] of Object.entries(reference)) {
    for (const [event, patch] of Object.entries(sounds)) {
      const id = `${pack}/${event}`;
      out.push({ id, num: NUMBERS[id] ?? 0, pack, event, patch });
    }
  }
  return out;
})();

const ENTRY_BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
// Gate results are pure functions of the patch + event name; compute once for all entries.
const GATES = new Map(ENTRIES.map((e) => [e.id, gateCategories(e.patch, e.event)]));

// Directional-pair detection by name, within a pack (open/close, enter/exit, ...).
const PAIR_TOKENS: [string, string][] = [
  ["open", "close"],
  ["enter", "exit"],
  ["expand", "collapse"],
  ["on", "off"],
  ["up", "down"],
  ["forward", "backward"],
  ["in", "out"],
  ["show", "hide"],
  ["send", "receive"],
  ["start", "end"],
];

function counterpartId(e: Entry): string | null {
  const parts = e.event.split(/([-.])/);
  for (const [a, b] of PAIR_TOKENS) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const i = parts.indexOf(x);
      if (i >= 0) {
        const c = [...parts];
        c[i] = y;
        const id = `${e.pack}/${c.join("")}`;
        if (ENTRY_BY_ID.has(id)) return id;
      }
    }
  }
  return null;
}
function pid(num: number): string {
  return `#${String(num).padStart(3, "0")}`;
}

// Local (not UTC) YYYY-MM-DD, so "today" matches the curator's wall clock.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Probe ladders for the Calibrate tab: each row isolates ONE harshness dimension with
// synthesized probes; the curator marks the first unpleasant step and the LAST PLEASANT value
// persists to data/pool/limits.json (enforced in create/compose/wild via enforceLimits).
interface ProbeRow {
  key: keyof Limits;
  title: string;
  desc: string;
  unit: string;
  // Continuous range, replacing the old fixed step list: the real threshold almost always
  // sits between two arbitrary steps, and the floors are set well below the current values
  // so a ceiling can always be tuned DOWN rather than only chosen from a menu.
  min: number;
  max: number;
  stepSize: number;
  down?: boolean;
  probe: (v: number) => Patch;
}

const PROBE_ROWS: ProbeRow[] = [
  {
    key: "sineCeilingHz",
    title: "Pitch ceiling - clean timbre",
    desc: "A short sine ding stepping up in pitch. Applies to sine/triangle layers.",
    unit: "Hz",
    min: 600,
    max: 5200,
    stepSize: 50,
    probe: (f) => ({
      source: { type: "sine", frequency: f },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.15,
    }),
  },
  {
    key: "harshCeilingHz",
    title: "Pitch ceiling - harsh timbre",
    desc: "A raw sawtooth stepping up in pitch. Applies to sawtooth/square layers.",
    unit: "Hz",
    min: 200,
    max: 2400,
    stepSize: 25,
    probe: (f) => ({
      source: { type: "sawtooth", frequency: f },
      envelope: { attack: 0.003, decay: 0.18, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.09,
    }),
  },
  {
    key: "sawOpenLowpassHz",
    title: "Brightness - lowpass opening on sawtooth",
    desc: "Same 500Hz sawtooth, filter opening wider each step. Caps how bright saw/square may get.",
    unit: "Hz cutoff",
    min: 600,
    max: 6000,
    stepSize: 100,
    probe: (c) => ({
      source: { type: "sawtooth", frequency: 500 },
      filter: { type: "lowpass", frequency: c },
      envelope: { attack: 0.003, decay: 0.25, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.11,
    }),
  },
  {
    key: "maxFilterQ",
    title: "Resonance - filter Q",
    desc: "Fixed note, resonance rising each step (the whistle/ring around the cutoff).",
    unit: "Q",
    min: 0.5,
    max: 16,
    stepSize: 0.5,
    probe: (q) => ({
      source: { type: "sawtooth", frequency: 400 },
      filter: { type: "lowpass", frequency: 1200, Q: q },
      envelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.12,
    }),
  },
  {
    key: "maxFmDepth",
    title: "FM clang - modulation depth",
    desc: "A 550Hz tone with inharmonic FM deepening each step (metallic/clangy overtones). Library uses 30-400.",
    unit: "depth",
    min: 20,
    max: 800,
    stepSize: 10,
    probe: (d) => ({
      source: { type: "sine", frequency: 550, fm: { ratio: 2.7, depth: d } },
      envelope: { attack: 0.003, decay: 0.28, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.14,
    }),
  },
  {
    key: "harshFloorHz",
    title: "Buzz floor - raw sawtooth going DOWN",
    desc: "A raw sawtooth stepping DOWN in pitch (found via #792). Below your floor, saw/square layers become triangle.",
    unit: "Hz floor",
    min: 60,
    max: 500,
    stepSize: 10,
    down: true,
    probe: (f) => ({
      source: { type: "sawtooth", frequency: f },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.12,
    }),
  },
  {
    key: "noiseBandCeilingHz",
    title: "Noise sharpness - tick brightness",
    desc: "A noise tick with its band center rising. Caps bandpass/highpass centers on noise layers.",
    unit: "Hz center",
    min: 800,
    max: 6000,
    stepSize: 100,
    probe: (c) => ({
      source: { type: "noise", color: "white" },
      filter: { type: "bandpass", frequency: c, Q: 1.5 },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0, curve: "ramp" },
      gain: 0.13,
    }),
  },
];

// Retrigger guard: a sound cannot be replayed until it finishes.
const busyUntil = new Map<string, number>();

const DEDUPE_MIN_PCT = 70;

// Shared by every generation queue so a keep looks like a keep on all four tabs.
const PLAY_BTN =
  "shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 font-bold text-white transition-opacity hover:opacity-80 dark:bg-neutral-200 dark:text-black";
const KEEP_BTN =
  "shrink-0 rounded-md border border-emerald-600 px-2.5 py-1 font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400";
const DEL_BTN =
  "shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-red-500 transition-colors hover:border-red-500 hover:bg-red-500/10 dark:border-red-900";
const SEED_BTN =
  "min-w-0 truncate rounded-md border border-neutral-200 px-2 py-1 text-left text-neutral-500 transition-colors hover:border-neutral-400 dark:border-neutral-800";
const BATCH_PRIMARY_BTN =
  "shrink-0 rounded-md bg-black px-3 py-1.5 font-bold text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black";
const BATCH_SECONDARY_BTN =
  "shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 font-medium text-neutral-600 transition-colors hover:border-neutral-500 hover:bg-neutral-500/10 dark:border-neutral-700 dark:text-neutral-300";
function playGuarded(key: string, patch: Patch, volume?: number) {
  const now = Date.now();
  if (now < (busyUntil.get(key) ?? 0)) return;
  busyUntil.set(key, now + Math.min(patchDuration(patch), 3) * 1000);
  void playPatch(patch, volume !== undefined ? { volume } : undefined);
}

// Fresh (generated) patches get measured once and cached by object identity; library
// sounds come from the survey map. Calibrate probes NEVER go through leveling.
const freshMeasureCache = new WeakMap<Patch, { winDb: number; peakDb: number }>();

const TABS = ["review", "dedupe", "editor", "variations", "creations", "invent", "wild", "calibrate", "trash"] as const;
type Tab = (typeof TABS)[number];

const TAB_TITLE: Record<Tab, string> = {
  review: "Library",
  dedupe: "Dedupe",
  trash: "Trash",
  editor: "Editor",
  variations: "Variations",
  creations: "Creations (RL)",
  invent: "Invent (RL)",
  wild: "Wild",
  calibrate: "Calibrate",
};

// Page subtitles, one per tab, rendered by the shared header so every workbench page
// matches the atlas layout.
const TAB_INTRO: Record<Tab, React.ReactNode> = {
  review: (
    <>
      THE LIBRARY: every member (imports + your keeps). Click a row to play it and inspect
      it on the right; edit opens a copy in the Editor. The to sort chip is the inbox - new
      keeps land there until you sign off their categories.
    </>
  ),
  dedupe: (
    <>
      Every family pair in the library, worst first. Violet = 🎲 one Launchpad variation draw can
      mint one from the other (keeping both duplicates the library); amber =
      near-parameter-identical; white = same family, your ear decides. dupe/delete move a
      sound to Trash and its rows vanish; &quot;not similar&quot; hides a pair permanently.
    </>
  ),
  editor: (
    <>
      Open a sound by number, hit randomize, or use &quot;edit&quot; on any library row.
      Keeping saves a NEW sound to the to-sort inbox; it joins no category until you sign it off.
    </>
  ),
  variations: (
    <>
      VARIATIONS = the same sound with its numbers nudged: pitch, timing and gain move,
      structure never does. The pass is FROZEN, so it has no learnable parameters and
      nothing here trains anything - which is why there is one button and no delete.
      Adding to the library is the only effect a click has. Behind Launchpad in the
      product, where its job is stopping repeat listens from sounding identical, not
      inventing characters. Grow the library in Creations and Invent instead.
    </>
  ),
  creations: (
    <>
      CREATIONS = a structural REMIX of one curated seed: new layers, waveform swaps, curve
      flips, shimmer. A cousin of something you own rather than a child of it, so every draw
      inherits a quality floor from a sound a human already approved. Behind Orbit. Keep AND
      delete each train two layers: the op dice (WHICH move) and the shared feature taste
      (WHY), which runs a 4-candidate tournament per row and hard-rejects twins of anything
      you deleted. Deleting is as informative as keeping, so judge every row.
    </>
  ),
  invent: (
    <>
      INVENT = no parent. Sounds written from design grammars (consonant intervals, gesture
      durations, layer roles) inside the category&apos;s register band, so this is the only
      path to a character that has never existed. 30% arrive as cross-pack hybrids (skeleton
      from one parent, timbre from another). Behind Galaxy. Keep AND delete both train the
      archetype dice plus the shared taste buckets. Expect to keep 10-25%: it earns quality
      from scratch every draw, where Creations inherits it. It pays off where the bar is
      LEGIBILITY (error, warning) and struggles where the bar is beauty (success,
      notification, transition).
    </>
  ),
  wild: (
    <>
      One discovery pool, one dial, behind Singularity. WILD = remix off-leash: any
      category&apos;s archetype, cross-category hybrids and warp ops, run through ultra&apos;s
      finishing pass. ULTRA = de-novo invention under a musical contract (one scale, one
      gesture, one timbre, one grid). The dial sets the ultra share; the product ships one
      fixed blend, so use this to find the ratio that earns it. Strange without rules, where
      Invent is strange but musical. NOTHING here trains anything, no dice and no taste, so
      there is no delete: skipping a row and rejecting it are the same act. Keeps land in
      to-sort like every other keep.
    </>
  ),
  calibrate: (
    <>
      Loudness levels sounds at PLAY time; the ceilings clamp what the generators are allowed
      to make. Neither ever rewrites a patch, and neither touches the library.
    </>
  ),
  trash: (
    <>
      Everything marked out of the library: duplicate = fine sound, redundant copy; deleted =
      bad sound. Both are excluded from every pool. Restore lives only here.
    </>
  ),
};
export default function Workbench() {
  return (
    <Suspense>
      <WorkbenchInner />
    </Suspense>
  );
}

function WorkbenchInner() {
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "review";
  const [slots, setSlots] = useState<SlotOverrides>({});
  const [approved, setApproved] = useState<ApprovedPools>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Exclusions>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toSort, setToSort] = useState<string[]>([]);
  const [reviewCat, setReviewCat] = useState<Category | "tosort" | "limits" | "tails">("tosort");
  // Library number search: digits prefix-match permanent numbers across the WHOLE
  // library regardless of the selected chip; non-empty query overrides the list view.
  const [libSearch, setLibSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genCategory, setGenCategory] = useState<Category | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [draft, setDraft] = useState<Patch | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editorSource, setEditorSource] = useState<string | null>(null);
  // The sound the draft was opened FROM, kept whole so the Editor can A/B the edit against
  // it and offer an in-place replace. Only set when the draft came from a real sound;
  // a randomize draw has no origin to compare against or overwrite.
  const [editorOrigin, setEditorOrigin] = useState<{ id: string; label: string; patch: Patch } | null>(null);
  // Replace is the one destructive action with no undo (delete has Trash), so it is gated
  // behind a confirm rather than being a single click next to Keep.
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [editorNumQuery, setEditorNumQuery] = useState("");
  const [dismissedPairs, setDismissedPairs] = useState<string[]>([]);
  const tweakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [varCategory, setVarCategory] = useState<Category | null>(null);
  const [varBatch, setVarBatch] = useState<VarRow[]>([]);
  const varSeq = useRef(0);
  const [createCategory, setCreateCategory] = useState<Category | null>(null);
  const [createBatchRows, setCreateBatchRows] = useState<VarRow[]>([]);
  const [opStats, setOpStats] = useState<OpStats>({});
  const [inventCategory, setInventCategory] = useState<Category | null>(null);
  const [inventRows, setInventRows] = useState<InventRow[]>([]);
  const [inventStats, setInventStats] = useState<InventStats>({});
  const [pendingRetire, setPendingRetire] = useState<InventRow | null>(null);
  // Total training volume per category (all keys: archetypes + characters + hybrid for
  // Galaxy, ops for Orbit) - the "how much have I taught this category" number.
  const inventVerdicts = (cat: Category) =>
    Object.values(inventStats[cat] ?? {}).reduce((s, v) => s + v.k + v.d, 0);
  const opVerdicts = (cat: Category) =>
    Object.values(opStats[cat] ?? {}).reduce((s, v) => s + v.k + v.d, 0);
  const [wildRows, setWildRows] = useState<WildRow[]>([]);
  const [wildUltraShare, setWildUltraShare] = useState(70);
  const [loudnessStatus, setLoudnessStatus] = useState<string | null>(null);
  const [loudnessCfg, setLoudnessCfg] = useState<LoudnessConfig>(DEFAULT_LOUDNESS);
  const loudMeasures = useRef<Record<string, { winDb: number; peakDb: number }>>({});

  useEffect(() => {
    fetch("/api/loudness-map")
      .then((r) => r.json())
      .then((s) => {
        if (s?.config) setLoudnessCfg(s.config);
        if (s?.measures) loudMeasures.current = s.measures;
      })
      .catch(() => {});
  }, []);

  const saveLoudnessCfg = (next: LoudnessConfig) => {
    setLoudnessCfg(next);
    void fetch("/api/loudness-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: next }),
    });
  };

  // Leveled play for every audition surface: library ids resolve via the survey map,
  // fresh generated patches get measured once (object-identity cache). Falls back to
  // raw playback if measuring fails. Calibrate probes bypass this on purpose.
  // Every play is leveled, INCLUDING the first one. An unmeasured sound used to play raw
  // and only level from the second click, which is why a fresh row auditioned quiet and
  // then jumped to full volume on the replay - the curator was judging two different
  // loudnesses of the same sound. The offline measure is a few ms.
  //
  // playSeq is what keeps the old spam-click bug fixed: it advances on EVERY call, so a
  // measure still in flight when a newer play starts is stale and drops itself instead of
  // landing late on top of the sound actually asked for.
  const playSeq = useRef(0);
  const playLev = (key: string, patch: Patch, opts?: { id?: string; cat?: Category | null }) => {
    const token = ++playSeq.current;
    const level = (m: { winDb: number; peakDb: number }) =>
      playGuarded(key, patch, loudnessVolume(loudnessCfg, m, opts?.cat ?? null));
    const known = (opts?.id ? loudMeasures.current[opts.id] : undefined) ?? freshMeasureCache.get(patch);
    if (known) {
      level(known);
      return;
    }
    void measurePatch(patch)
      .then((m) => {
        freshMeasureCache.set(patch, m);
        if (token === playSeq.current) level(m);
      })
      .catch(() => {
        if (token === playSeq.current) playGuarded(key, patch);
      });
  };
  const [limits, setLimits] = useState<Partial<Limits>>({});
  // Uncommitted slider positions. Dragging never writes: a stray drag must not silently
  // overwrite a ceiling that was tuned by ear, so the value is auditioned first and only
  // "set" commits it.
  const [pendingLimits, setPendingLimits] = useState<Partial<Record<keyof Limits, number>>>({});
  const [limitApproved, setLimitApproved] = useState<Record<string, Partial<Limits>>>({});
  const [tailApproved, setTailApproved] = useState<Record<string, { sineCeilingHz: number; harshCeilingHz: number }>>({});
  const [numbersLive, setNumbersLive] = useState<Record<string, number>>(NUMBERS);

  const saveLimit = (key: keyof Limits, value: number | null) => {
    setLimits((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
    void fetch("/api/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
  };
  const [taste, setTaste] = useState<TasteStore>({});
  // Values unread since Library became the browse surface; the setters keep the
  // origin/kept-date records persisting on every keep.
  const [, setOrigins] = useState<Record<string, string>>({});
  const [, setKeptDates] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/slots").then((r) => r.json()).then(setSlots).catch(() => {});
    fetch("/api/pool").then((r) => r.json()).then(setApproved).catch(() => {});
    fetch("/api/deleted").then((r) => r.json()).then(setDeleted).catch(() => {});
    fetch("/api/duplicates").then((r) => r.json()).then(setDuplicates).catch(() => {});
    fetch("/api/exclusions").then((r) => r.json()).then(setExclusions).catch(() => {});
    fetch("/api/favorites").then((r) => r.json()).then(setFavorites).catch(() => {});
    fetch("/api/tosort").then((r) => r.json()).then(setToSort).catch(() => {});
    fetch("/api/creations-feedback").then((r) => r.json()).then(setOpStats).catch(() => {});
    fetch("/api/invent-feedback").then((r) => r.json()).then(setInventStats).catch(() => {});
    fetch("/api/origins").then((r) => r.json()).then(setOrigins).catch(() => {});
    fetch("/api/kept-dates").then((r) => r.json()).then(setKeptDates).catch(() => {});
    fetch("/api/taste").then((r) => r.json()).then(setTaste).catch(() => {});
    fetch("/api/limits").then((r) => r.json()).then(setLimits).catch(() => {});
    fetch("/api/limit-approved").then((r) => r.json()).then(setLimitApproved).catch(() => {});
    fetch("/api/tail-approved").then((r) => r.json()).then(setTailApproved).catch(() => {});
    fetch("/api/similar-dismissed").then((r) => r.json()).then(setDismissedPairs).catch(() => {});
  }, []);

  const pool = useMemo(
    () => buildPool(reference, slots, approved, deleted, duplicates, exclusions, favorites, toSort),
    [slots, approved, deleted, duplicates, exclusions, favorites, toSort],
  );
  const deletedSet = useMemo(() => new Set(deleted), [deleted]);
  const dupSet = useMemo(() => new Set(duplicates), [duplicates]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const toSortSet = useMemo(() => new Set(toSort), [toSort]);

  const setToSortState = (id: string, tosort: boolean) => {
    setToSort((prev) => (tosort ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    void fetch("/api/tosort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tosort }),
    });
  };

  // Kept sounds read their permanent number from the registry (numbersLive = static
  // backfill + this session's POST assignments), sorted by number so display order stays
  // chronological. A keep missing from the registry renders as #0 until its POST lands.
  const curatedEntries: Entry[] = useMemo(() => {
    const raw: Entry[] = [];
    for (const [cat, patches] of Object.entries(approved)) {
      (patches ?? []).forEach((patch, i) => {
        const id = `pool/${cat}/${i}`;
        raw.push({ id, num: numbersLive[id] ?? 0, pack: "curated", event: `${cat} ${i + 1}`, patch });
      });
    }
    raw.sort((a, b) => a.num - b.num);
    return raw;
  }, [approved, numbersLive]);
  const entryById = useMemo(
    () => new Map([...ENTRY_BY_ID, ...curatedEntries.map((e) => [e.id, e] as const)]),
    [curatedEntries],
  );

  // The inbox: every alive sound with zero effective categories. The orphan
  // clause is the safety net - removing a sound's last category must land it here, never
  // lose it (an orphaned tap was once unreachable from every view).
  const inboxEntries = useMemo(
    () =>
      [...ENTRIES, ...curatedEntries]
        .filter((e) => {
          if (deletedSet.has(e.id) || dupSet.has(e.id)) return false;
          const cats = effectiveCategories(e.id, e.patch, slots, exclusions, toSortSet);
          return cats.length === 0;
        })
        .sort((a, b) => {
          const ac = a.pack === "curated" ? 1 : 0;
          const bc = b.pack === "curated" ? 1 : 0;
          if (ac !== bc) return bc - ac;
          return ac ? b.num - a.num : a.num - b.num;
        }),
    [curatedEntries, deletedSet, dupSet, slots, exclusions, toSortSet],
  );

  // Live ear-safety queue: every alive sound whose recipe enforceLimits would change, minus
  // anything already waved through UNDER THE CURRENT ceilings. Approving stores the ceilings
  // it was approved against, so tightening one re-surfaces its approvals automatically.
  const effectiveLimits = useMemo<Limits>(() => ({ ...DEFAULT_LIMITS, ...limits }), [limits]);
  const limitReview = useMemo(() => {
    const sameCeilings = (a: Partial<Limits>) =>
      (Object.keys(effectiveLimits) as (keyof Limits)[]).every((k) => a?.[k] === effectiveLimits[k]);
    const out: { e: Entry; audit: LimitAudit }[] = [];
    for (const e of [...ENTRIES, ...curatedEntries]) {
      if (deletedSet.has(e.id) || dupSet.has(e.id)) continue;
      if (sameCeilings(limitApproved[e.id] ?? {})) continue;
      const audit = auditLimits(e.patch, effectiveLimits);
      if (audit.exceeds) out.push({ e, audit });
    }
    return out;
  }, [curatedEntries, deletedSet, dupSet, effectiveLimits, limitApproved]);

  // Everything the ABSOLUTE ceiling alone would clamp, recomputed live from the slider's
  // uncommitted value. Deliberately not auditLimits: that answers "does any rule touch this",
  // and the question here is narrower, "what does THIS rule cost me", so the list empties as
  // the slider is raised and the before/after pair on each row is the whole evidence.
  const absCeiling =
    pendingLimits.absoluteCeilingHz ?? limits.absoluteCeilingHz ?? DEFAULT_LIMITS.absoluteCeilingHz;
  const absReview = useMemo(() => {
    const topHz = (f: number | { start: number; end: number }) =>
      typeof f === "number" ? f : Math.max(f.start, f.end);
    const out: { e: Entry; fixed: Patch; hz: number }[] = [];
    for (const e of [...ENTRIES, ...curatedEntries]) {
      if (deletedSet.has(e.id) || dupSet.has(e.id)) continue;
      let hi = 0;
      for (const l of layersOf(e.patch)) {
        if (l.source.type === "noise") continue;
        hi = Math.max(hi, topHz(l.source.frequency));
      }
      if (hi <= absCeiling) continue;
      const fixed = structuredClone(e.patch);
      for (const l of layersOf(fixed)) {
        if (l.source.type === "noise") continue;
        const f = l.source.frequency;
        l.source.frequency =
          typeof f === "number"
            ? Math.min(f, absCeiling)
            : { ...f, start: Math.min(f.start, absCeiling), end: Math.min(f.end, absCeiling) };
      }
      out.push({ e, fixed, hz: Math.round(hi) });
    }
    return out.sort((a, b) => b.hz - a.hz);
  }, [absCeiling, curatedEntries, deletedSet, dupSet]);

  // Sounds carrying a chime that arrives after the body has decayed. Nothing is rewritten:
  // the fix is a judgement call per sound, so this is a worklist for the Editor.
  const tailReview = useMemo(() => {
    const out: { e: Entry; tails: ExposedTail[]; hz: number }[] = [];
    for (const e of [...ENTRIES, ...curatedEntries]) {
      if (deletedSet.has(e.id) || dupSet.has(e.id)) continue;
      const ok = tailApproved[e.id];
      // Kept UNDER these two ceilings. Lower either and the row comes back, because the
      // judgement was "fine at 1500", not "fine forever".
      if (
        ok &&
        ok.sineCeilingHz <= effectiveLimits.sineCeilingHz &&
        ok.harshCeilingHz <= effectiveLimits.harshCeilingHz
      ) {
        continue;
      }
      const tails = exposedTails(e.patch, effectiveLimits);
      if (tails.length === 0) continue;
      out.push({ e, tails, hz: Math.max(...tails.map((t) => t.hz)) });
    }
    return out.sort((a, b) => b.hz - a.hz);
  }, [curatedEntries, deletedSet, dupSet, effectiveLimits, tailApproved]);

  const keepTail = (id: string) => {
    const ceilings = {
      sineCeilingHz: effectiveLimits.sineCeilingHz,
      harshCeilingHz: effectiveLimits.harshCeilingHz,
    };
    setTailApproved((prev) => ({ ...prev, [id]: ceilings }));
    void fetch("/api/tail-approved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ceilings }),
    });
  };

  const approveLimit = (id: string) => {
    setLimitApproved((prev) => ({ ...prev, [id]: effectiveLimits }));
    void fetch("/api/limit-approved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, limits: effectiveLimits }),
    });
  };

  // Writes the clamped recipe over the original. Curated keeps only: imports live in the
  // committed reference data, so they get approve or delete instead.
  const applyLimitFix = async (e: Entry, fixed: Patch) => {
    if (!e.id.startsWith("pool/")) return;
    const res = await fetch("/api/pool", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, patch: fixed }),
    });
    if (!res.ok) return;
    const [, bucket, rawIndex] = e.id.split("/");
    setApproved((prev) => {
      const list = [...(prev[bucket as PoolBucket] ?? [])];
      list[Number(rawIndex)] = fixed;
      return { ...prev, [bucket as PoolBucket]: list };
    });
    delete loudMeasures.current[e.id];
  };

  // The curated grid groups by day added (default: "what did I add today, to review"),
  // by source engine, or shows the to-sort inbox. Each yields {key, title, entries}[].
  const toSortEntries = useMemo(() => {
    const inboxIds = new Set(inboxEntries.map((e) => e.id));
    const flagged = curatedEntries.filter(
      (e) => toSortSet.has(e.id) && !inboxIds.has(e.id) && !deletedSet.has(e.id) && !dupSet.has(e.id),
    );
    return [...flagged, ...inboxEntries];
  }, [curatedEntries, toSortSet, inboxEntries, deletedSet, dupSet]);

  // Sort shows keeps ONLY as the to-sort inbox; browsing all keeps lives in Library.

  const selected = selectedId ? (entryById.get(selectedId) ?? null) : null;

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const setPairDismissed = (a: string, b: string, dismissed: boolean) => {
    const pair = pairKey(a, b);
    setDismissedPairs((prev) =>
      dismissed ? [...new Set([...prev, pair])] : prev.filter((p) => p !== pair),
    );
    void fetch("/api/similar-dismissed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, dismissed }),
    });
  };

  // Expensive O(n²) family scan, computed only on the Dedupe tab and NOT re-run on
  // dismissals (the cheap memo below filters those). Each unordered pair appears once,
  // anchored to its lower-numbered alive sound; dup-marked sounds never anchor but stay
  // visible as context rows inside other anchors' groups.
  const dedupeRaw = useMemo(() => {
    if (tab !== "dedupe") return [];
    const alive = [...ENTRIES, ...curatedEntries]
      .filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id))
      .sort((a, b) => a.num - b.num);
    const groups: {
      anchor: Entry;
      neigh: {
        e: Entry;
        d: number;
        pct: number;
        label: string;
        isDupeTier: boolean;
        reach: boolean;
        dirPair: boolean;
        namePair: boolean;
      }[];
    }[] = [];
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      const neigh = [];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const d = perceptualDistance(a.patch, b.patch);
        // Triage floor: only genuinely-close pairs are worth the curator's ears (calibrated
        // "filter to the absolute closest duplication"); everything below stays out.
        if (matchPercent(d) < DEDUPE_MIN_PCT) continue;
        const { kind, label } = classifyTraits(traitDiffs(a.patch, b.patch), d);
        const reach =
          withinVariationReach(a.patch, b.patch) || withinVariationReach(b.patch, a.patch);
        // namePair = a real directional name-pair (open/close etc.): sacred, never a dupe.
        // mirror = B is perceptually the REVERSE of A (invertPatch twin): for transitions
        // that means two sides of one door; elsewhere it just says the difference is
        // directional (up-blip vs down-blip) - a hint for the ear, not a protection order.
        const namePair = counterpartId(a) === b.id || counterpartId(b) === a.id;
        const dInv = namePair
          ? Infinity
          : Math.min(
              perceptualDistance(invertPatch(a.patch), b.patch),
              perceptualDistance(a.patch, invertPatch(b.patch)),
            );
        // "twin" is a strong word: claim it only when un-mirroring makes them a real
        // dupe (>=97%). Anything looser is just a directional cousin, no badge.
        const mirror = matchPercent(dInv) >= 97;
        const dirPair = namePair || mirror;
        neigh.push({
          e: b,
          d,
          pct: mirror ? matchPercent(dInv) : matchPercent(d),
          label,
          isDupeTier: kind !== "variation",
          reach,
          dirPair,
          namePair,
        });
      }
      if (neigh.length > 0) groups.push({ anchor: a, neigh });
    }
    // Order is FROZEN at snapshot (severity, then closest pair): marking rows must never
    // reshuffle or hide a group mid-triage - a group leaves only when every row is judged.
    for (const g of groups) {
      g.neigh.sort((x, y) => (x.reach === y.reach ? x.d - y.d : x.reach ? -1 : 1));
    }
    const sevOf = (g: (typeof groups)[number]) =>
      g.neigh.some((n) => n.reach) ? 0 : g.neigh.some((n) => n.isDupeTier) ? 1 : 2;
    groups.sort((x, y) => sevOf(x) - sevOf(y) || x.neigh[0].d - y.neigh[0].d);
    return groups;
    // Snapshot per visit: marks made ON the page filter out via the cheap memo below,
    // so a dupe/delete click never re-triggers this scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, curatedEntries]);

  const dedupeClusters = useMemo(() => {
    const dismissed = new Set(dismissedPairs);
    return dedupeRaw
      .map(({ anchor: a, neigh }) => ({
        anchor: a,
        rows: neigh.filter(
          (n) =>
            !dismissed.has(pairKey(a.id, n.e.id)) &&
            !deletedSet.has(n.e.id) &&
            !dupSet.has(n.e.id),
        ),
      }))
      .filter((c) => c.rows.length > 0);
  }, [dedupeRaw, dismissedPairs, deletedSet, dupSet]);

  // Similar-to-source computed LIVE against everything (imports + curated saves), replacing
  // the precomputed duplicate-candidates lookup which never knew about curated sounds.
  // Deleted/dup mates stay listed (crossed out) - they are context, not candidates.
  // What the pools actually use: a keep is its manual slots, an import adds gates minus
  // vetoes. Counts cover imports AND keeps, so the side panel agrees with every other tab.
  const effCats = (e: Entry) => effectiveCategories(e.id, e.patch, slots, exclusions, toSortSet);
  // What the inspector checklist and the row must agree on. The two cases are genuinely
  // different and collapsing them is a bug:
  //
  // IN THE INBOX, only what the curator has ticked. Not the gate union: a checklist that
  // pre-lights a machine guess is the machine deciding, and the inbox exists so the ear
  // decides. effCats is [] here by design, so it cannot be used.
  //
  // ONCE SORTED, the real membership (slots UNION gates MINUS vetoes). A sorted sound IS in
  // the aisles its gates cast it into, so showing manual slots only made the checklist
  // disagree with the row and the chip counts, and made a gate-cast category look unticked
  // when clicking it should VETO it rather than add a redundant slot.
  const pendingCats = (e: Entry) =>
    toSortSet.has(e.id)
      ? soundCategories(e.id, slots)
      : effectiveCategories(e.id, e.patch, slots, exclusions);
  const catCount = (cat: Category) =>
    [...ENTRIES, ...curatedEntries].filter(
      (e) => !deletedSet.has(e.id) && !dupSet.has(e.id) && effCats(e).includes(cat),
    ).length;

  const writeSlots = (id: string, categories: Category[]) => {
    setSlots((prev) => ({ ...prev, [id]: categories }));
    void fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categories }),
    });
  };

  const toggleCategory = (cat: Category) => {
    if (!selected) return;
    // The inbox is left ONLY by mark-sorted. A sound can reach it two ways: the to-sort
    // flag, or the zero-category safety net. Ticking a category on the second kind used to
    // give it a membership and evict it mid-edit, so the FIRST category you picked silently
    // became the whole verdict and you never got to add a second. Adopting the flag here
    // makes both kinds behave the same: edit freely, sign off when you are done.
    if (!toSortSet.has(selected.id) && effCats(selected).length === 0) {
      setToSortState(selected.id, true);
    }
    const current = soundCategories(selected.id, slots);
    writeSlots(selected.id, current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat]);
  };

  // Dedupe mirror rows: adopt an unnamed direction pair as a transition pair - slot BOTH
  // sounds into transition (manual slot) without leaving the page. The
  // pair stays undismissed so the row remains until you judge it.
  const slotBothTransition = (a: Entry, b: Entry) => {
    for (const e of [a, b]) {
      const current = soundCategories(e.id, slots);
      if (!current.includes("transition")) {
        writeSlots(e.id, [...current, "transition"]);
      }
    }
  };

  // Sign-off has to leave a TRACE. Clearing the flag used to write nothing, so a sound
  // that was gate-cast and then approved by ear looked identical on disk to one nobody
  // had ever seen; "no manual slot" was unreadable. Writing the effective categories in
  // as manual slots makes it mean "never signed off", permanently. It also FREEZES the
  // placement: later gate changes will not silently move a sound a human already placed,
  // which is the point of a human decision. effectiveCategories is called WITHOUT the
  // to-sort set here, since the flag is still on and would otherwise zero the answer.
  const markSorted = (id: string) => {
    const e = entryById.get(id);
    const signedOff = e
      ? effectiveCategories(e.id, e.patch, slots, exclusions)
      : soundCategories(id, slots);
    writeSlots(id, signedOff);
    setToSortState(id, false);
  };

  const setDeletedState = (id: string, del: boolean) => {
    setDeleted((prev) => (del ? [...prev, id] : prev.filter((x) => x !== id)));
    if (del && toSortSet.has(id)) setToSortState(id, false);
    void fetch("/api/deleted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, deleted: del }),
    });
  };

  const setDuplicateState = (id: string, dup: boolean) => {
    setDuplicates((prev) => (dup ? [...prev, id] : prev.filter((x) => x !== id)));
    if (dup && toSortSet.has(id)) setToSortState(id, false);
    void fetch("/api/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, duplicate: dup }),
    });
  };

  // The ONE remove verb (Library rows + Slot panel share semantics): for gate-able
  // categories, veto (which also strips the manual slot); a
  // slot-strip suffices.
  const setFavoriteState = (id: string, favorite: boolean) => {
    setFavorites((prev) => (favorite ? [...prev, id] : prev.filter((x) => x !== id)));
    void fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, favorite }),
    });
  };

  // Semantic aisles show the sound in its real context: the matching toast fires with it.
  const SEMANTIC_TOASTS: Partial<Record<GatedCategory, () => void>> = {
    success: () => toast.success("Success"),
    error: () => toast.error("Error"),
    warning: () => toast.warning("Warning"),
    notification: () => toast.info("Notification"),
  };

  const playInContext = (e: Entry, cat: Category) => {
    playLev(e.id, e.patch, { id: e.id, cat });
    SEMANTIC_TOASTS[cat as GatedCategory]?.();
  };

  // Play a generated candidate with its category's toast (batch tabs), so semantic
  // sounds are judged in context. No-op toast for mechanical categories.
  const playCandidate = (key: string, patch: Patch, cat: Category | null) => {
    playLev(key, patch, { cat });
    if (cat) SEMANTIC_TOASTS[cat as GatedCategory]?.();
  };

  const setExcludedState = (id: string, category: GatedCategory, excluded: boolean) => {
    setExclusions((prev) => {
      const current = new Set(prev[id] ?? []);
      if (excluded) current.add(category);
      else current.delete(category);
      const next = { ...prev };
      if (current.size > 0) next[id] = [...current];
      else delete next[id];
      return next;
    });
    void fetch("/api/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category, excluded }),
    });
    // A veto means "not a <cat>, period": also strip any manual slot for that category
    // (otherwise the slot wins the membership union and the row appears stuck - hit on
    // curated keeps, whose save category is a manual slot). Restoring a veto does NOT
    // re-add the slot.
    if (excluded && (slots[id] ?? []).includes(category)) {
      const nextCats = (slots[id] ?? []).filter((c) => c !== category);
      setSlots((prev) => ({ ...prev, [id]: nextCats }));
      void fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, categories: nextCats }),
      });
    }
  };

  // Editor randomize: surprise-me draw over every pool at the product's mix rate.
  const doGenerate = () => {
    const r = generate(pool, undefined, 0.75);
    if (!r) {
      setNote("Pool is empty.");
      setResult(null);
      setDraft(null);
      return;
    }
    setResult(r);
    setEditorSource(null);
    setEditorOrigin(null);
    setConfirmReplace(false);
    setGenCategory(null);
    setDraft(structuredClone(r.patch));
    setNote(null);
    playLev("generate", r.patch);
  };

  // Loads any existing sound into the Editor draft. "Keep as new sound" mints a separate
  // sound and leaves this one alone; "Replace" overwrites it in place (curated keeps only).
  const openInEditor = (patch: Patch, label: string, id?: string, cat?: Category) => {
    setResult(null);
    setNote(null);
    setEditorSource(label);
    setEditorOrigin(id ? { id, label, patch: structuredClone(patch) } : null);
    setConfirmReplace(false);
    if (cat) setGenCategory(cat);
    setDraft(structuredClone(patch));
    playLev(id ?? "editor-open", patch, id ? { id } : undefined);
    if (tab !== "editor") router.push("/workbench?tab=editor");
  };

  const openByNumber = () => {
    const num = parseInt(editorNumQuery.replace(/^#/, ""), 10);
    if (!Number.isFinite(num)) return;
    const id = Object.keys(numbersLive).find((k) => numbersLive[k] === num);
    const e = id ? entryById.get(id) : undefined;
    if (!e) {
      setNote(`No sound is registered as #${num}.`);
      return;
    }
    openInEditor(e.patch, pid(e.num), e.id);
  };

  const onTweak = (p: Patch) => {
    setDraft(p);
    clearTimeout(tweakTimer.current);
    tweakTimer.current = setTimeout(() => void playPatch(p), 120);
  };

  // Nearest existing sounds to the CURRENT draft (re-ranks live as it is tweaked), so a
  // too-similar variation is caught before Keep. Duration-aware metric; gain excluded.
  const neighbors = useMemo(() => {
    if (!draft) return [];
    return ENTRIES.filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id))
      .map((e) => ({ e, d: perceptualDistance(draft, e.patch) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
  }, [draft, deletedSet, dupSet]);

  // Batch variations queue: over-generate, then drop anything the EAR would call a dupe -
  // duration-aware perceptualDistance, threshold well above the identical tier (calibrated
  // against the curator's by-ear batch review). Uniform seed draw: diversity, not taste.
  const AUDIBLY_DISTINCT = 0.15;
  const makeBatch = (cat: Category, count: number, existing: VarRow[]): VarRow[] => {
    const alive = ENTRIES.filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id));
    const rows: VarRow[] = [];
    for (let attempts = 0; rows.length < count && attempts < count * 8; attempts++) {
      const r = generate(pool, cat, 1, Math.random, 1);
      if (!r || !r.mutated) continue;
      let nearest: Entry | null = null;
      let nd = Infinity;
      for (const e of alive) {
        const d = perceptualDistance(r.patch, e.patch);
        if (d < nd) {
          nd = d;
          nearest = e;
        }
      }
      if (nd <= AUDIBLY_DISTINCT) continue;
      if ([...existing, ...rows].some((row) => perceptualDistance(r.patch, row.patch) <= AUDIBLY_DISTINCT)) continue;
      // entryById, not ENTRY_BY_ID: the latter holds imports only, so a KEEP used as a
      // seed rendered numberless and was untraceable from the row. Key off seed.id -
      // rebuilding it from pack/event yields "pool/unsorted", which is not an id at all.
      const seedNum = entryById.get(r.seed.id)?.num;
      rows.push({
        key: `var-${++varSeq.current}`,
        patch: r.patch,
        seedId: r.seed.id,
        seedLabel: seedNum ? pid(seedNum) : "library seed",
        seedPatch: r.seed.patch,
        nearestLabel: nearest ? pid(nearest.num) : "",
        nearestPct: matchPercent(nd),
      });
    }
    return rows;
  };

  const startBatch = (cat: Category) => {
    setVarCategory(cat);
    setVarBatch(makeBatch(cat, 50, []));
  };

  // A keep enters the library with NO categories, ever. It used to inherit the tab's
  // category as a pre-ticked guess, which quietly decided the answer: an Invent draw kept
  // under "notification" arrived tagged notification even when the ear that kept it heard an
  // error. The machine does not know what it made, so it proposes nothing and the curator
  // ticks by ear in the inbox.
  const persistKeep = async (
    bucket: PoolBucket,
    patch: Patch,
    origin: "variation" | "creation" | "invention" | "generate" | "wild",
    categories: Category[] = [],
  ): Promise<boolean> => {
    const index = (approved[bucket] ?? []).length;
    const res = await fetch("/api/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: bucket, patch }),
    });
    if (!res.ok) return false;
    const poolId = `pool/${bucket}/${index}`;
    const today = localDateStr(new Date());
    setApproved((prev) => ({ ...prev, [bucket]: [...(prev[bucket] ?? []), patch] }));
    setSlots((prev) => ({ ...prev, [poolId]: categories }));
    setOrigins((prev) => ({ ...prev, [poolId]: origin }));
    setKeptDates((prev) => ({ ...prev, [poolId]: today }));
    void fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: poolId, categories }),
    });
    void fetch("/api/origins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: poolId, origin }),
    });
    void fetch("/api/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: poolId }),
    })
      .then((r) => r.json())
      .then(({ id, number }) => setNumbersLive((prev) => ({ ...prev, [id]: number })))
      .catch(() => {});
    void fetch("/api/kept-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: poolId, date: today }),
    });
    // Every keep enters the to-sort inbox and is a member of NOTHING until signed off
    // there (the flag zeroes `effectiveCategories`). The save category written above is
    // only a pre-ticked guess for the inspector; "mark sorted" is what releases it.
    setToSortState(poolId, true);
    return true;
  };

  const varKeep = async (row: VarRow) => {
    if (!varCategory) return;
    setVarBatch((prev) => prev.filter((r) => r.key !== row.key));
    await persistKeep(varCategory, row.patch, "variation");
  };

  // Taste layer shared by the Creations and Invent queues, on top of their hard guards:
  // each row slot runs a small TOURNAMENT - several candidates that pass the guards
  // compete and the feature dice (taste.ts buckets, learned from full-patch keep/delete
  // logs) pick the winner. Candidates near-identical to a previously DELETED sound are
  // hard-rejected (twin suppression) - "I already told you no".
  const CANDIDATES_PER_ROW = 4;

  // Creations batch: structural creator (lib/audio/create.ts). Two learned layers, same
  // as Invent: the op dice (which structural moves get liked) plus the feature taste
  // buckets (WHY a verdict happened) driving the tournament and twin suppression.
  const makeCreateBatch = (cat: Category, count: number, existing: VarRow[]): VarRow[] => {
    const alive = ENTRIES.filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id));
    const seeds = pool.byCategory.get(cat) ?? [];
    if (seeds.length === 0) return [];
    const catTaste = taste[cat];
    const rows: VarRow[] = [];

    interface CreateCandidate {
      patch: Patch;
      ops: CreateOp[];
      seed: (typeof seeds)[number];
      nearest: Entry | null;
      nd: number;
    }
    const maxAttempts = count * CANDIDATES_PER_ROW * 8;
    let attempts = 0;

    const nextCandidate = (): CreateCandidate | null => {
      while (attempts < maxAttempts) {
        attempts++;
        const seed = seeds[Math.floor(Math.random() * seeds.length)];
        const { patch, ops } = createFrom(seed.patch, cat, opStats);
        if (isDeletedTwin(catTaste, patch)) continue;
        let nearest: Entry | null = null;
        let nd = Infinity;
        for (const e of alive) {
          const d = perceptualDistance(patch, e.patch);
          if (d < nd) {
            nd = d;
            nearest = e;
          }
        }
        if (nd <= AUDIBLY_DISTINCT) continue;
        if ([...existing, ...rows].some((row) => perceptualDistance(patch, row.patch) <= AUDIBLY_DISTINCT)) continue;
        return { patch, ops, seed, nearest, nd };
      }
      return null;
    };

    while (rows.length < count && attempts < maxAttempts) {
      const contenders: CreateCandidate[] = [];
      while (contenders.length < CANDIDATES_PER_ROW && attempts < maxAttempts) {
        const c = nextCandidate();
        if (!c) break;
        contenders.push(c);
      }
      if (contenders.length === 0) break;
      const best = contenders.reduce((a, b) => (tasteScore(catTaste, b.patch) > tasteScore(catTaste, a.patch) ? b : a));
      const seedNum = entryById.get(best.seed.id)?.num;
      rows.push({
        key: `create-${++varSeq.current}`,
        patch: best.patch,
        seedId: best.seed.id,
        seedLabel: seedNum ? pid(seedNum) : "library seed",
        seedPatch: best.seed.patch,
        nearestLabel: best.nearest ? pid(best.nearest.num) : "",
        nearestPct: matchPercent(best.nd),
        ops: best.ops,
      });
    }
    return rows;
  };

  const recordCreateFeedback = (row: VarRow, verdict: "keep" | "delete") => {
    if (!createCategory || !row.ops) return;
    setOpStats((prev) => {
      const next: OpStats = structuredClone(prev);
      const cat = (next[createCategory] ??= {});
      for (const op of row.ops!) {
        const s = (cat[op] ??= { k: 0, d: 0 });
        if (verdict === "keep") s.k += 1;
        else s.d += 1;
      }
      return next;
    });
    void fetch("/api/creations-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: createCategory, ops: row.ops, verdict }),
    });
    setTaste((prev) => {
      const next: TasteStore = structuredClone(prev);
      recordTasteVerdict(next, createCategory, row.patch, verdict);
      return next;
    });
    void fetch("/api/taste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: createCategory, verdict, patch: row.patch }),
    });
  };

  const createKeep = async (row: VarRow) => {
    if (!createCategory) return;
    setCreateBatchRows((prev) => prev.filter((r) => r.key !== row.key));
    recordCreateFeedback(row, "keep");
    await persistKeep(createCategory, row.patch, "creation");
  };

  const createDelete = (row: VarRow) => {
    setCreateBatchRows((prev) => prev.filter((r) => r.key !== row.key));
    recordCreateFeedback(row, "delete");
  };

  // Invent batch: the Galaxy-stop three-source draw (invent.ts: composer 40% / cross-pack
  // hybrids 30% / tamed ultra gestures 30%), so keeps/deletes here train ALL of the stop's
  // dice keys incl. "g:*" and "hybrid". No seed lineage for composed rows - provenance
  // reads "invented". Two diversity guards on top of the library filter (measured
  // A batch once filled with 22 double-ticks the metric called distinct but the
  // ear called identical - same GESTURE, different pitch): (1) per-archetype cap so no
  // recipe dominates; (2) same-archetype pairs must clear a much higher bar than
  // cross-archetype ones, because within one gesture the remaining differences are
  // mostly pitch, which short sounds hide.
  // 2.5 -> 3.5 in the directed success session: "same" became the dominant delete
  // reason once the walls were right, so same-archetype pairs must sound farther apart.
  const SAME_ARCH_MULT = 3.5;
  const inventRowDescription = (row: InventRow): string => {
    if (row.parents.length > 0) return "skeleton from the first parent, timbre from the second";
    if (row.archetype.startsWith("g:")) {
      const g = GESTURE_INFO[row.archetype.slice(2)];
      return g ? `${g.character} (${g.shape})` : "";
    }
    return ARCHETYPE_INFO[row.archetype] ?? "";
  };

  const makeInventBatch = (cat: Category, count: number, existing: InventRow[]): InventRow[] => {
    const alive = ENTRIES.filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id));
    const seeds = pool.byCategory.get(cat) ?? [];
    const rows: InventRow[] = [];
    const archCap = Math.max(2, Math.ceil(count / 5));
    const archCount: Record<string, number> = {};
    for (const r of existing) archCount[r.archetype] = (archCount[r.archetype] ?? 0) + 1;
    const catTaste = taste[cat];

    interface Candidate {
      patch: Patch;
      archetype: string;
      parents: InventRow["parents"];
      nearest: Entry | null;
      nd: number;
    }
    const maxAttempts = count * CANDIDATES_PER_ROW * 8;
    let attempts = 0;

    const seedInputs = seeds.map((s) => ({ patch: s.patch, pack: s.pack }));
    const parentLabel = (s: (typeof seeds)[number]) => {
      const num = entryById.get(s.id)?.num;
      return num ? pid(num) : "library seed";
    };

    const nextCandidate = (): Candidate | null => {
      while (attempts < maxAttempts) {
        attempts++;
        const res = invent(cat, inventStats, seedInputs, Math.random);
        const { patch, archetype } = res;
        const parents: InventRow["parents"] =
          res.parentIndices?.map((i) => ({ label: parentLabel(seeds[i]), patch: seeds[i].patch })) ?? [];
        if ((archCount[archetype] ?? 0) >= archCap) continue;
        if (isDeletedTwin(catTaste, patch)) continue;
        let nearest: Entry | null = null;
        let nd = Infinity;
        for (const e of alive) {
          const d = perceptualDistance(patch, e.patch);
          if (d < nd) {
            nd = d;
            nearest = e;
          }
        }
        if (nd <= AUDIBLY_DISTINCT) continue;
        if (
          [...existing, ...rows].some((row) => {
            const bar = row.archetype === archetype ? AUDIBLY_DISTINCT * SAME_ARCH_MULT : AUDIBLY_DISTINCT;
            return perceptualDistance(patch, row.patch) <= bar;
          })
        )
          continue;
        return { patch, archetype, parents, nearest, nd };
      }
      return null;
    };

    while (rows.length < count && attempts < maxAttempts) {
      const contenders: Candidate[] = [];
      while (contenders.length < CANDIDATES_PER_ROW && attempts < maxAttempts) {
        const c = nextCandidate();
        if (!c) break;
        contenders.push(c);
      }
      if (contenders.length === 0) break;
      const best = contenders.reduce((a, b) => (tasteScore(catTaste, b.patch) > tasteScore(catTaste, a.patch) ? b : a));
      archCount[best.archetype] = (archCount[best.archetype] ?? 0) + 1;
      rows.push({
        key: `invent-${++varSeq.current}`,
        patch: best.patch,
        archetype: best.archetype,
        parents: best.parents,
        nearestLabel: best.nearest ? pid(best.nearest.num) : "",
        nearestPct: matchPercent(best.nd),
      });
    }
    return rows;
  };

  // Taste always records (it captures the WHY per patch). The archetype dice only move
  // when the verdict is about the CHARACTER: a delete blamed on this roll's execution
  // must not count toward the 5-delete mute, which is what was executing average cells
  // on luck alone.
  const recordInventFeedback = (row: InventRow, verdict: "keep" | "delete", blameDice = true) => {
    if (!inventCategory) return;
    if (blameDice) {
      setInventStats((prev) => {
        const next: InventStats = structuredClone(prev);
        const cat = (next[inventCategory] ??= {});
        const s = (cat[row.archetype] ??= { k: 0, d: 0 });
        if (verdict === "keep") s.k += 1;
        else s.d += 1;
        return next;
      });
      void fetch("/api/invent-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: inventCategory, archetype: row.archetype, verdict }),
      });
    }
    setTaste((prev) => {
      const next: TasteStore = structuredClone(prev);
      recordTasteVerdict(next, inventCategory, row.patch, verdict);
      return next;
    });
    void fetch("/api/taste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: inventCategory, verdict, patch: row.patch }),
    });
  };

  const inventKeep = async (row: InventRow) => {
    if (!inventCategory) return;
    setInventRows((prev) => prev.filter((r) => r.key !== row.key));
    recordInventFeedback(row, "keep");
    await persistKeep(inventCategory, row.patch, "invention");
  };

  // One delete short of the mute rule in compose.ts archWeight (k===0 && d>=5), so the
  // next delete would retire the cell for this category permanently.
  const deleteWouldRetire = (row: InventRow): boolean => {
    if (!inventCategory) return false;
    const s = inventStats[inventCategory]?.[row.archetype];
    return !!s && s.k === 0 && s.d >= 4;
  };

  const inventDelete = (row: InventRow) => {
    if (deleteWouldRetire(row)) {
      setPendingRetire(row);
      return;
    }
    setInventRows((prev) => prev.filter((r) => r.key !== row.key));
    recordInventFeedback(row, "delete");
  };

  const resolveRetire = (row: InventRow, blameDice: boolean) => {
    setPendingRetire(null);
    setInventRows((prev) => prev.filter((r) => r.key !== row.key));
    recordInventFeedback(row, "delete", blameDice);
  };

  // Wildcard batch: uniform archetype draw across ALL categories + cross-category
  // hybrids + warp ops (lib/audio/wild.ts). NO learning writes anywhere - no archetype
  // dice, no taste, no twin suppression. Discovery only; guards are the library-distance
  // filter and pairwise batch distinctness.
  const makeWildBatch = (count: number, existing: WildRow[], ultraShare: number): WildRow[] => {
    const alive = ENTRIES.filter((e) => !deletedSet.has(e.id) && !dupSet.has(e.id));
    const parents = pool.all.filter((s) => s.playable).map((s) => s.patch);
    const rows: WildRow[] = [];
    for (let attempts = 0; rows.length < count && attempts < count * 10; attempts++) {
      const { patch, label } = discovery(parents, ultraShare);
      let nearest: Entry | null = null;
      let nd = Infinity;
      for (const e of alive) {
        const d = perceptualDistance(patch, e.patch);
        if (d < nd) {
          nd = d;
          nearest = e;
        }
      }
      if (nd <= AUDIBLY_DISTINCT) continue;
      if ([...existing, ...rows].some((row) => perceptualDistance(patch, row.patch) <= AUDIBLY_DISTINCT)) continue;
      rows.push({
        key: `wild-${++varSeq.current}`,
        patch,
        label,
        nearestLabel: nearest ? pid(nearest.num) : "",
        nearestPct: matchPercent(nd),
      });
    }
    return rows;
  };

  // Wild keeps go to the unsorted BUCKET (a filename, not a category) and sit in the
  // Slot tab (auto-assignments always needed cleanup anyway).
  const wildKeep = async (row: WildRow) => {
    setWildRows((prev) => prev.filter((r) => r.key !== row.key));
    await persistKeep(UNSORTED_BUCKET, row.patch, "wild");
  };

  // Editor keeps go to the unsorted bucket, same as Wild: categorizing
  // happens later on Sort, not at keep time.
  const doKeep = async () => {
    if (!draft) return;
    if (await persistKeep(UNSORTED_BUCKET, draft, "generate")) {
      setNote("Saved as a NEW sound in the to-sort inbox. The original is untouched.");
    }
  };

  // Overwrite the origin in place, keep or import alike. The id survives either way, and the
  // id is the permanent address, so #nnn keeps resolving and nothing renumbers; only the
  // recipe behind it changes.
  //
  // Two stores, because keeps and imports live in different files: a keep is one index inside
  // data/pool/<bucket>.json, an import is one event inside a pack in reference-sounds.json.
  const replaceable = !!editorOrigin;
  const isKeepOrigin = !!editorOrigin?.id.startsWith("pool/");
  const doReplace = async () => {
    if (!draft || !editorOrigin) return;
    const res = await fetch(isKeepOrigin ? "/api/pool" : "/api/reference", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editorOrigin.id, patch: draft }),
    });
    if (!res.ok) {
      setNote("Replace failed; nothing was written.");
      return;
    }
    if (isKeepOrigin) {
      const [, bucket, rawIndex] = editorOrigin.id.split("/");
      setApproved((prev) => {
        const list = [...(prev[bucket as PoolBucket] ?? [])];
        list[Number(rawIndex)] = draft;
        return { ...prev, [bucket as PoolBucket]: list };
      });
    }
    // The survey measure describes the OLD recipe; drop it so the next play re-measures.
    delete loudMeasures.current[editorOrigin.id];
    setEditorOrigin({ ...editorOrigin, patch: structuredClone(draft) });
    setConfirmReplace(false);
    setNote(
      isKeepOrigin
        ? `Replaced ${editorOrigin.label} in place. Its number is unchanged.`
        : `Replaced ${editorOrigin.label} in reference-sounds.json. Its number is unchanged; the library list refreshes on the next rebuild.`,
    );
  };

  // Loudness survey: offline-render + measure the whole library and fresh draws from
  // every product stop, persist to data/loudness-report.json. Measurement only - no
  // gain is written anywhere; the normalization pass reads this report first.
  const runLoudnessSurvey = async () => {
    if (loudnessStatus?.startsWith("measuring")) return;
    interface Row extends LoudnessMeasure {
      kind: "library" | "core" | "orbit" | "galaxy" | "singularity";
      label: string;
      id?: string;
      cat?: Category;
    }
    const jobs: { kind: Row["kind"]; label: string; id?: string; cat?: Category; patch: Patch }[] = [];
    for (const s of pool.all) {
      if (!s.playable) continue;
      jobs.push({ kind: "library", label: s.id, id: s.id, patch: s.patch });
    }
    const cats = CATEGORIES;
    for (const cat of cats) {
      const seeds = (pool.byCategory.get(cat) ?? [])
        .filter((s) => s.playable)
        .map((s) => ({ patch: s.patch, pack: s.pack }));
      for (let i = 0; i < 10; i++) {
        const core = generate(pool, cat);
        if (core) jobs.push({ kind: "core", cat, label: `core/${cat}/${i}`, patch: core.patch });
        const seed = generate(pool, cat, 0);
        if (seed) {
          const r = createFrom(seed.patch, cat, opStats);
          jobs.push({ kind: "orbit", cat, label: `orbit/${cat}/${i}`, patch: r.patch });
        }
        jobs.push({ kind: "galaxy", cat, label: `galaxy/${cat}/${i}`, patch: invent(cat, inventStats, seeds).patch });
      }
    }
    const parents = pool.all.filter((s) => s.playable).map((s) => s.patch);
    for (let i = 0; i < 30; i++) {
      jobs.push({ kind: "singularity", label: `singularity/${i}`, patch: discovery(parents, 0.7).patch });
    }

    const rows: Row[] = [];
    let failed = 0;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        const m = await measurePatch(job.patch);
        rows.push({ kind: job.kind, label: job.label, ...(job.id ? { id: job.id } : {}), ...(job.cat ? { cat: job.cat } : {}), ...m });
      } catch {
        failed++;
      }
      if (i % 25 === 0 || i === jobs.length - 1) {
        setLoudnessStatus(`measuring ${i + 1}/${jobs.length}...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await fetch("/api/loudness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), rows }),
    });
    const measures: Record<string, { winDb: number; peakDb: number }> = {};
    for (const row of rows) {
      if (row.kind === "library" && row.id) measures[row.id] = { winDb: row.winDb, peakDb: row.peakDb };
    }
    await fetch("/api/loudness-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measures }),
    });
    const winVals = rows.map((r) => r.winDb).sort((a, b) => a - b);
    const q = (p: number) => winVals[Math.min(winVals.length - 1, Math.floor(p * winVals.length))];
    setLoudnessStatus(
      `done: ${rows.length} measured${failed ? `, ${failed} failed` : ""} · winDb p10 ${q(0.1)} / median ${q(0.5)} / p90 ${q(0.9)} · saved to data/loudness-report.json`,
    );
  };

  // Dedupe guardrails: before killing a sound, show whether it has a
  // live directional sister (name-pair) and whether it is still unsorted. Killing one
  // side of a door orphans the other; sorting comes before life-or-death verdicts.
  const pairSisterOf = (e: Entry): Entry | null => {
    const cid = counterpartId(e);
    if (!cid || deletedSet.has(cid) || dupSet.has(cid)) return null;
    return entryById.get(cid) ?? null;
  };
  const DedupeBadges = ({ e }: { e: Entry }) => {
    const sister = pairSisterOf(e);
    if (!sister) return null;
    return (
      <span
        className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400"
        title={`Directional name-pair: this is one side of a door with ${pid(sister.num)}. Killing it orphans the sister - if it duplicates something, prefer killing the OTHER sound, or mark both sides of both pairs together.`}
      >
        ⇄ paired {pid(sister.num)}
      </span>
    );
  };
  // Dedupe rows identify sounds by number + CURRENT effective categories (the fact the
  // verdict depends on), never by pack/event name - names mean nothing mid-triage (per
  // the curator); the name survives as the hover tooltip.
  const DedupeName = ({ e }: { e: Entry }) => {
    const cats = effCats(e);
    return (
      <span className="truncate">
        {pid(e.num)}{" "}
        {cats.length > 0 ? (
          <span className="opacity-60">{cats.join(", ")}</span>
        ) : (
          <span className="font-semibold text-pink-600 dark:text-pink-400">unsorted</span>
        )}
      </span>
    );
  };

  // One row anatomy for every Library list (category aisles + the to-sort inbox), as a
  // table row. Clicking the row plays AND selects into the inspector; the icon actions on
  // the right are the destructive/marking ones, so a misclick on them can never be
  // mistaken for an audition. `pairMate` suppresses the row's top border so a real
  // directional pair reads as one joined object across two rows.
  const renderLibRow = (e: Entry, cat: Category | null, showInvert = false, pairMate = false) => {
    // In the inbox, show the PENDING categories: effCats is [] for anything awaiting sort,
    // so the row would read "uncategorized" no matter what you had just ticked.
    const real = pendingCats(e);
    const isSel = selectedId === e.id;
    const isFav = favSet.has(e.id);
    // Written out, and ALWAYS the full membership rather than "also C2 C3". Reading
    // "tap, hover, transition" needs no decoding; the C-numbers were a lookup every time.
    const homes = real.length > 0 ? real.join(", ") : "uncategorized";
    const homeless = real.length === 0;
    return (
      <TableRow
        key={e.id}
        data-state={isSel ? "selected" : undefined}
        className={`cursor-pointer ${pairMate ? "border-t-0" : ""}`}
        onClick={() => {
          setSelectedId(e.id);
          if (cat) playInContext(e, cat);
          else playLev(e.id, e.patch, { id: e.id });
        }}
        title="Play and inspect"
      >
        <TableCell className="w-9 pr-0">
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              setFavoriteState(e.id, !isFav);
            }}
            title={isFav ? "Unfavorite" : "Favorite (weights the product draw)"}
            className="rounded p-1 text-neutral-300 transition-colors hover:text-yellow-500 dark:text-neutral-600"
          >
            <Star className={`size-3.5 ${isFav ? "fill-yellow-400 text-yellow-500" : ""}`} />
          </button>
        </TableCell>
        <TableCell className="w-16 tabular-nums font-medium">{pid(e.num)}</TableCell>
        <TableCell className={`max-w-0 truncate ${homeless ? "text-pink-500/80" : "text-neutral-400"}`}>
          {homes}
        </TableCell>
        <TableCell className="w-20 pr-0">
          {!e.id.startsWith("pool/") && (
            <span
              title="Imported as seed data, not generated here"
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              imported
            </span>
          )}
        </TableCell>
        <TableCell className="w-24 pr-0">
          {showInvert && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                playLev(`${e.id}:inv`, invertPatch(e.patch), { cat: "transition" });
              }}
              title="Play the derived reverse direction (does it work as a door?)"
              className="rounded-md border border-neutral-300 px-1.5 py-0.5 transition-colors hover:border-neutral-500 dark:border-neutral-700"
            >
              <ArrowLeftRight className="size-3.5" />
            </button>
          )}
          {cat === "hover" && (
            <span
              onMouseEnter={() => playLev(e.id, e.patch, { id: e.id, cat })}
              title="Hover to play (the real gesture)"
              className="cursor-default rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900"
            >
              hover me
            </span>
          )}
        </TableCell>
        <TableCell className="w-20">
          <div className="flex items-center justify-end gap-0.5">
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                openInEditor(e.patch, pid(e.num), e.id, cat ?? undefined);
              }}
              title="Open a copy in the Editor (keeping there mints a NEW sound; this one is untouched)"
              className="rounded p-1 text-neutral-400 transition-colors hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                setDeletedState(e.id, true);
              }}
              title="Delete (restorable from Trash)"
              className="rounded p-1 text-neutral-400 transition-colors hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Same shell for every GENERATION queue (variations, creations, invent, wild) so a row
  // means the same thing on all four: how close it lands to something you already own,
  // audition, verdict, what produced it, and what it came from.
  const genTable = (rows: ReactNode) => (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-14">match</TableHead>
          <TableHead className="w-32">play</TableHead>
          <TableHead className="w-44">verdict</TableHead>
          <TableHead className="w-40">origin</TableHead>
          <TableHead>what it is</TableHead>
          <TableHead className="w-56">source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{rows}</TableBody>
    </Table>
  );

  // One shell so every Library list has the same columns and header.
  const libTable = (rows: ReactNode) => (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-9" />
          <TableHead className="w-16">#</TableHead>
          <TableHead>categories</TableHead>
          <TableHead className="w-20" />
          <TableHead className="w-24" />
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>{rows}</TableBody>
    </Table>
  );

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 font-mono text-sm">
      <Toaster richColors closeButton position="bottom-right" />
      {pendingRetire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-lg rounded-lg border border-neutral-300 bg-white p-5 font-sans shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
            <h2 className="text-base font-semibold">Last delete for this character</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono font-bold text-purple-500">{pendingRetire.archetype}</span> has been
              deleted {inventStats[inventCategory!]?.[pendingRetire.archetype]?.d ?? 0} times in{" "}
              <span className="font-semibold">{inventCategory}</span> and never kept. One more counted delete
              retires it from this category for good.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {inventRowDescription(pendingRetire)}
            </p>
            <p className="mt-3 text-sm font-medium">Why are you deleting this one?</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => resolveRetire(pendingRetire, true)}
                className="rounded-md border border-red-400 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:border-red-800 dark:text-red-400"
              >
                <span className="font-semibold">The character is wrong here.</span> Retire it from{" "}
                {inventCategory} permanently.
              </button>
              <button
                onClick={() => resolveRetire(pendingRetire, false)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-500/10 dark:border-neutral-700"
              >
                <span className="font-semibold">Just this roll.</span> Bad execution (harsh, too long, too
                quiet), the character deserves another chance. Does not count toward retirement.
              </button>
              <button
                onClick={() => setPendingRetire(null)}
                className="mt-1 self-start px-1 text-xs text-muted-foreground underline"
              >
                cancel, keep the row
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="py-6 font-sans">
        <h1 className="text-xl font-semibold tracking-tight">{TAB_TITLE[tab]}</h1>
        <p className="mt-1 max-w-3xl leading-relaxed text-muted-foreground">{TAB_INTRO[tab]}</p>
      </header>

      {tab === "review" && (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            {/* To sort sits on its own row ABOVE the categories because it is the gate
                every keep passes through, not one aisle among them. */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => setReviewCat("tosort")}
                title="The inbox: every new keep, held out of all categories until you sign it off here. Tick its categories in the inspector, then mark sorted."
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  reviewCat === "tosort"
                    ? "border-pink-400 bg-pink-400/10 text-pink-600 dark:border-pink-700 dark:text-pink-400"
                    : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                }`}
              >
                to sort ({toSortEntries.length})
              </button>
              {limitReview.length > 0 && (
                <button
                  onClick={() => setReviewCat("limits")}
                  title="Sounds already in the library whose recipe exceeds a current ear-safety ceiling. Ceilings only clamp NEW generations, so these were never touched."
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    reviewCat === "limits"
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:border-amber-700 dark:text-amber-500"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  ear safety ({limitReview.length})
                </button>
              )}
              {tailReview.length > 0 && (
                <button
                  onClick={() => setReviewCat("tails")}
                  title="Sounds with a high chime that starts AFTER the body has decayed, so nothing masks it. The prominence gate cannot see this: it reads gain and length, never when a layer starts."
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    reviewCat === "tails"
                      ? "border-violet-500 bg-violet-500/15 text-violet-700 dark:border-violet-700 dark:text-violet-400"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  exposed tails ({tailReview.length})
                </button>
              )}
              <div className="min-w-0 flex-1" />
              <input
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Escape" && setLibSearch("")}
                placeholder="#"
                title="Search by permanent number across every category. Digits prefix-match as you type; Esc clears."
                className="w-24 shrink-0 rounded-md border border-neutral-300 bg-transparent px-2 py-1 font-mono text-xs outline-none focus:border-neutral-500 dark:border-neutral-700"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-neutral-200 pt-2 dark:border-neutral-800">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setReviewCat(cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    reviewCat === cat
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  {cat} ({catCount(cat)})
                </button>
              ))}
            </div>

            {libSearch.trim() !== "" ? (
              (() => {
                const q = libSearch.trim();
                const results = [...ENTRIES, ...curatedEntries]
                  .filter((e) => e.num > 0 && String(e.num).startsWith(q))
                  .sort((x, y) => x.num - y.num)
                  .slice(0, 40);
                return (
                  <div className="mt-4">
                    <p className="mb-3 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                      #{q} — {results.length} match{results.length === 1 ? "" : "es"}
                      <button
                        onClick={() => setLibSearch("")}
                        className="ml-3 rounded-md border border-neutral-300 px-2 py-0.5 font-normal text-neutral-500 dark:border-neutral-700"
                      >
                        clear
                      </button>
                    </p>
                    {results.length === 0 && (
                      <p className="text-xs text-neutral-500">No number starts with {q}.</p>
                    )}
                    {libTable(
                      results.map((e) =>
                        deletedSet.has(e.id) || dupSet.has(e.id) ? (
                          <TableRow key={e.id} className="text-neutral-400 opacity-60">
                            <TableCell className="w-9" />
                            <TableCell className="w-16 tabular-nums line-through">{pid(e.num)}</TableCell>
                            <TableCell colSpan={3}>
                              in Trash ({dupSet.has(e.id) ? "duplicate" : "deleted"})
                            </TableCell>
                            <TableCell className="w-20" />
                          </TableRow>
                        ) : (
                          renderLibRow(e, null)
                        ),
                      ),
                    )}
                  </div>
                );
              })()
            ) : reviewCat === "limits" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-neutral-500">
                  {limitReview.length} sounds exceed a ceiling you have set since they were
                  saved. Ceilings clamp GENERATION only, so nothing here was ever altered.
                  Apply fix writes the clamped recipe over the sound and keeps its number;
                  keep as is records approval against today&apos;s ceilings, and re-surfaces
                  if you tighten one later.
                </p>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-16">#</TableHead>
                      <TableHead className="w-44">sound</TableHead>
                      <TableHead>over by</TableHead>
                      <TableHead className="w-64 text-right">action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {limitReview.map(({ e, audit }) => {
                      const isKeep = e.id.startsWith("pool/");
                      return (
                        <TableRow
                          key={e.id}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedId(e.id);
                            playLev(e.id, e.patch, { id: e.id });
                          }}
                        >
                          <TableCell className="w-16 tabular-nums text-neutral-400">{pid(e.num)}</TableCell>
                          <TableCell className="w-44 truncate text-neutral-400">
                            {effCats(e).join(", ") || "unsorted"}
                          </TableCell>
                          <TableCell className="max-w-0 truncate text-amber-600 dark:text-amber-500" title={audit.reasons.join(" · ")}>
                            {audit.reasons.join(" · ")}
                          </TableCell>
                          <TableCell className="w-64">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                title="Hear the clamped version before committing to it"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  playLev(`${e.id}:fixed`, audit.fixed);
                                }}
                              >
                                ▶ fixed
                              </Button>
                              <Button
                                size="sm"
                                className="h-7"
                                disabled={!isKeep}
                                title={
                                  isKeep
                                    ? "Write the clamped recipe over this sound. It keeps its number; the old recipe is not recoverable."
                                    : "Imported sounds live in the committed reference data and are not rewritten here. Keep or delete instead."
                                }
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  void applyLimitFix(e, audit.fixed);
                                }}
                              >
                                apply fix
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  approveLimit(e.id);
                                }}
                              >
                                keep as is
                              </Button>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  openInEditor(e.patch, pid(e.num), e.id);
                                }}
                                title="Open in the Editor"
                                className="rounded p-1 text-neutral-400 transition-colors hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setDeletedState(e.id, true);
                                }}
                                title="Delete (restorable from Trash)"
                                className="rounded p-1 text-neutral-400 transition-colors hover:text-red-500"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : reviewCat === "tails" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-neutral-500">
                  {tailReview.length} sounds carry a high layer that starts AFTER the body has
                  decayed. Under the body it would be masked and read as sparkle, which is what
                  the prominence gate protects; out on its own it is a chime hanging off the end.
                  The gate cannot tell those apart, because it only reads gain and length, never
                  when a layer starts. Nothing here is auto-fixed: open it in the Editor, drop or
                  retune the layer, and the row disappears. Or hit keep if it already sounds right.
                </p>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-16">#</TableHead>
                      <TableHead className="w-44">sound</TableHead>
                      <TableHead>the exposed layer</TableHead>
                      <TableHead className="w-44 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tailReview.map(({ e, tails }) => (
                      <TableRow
                        key={e.id}
                        className={`cursor-pointer ${selectedId === e.id ? "bg-neutral-100 dark:bg-neutral-900" : ""}`}
                        onClick={() => {
                          setSelectedId(e.id);
                          playLev(e.id, e.patch, { id: e.id });
                        }}
                      >
                        <TableCell className="w-16 tabular-nums text-neutral-400">{pid(e.num)}</TableCell>
                        <TableCell className="w-44 truncate text-neutral-400">
                          {effCats(e).join(", ") || "unsorted"}
                        </TableCell>
                        <TableCell className="max-w-0 truncate text-violet-600 dark:text-violet-400">
                          {tails
                            .map(
                              (t) =>
                                `L${t.layer} ${t.hz}Hz starts +${Math.round(t.onset * 1000)}ms (gain ${t.gain}, ceiling ${t.ceiling})`,
                            )
                            .join(" · ")}
                        </TableCell>
                        <TableCell className="w-44">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              className="h-7"
                              title="This chime is fine. Clears the row and stays cleared, unless you lower a pitch ceiling later."
                              onClick={(ev) => {
                                ev.stopPropagation();
                                keepTail(e.id);
                              }}
                            >
                              keep
                            </Button>
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openInEditor(e.patch, pid(e.num), e.id);
                              }}
                              title="Open in the Editor"
                              className="rounded p-1 text-neutral-400 transition-colors hover:text-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setDeletedState(e.id, true);
                              }}
                              title="Delete (restorable from Trash)"
                              className="rounded p-1 text-neutral-400 transition-colors hover:text-red-500"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : reviewCat === "tosort" ? (
              <div className="mt-4">
                {toSortEntries.length === 0 ? (
                  <p className="text-xs text-neutral-500">Inbox zero. Nothing to sort.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                      to sort — {toSortEntries.length} awaiting category sign-off
                    </p>
                    <div className="flex flex-col gap-1">
                      {libTable(toSortEntries.map((e) => renderLibRow(e, null)))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              (() => {
                // One order for the whole aisle: number descending. Registry numbers are
                // chronological (higher = newer, imports and keeps alike), so newest arrivals
                // always top the list. Replaced the old curated-first / weakest-gate-fit split
                // (names and provenance don't order anything, numbers do).
                const alive = [...ENTRIES, ...curatedEntries].filter(
                  (e) => !deletedSet.has(e.id) && !dupSet.has(e.id),
                );
                const cat = reviewCat;
                const allMembers = alive
                  .filter((e) => effCats(e).includes(cat))
                  .sort((a, b) => b.num - a.num);
                const members = allMembers;

                const memberIds = new Set(members.map((m) => m.id));
                const isPaired = (e: Entry) => {
                  const c = counterpartId(e);
                  return !!c && memberIds.has(c);
                };
                const singles = cat === "transition" ? members.filter((e) => !isPaired(e)) : members;
                // Real name-pairs render as one joined card, positive direction (open/enter/
                // expand/on/...) on top, so the two-sided object is auditioned as a unit.
                const POSITIVE = new Set(["open", "enter", "expand", "on", "up", "forward", "in", "show", "send", "start"]);
                const isPositive = (e: Entry) => e.event.split(/[-.]/).some((p) => POSITIVE.has(p));
                const pairGroups: [Entry, Entry][] = [];
                if (cat === "transition") {
                  const seen = new Set<string>();
                  for (const e of members) {
                    if (seen.has(e.id)) continue;
                    const cid = counterpartId(e);
                    if (!cid || !memberIds.has(cid) || seen.has(cid)) continue;
                    const mate = ENTRY_BY_ID.get(cid);
                    if (!mate) continue;
                    seen.add(e.id);
                    seen.add(cid);
                    pairGroups.push(isPositive(e) ? [e, mate] : [mate, e]);
                  }
                  pairGroups.sort((x, y) => x[0].pack.localeCompare(y[0].pack) || x[0].event.localeCompare(y[0].event));
                }

                return (
                  <div className="mt-4 space-y-6">
                    <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                      {cat} — {allMembers.length} in the library
                    </p>
                    {cat === "transition" && (
                      <p className="text-xs text-neutral-500">
                        Judge each single as one side of a door: ⇄ plays its derived reverse. Pairs
                        (below) already have a real counterpart.
                      </p>
                    )}
                    <div className="flex flex-col gap-1">
                      {cat === "transition" && singles.length > 0 && (
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                          singles — audition both directions ({singles.length})
                        </div>
                      )}
                      {singles.length > 0 && libTable(singles.map((e) => renderLibRow(e, cat, cat === "transition")))}
                      {allMembers.length === 0 && <p className="text-xs text-neutral-500">Category is empty.</p>}
                    </div>
                    {pairGroups.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                          pairs — real counterparts, joined ({pairGroups.length} pairs)
                        </div>
                        {libTable(
                          pairGroups.flatMap(([a, b]) => [
                            renderLibRow(a, cat),
                            renderLibRow(b, cat, false, true),
                          ]),
                        )}
                      </div>
                    )}

                  </div>
                );
              })()
            )}
          </div>

          <aside className="sticky top-0 max-h-[calc(100vh-1.5rem)] w-80 shrink-0 space-y-3 overflow-y-auto border-l border-neutral-200 py-1 pl-5 dark:border-neutral-800">
            {selected ? (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                  selected
                </div>
                <button
                  onClick={() => playLev(selected.id, selected.patch, { id: selected.id })}
                  title="Play again"
                  className={`w-full rounded-md border px-2.5 py-1.5 text-left text-xs font-bold transition-colors hover:border-neutral-500 ${
                    deletedSet.has(selected.id)
                      ? "border-red-400 text-red-500 line-through dark:border-red-900"
                      : "border-neutral-400 dark:border-neutral-500"
                  }`}
                >
                  {pid(selected.num)}
                </button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Click a sound in the list to inspect it here.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(() => {
                const inInbox =
                  !!selected &&
                  toSortSet.has(selected.id);
                return (
                  <button
                    onClick={() =>
                      selected &&
                      (inInbox ? markSorted(selected.id) : setToSortState(selected.id, true))
                    }
                    disabled={!selected}
                    title="To-sort inbox: every new keep lands here and belongs to no category until you sign it off. Mark sorted writes the categories in and releases it."
                    className={`shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                      inInbox
                        ? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-400"
                        : "border-neutral-300 text-neutral-400 hover:border-sky-500 hover:text-sky-500 dark:border-neutral-700"
                    }`}
                  >
                    {inInbox ? "mark sorted ✓" : "to sort"}
                  </button>
                );
              })()}
              <button
                onClick={() => selected && setDuplicateState(selected.id, !dupSet.has(selected.id))}
                disabled={!selected}
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                  selected && dupSet.has(selected.id)
                    ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "border-amber-300 text-amber-600 hover:border-amber-500 dark:border-amber-900 dark:text-amber-500"
                }`}
              >
                duplicate
              </button>
              {/* The row's trash icon only deletes. This one toggles, so it is also the
                  restore path for a deleted sound reached by number search. */}
              <button
                onClick={() => selected && setDeletedState(selected.id, !deletedSet.has(selected.id))}
                disabled={!selected}
                title={
                  selected && deletedSet.has(selected.id)
                    ? "Restore from Trash"
                    : "Delete (restorable from Trash)"
                }
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                  selected && deletedSet.has(selected.id)
                    ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                    : "border-red-300 text-red-500 hover:border-red-500 dark:border-red-900"
                }`}
              >
                {selected && deletedSet.has(selected.id) ? "restore" : "delete"}
              </button>
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                categories
              </div>
              <div className="flex flex-col gap-1">
                {CATEGORIES.map((cat) => {
                  // TWO STATES ONLY: in the category, or not. No third "vetoed" appearance.
                  // A veto is plumbing (the only way to subtract a gate cast on an import), so
                  // it stays as a mechanism and never as a look. Rendering it made an import
                  // read as three-way when the curator only ever means yes or no.
                  const active = !!selected && pendingCats(selected).includes(cat);
                  const gated = !!selected && !selected.id.startsWith("pool/");
                  const clickRow = () => {
                    if (!selected) return;
                    if (active) {
                      // On an import a veto is what removes it, and setExcludedState strips
                      // any manual slot at the same time, so one call covers both sources.
                      if (gated) setExcludedState(selected.id, cat as GatedCategory, true);
                      else toggleCategory(cat);
                      return;
                    }
                    // Clear a stale veto first, then slot it, so "selected" always means a
                    // manual slot rather than a gate that happens to agree.
                    if (gated && (exclusions[selected.id] ?? []).includes(cat)) {
                      setExcludedState(selected.id, cat as GatedCategory, false);
                    }
                    if (!soundCategories(selected.id, slots).includes(cat)) toggleCategory(cat);
                  };
                  return (
                    <button
                      key={cat}
                      onClick={clickRow}
                      disabled={!selected}
                      title={active ? "Click to remove from this category." : "Click to add to this category."}
                      className={`flex items-center justify-between rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
                      }`}
                    >
                      <span>
                        <span className="opacity-50">{categoryId(cat)}</span> {cat}
                      </span>
                      <span className="opacity-40">{catCount(cat)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {selected && (
              <div className="space-y-1.5">
                {(() => {
                  // The measured description only. What the gates CAST is deliberately absent:
                  // the checklist above is the answer, and printing a competing machine opinion
                  // beside it is what made membership read as three-way.
                  const gate = GATES.get(selected.id);
                  if (!gate) return null;
                  return (
                    <p className="text-[11px] text-neutral-600 opacity-80 dark:text-neutral-300">
                      {gate.why}
                    </p>
                  );
                })()}
                {(() => {
                  const sug = SUGGESTED_EVENT_CATEGORIES[selected.event];
                  if (!sug) return null;
                  return (
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                      suggestion: {sug.map((c) => `${categoryId(c)} ${c}`).join(", ")}
                      <span className="opacity-90"> — {CATEGORY_USE_CASES[sug[0]]}</span>
                      <span className="opacity-70"> · hint only</span>
                    </p>
                  );
                })()}
              </div>
            )}
            {selected && !deletedSet.has(selected.id) && (
              <SoundPreview
                onTrigger={() => playLev("preview", selected.patch, { id: selected.id })}
                onTriggerReverse={() => playLev("preview:inv", invertPatch(selected.patch), { id: selected.id })}
              />
            )}
          </aside>
        </div>
      )}

      {tab === "dedupe" && (
        <section>
          <p className="mb-4 text-xs text-neutral-500">
            {dedupeClusters.length} groups ·{" "}
            {dedupeClusters.reduce((s, c) => s + c.rows.length, 0)} pairs to judge
          </p>
          {dedupeClusters.length === 0 && (
            <p className="text-xs text-neutral-500">Nothing left to judge. Library is clean.</p>
          )}
          <div className="flex flex-col gap-3">
            {dedupeClusters.map(({ anchor: a, rows }) => (
              <div
                key={a.id}
                className="divide-y divide-dashed divide-neutral-200 rounded-md border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700"
              >
                {(() => {
                  const anchorMarked = dupSet.has(a.id) || deletedSet.has(a.id);
                  return (
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                        anchorMarked ? "text-neutral-400 line-through opacity-60" : ""
                      }`}
                    >
                      <button
                        onClick={() => playLev(a.id, a.patch, { id: a.id })}
                        className="min-w-0 flex-1 truncate text-left font-bold transition-opacity hover:opacity-70"
                        title="Play the group anchor"
                      >
                        <DedupeName e={a} />
                      </button>
                      <DedupeBadges e={a} />
                      {anchorMarked ? (
                        <button
                          onClick={() =>
                            dupSet.has(a.id)
                              ? setDuplicateState(a.id, false)
                              : setDeletedState(a.id, false)
                          }
                          className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-neutral-500 transition-colors hover:border-neutral-500 dark:border-neutral-700"
                        >
                          undo {dupSet.has(a.id) ? "dupe" : "delete"}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setDuplicateState(a.id, true)}
                            className="shrink-0 rounded-md border border-amber-300 px-2 py-0.5 text-amber-600 transition-colors hover:border-amber-500 dark:border-amber-900 dark:text-amber-500"
                            title="Mark the ANCHOR as duplicate (keep a neighbor instead)"
                          >
                            dupe
                          </button>
                          <button
                            onClick={() => setDeletedState(a.id, true)}
                            className="shrink-0 rounded-md border border-red-300 px-2 py-0.5 text-red-500 transition-colors hover:border-red-500 dark:border-red-900"
                            title="Delete the ANCHOR from the entire library"
                          >
                            delete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
                {rows.map(({ e, pct, label, isDupeTier, reach, dirPair, namePair }) => {
                  const tone = dirPair
                    ? "text-sky-700 dark:text-sky-400"
                    : isDupeTier
                      ? "text-amber-600 dark:text-amber-500"
                      : reach
                        ? "text-violet-600 dark:text-violet-400"
                        : "";
                  return (
                    <div key={e.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${tone}`}>
                      <button
                        onClick={() => playLev(e.id, e.patch, { id: e.id })}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity hover:opacity-70"
                        title="Play"
                      >
                        <DedupeName e={e} />
                        <span className="shrink-0 opacity-60" title={`differs by: ${label}`}>
                          {pct}%
                          {namePair && " · ⇄ two sides of one door - not a dupe"}
                          {dirPair && !namePair && " · ⇄ mirrored twin"}
                          {!dirPair && isDupeTier && " · likely dupe"}
                          {!dirPair && reach && " · 🎲 variation reach"}
                        </span>
                      </button>
                      <DedupeBadges e={e} />
                      {dirPair && !namePair && (
                        <button
                          onClick={() => slotBothTransition(a, e)}
                          disabled={
                            effCats(a).includes("transition") && effCats(e).includes("transition")
                          }
                          title="Adopt as a one-way transition: slots both sounds into transition (manual slot), then dupe the direction you like less - the product derives the reverse via invert, so one side is enough. Real name-pairs are the exception (hand-crafted reverses, keep both)."
                          className="shrink-0 rounded-md border border-sky-300 px-2 py-0.5 text-sky-600 transition-colors hover:border-sky-500 disabled:opacity-40 dark:border-sky-800 dark:text-sky-400"
                        >
                          {effCats(a).includes("transition") && effCats(e).includes("transition")
                            ? "in transition ✓"
                            : "→ transition"}
                        </button>
                      )}
                      <button
                        onClick={() => setDuplicateState(e.id, true)}
                        className="shrink-0 rounded-md border border-amber-300 px-2 py-0.5 text-amber-600 transition-colors hover:border-amber-500 dark:border-amber-900 dark:text-amber-500"
                        title="Mark as duplicate - moves to Trash, excluded from every pool"
                      >
                        dupe
                      </button>
                      <button
                        onClick={() => setDeletedState(e.id, true)}
                        className="shrink-0 rounded-md border border-red-300 px-2 py-0.5 text-red-500 transition-colors hover:border-red-500 dark:border-red-900"
                        title="Delete (bad sound) - moves to Trash, excluded from every pool"
                      >
                        delete
                      </button>
                      <button
                        onClick={() => setPairDismissed(a.id, e.id, true)}
                        className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-neutral-500 transition-colors hover:border-neutral-500 dark:border-neutral-700"
                        title="My ear says these are different - never show this pair again"
                      >
                        not similar
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "trash" && (
        <section>
          {(() => {
            const rows = [
              ...duplicates.map((id) => ({ id, why: "duplicate" as const })),
              ...deleted.map((id) => ({ id, why: "deleted" as const })),
            ]
              .map((r) => ({ ...r, e: entryById.get(r.id) }))
              .sort((a, b) => (b.e?.num ?? 0) - (a.e?.num ?? 0));
            if (rows.length === 0) {
              return <p className="text-xs text-neutral-500">Trash is empty.</p>;
            }
            return (
              <div className="flex flex-col gap-1">
                {rows.map(({ id, why, e }) => (
                  <div
                    key={`${why}/${id}`}
                    className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 dark:border-neutral-800"
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                        why === "duplicate"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-500"
                          : "bg-red-500/15 text-red-500"
                      }`}
                    >
                      {why}
                    </span>
                    {e ? (
                      <button
                        onClick={() => playLev(e.id, e.patch, { id: e.id })}
                        className="min-w-0 flex-1 truncate text-left transition-opacity hover:opacity-70"
                        title="Play"
                      >
                        {pid(e.num)}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate opacity-60">{id}</span>
                    )}
                    <button
                      onClick={() =>
                        why === "duplicate" ? setDuplicateState(id, false) : setDeletedState(id, false)
                      }
                      className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 transition-colors hover:border-neutral-500 dark:border-neutral-700"
                    >
                      restore
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>
      )}

      {tab === "invent" && (
        <section>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setInventCategory(cat);
                  setInventRows(makeInventBatch(cat, 50, []));
                }}
                title="Total Galaxy training in this category: keeps + deletes across every archetype, character and hybrid cell. Low number = thin dice, train here."
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  inventCategory === cat
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                }`}
              >
                {cat} ({catCount(cat)}) <span className="opacity-60">· {inventVerdicts(cat)} RL</span>
              </button>
            ))}
          </div>

          {inventCategory && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-start gap-3 text-xs text-neutral-500">
                <div className="flex gap-2">
                  <button
                    onClick={() => setInventRows(makeInventBatch(inventCategory, 50, []))}
                    className={BATCH_PRIMARY_BTN}
                  >
                    generate 50 new
                  </button>
                  <button onClick={() => setInventRows([])} className={BATCH_SECONDARY_BTN}>
                    clear
                  </button>
                </div>
              </div>
              {genTable(
                inventRows.map((row, i) => (
                  <TableRow
                    key={row.key}
                    onMouseEnter={
                      inventCategory === "hover"
                        ? () => playCandidate(row.key, row.patch, inventCategory)
                        : undefined
                    }
                  >
                    <TableCell
                      className="w-14 tabular-nums text-neutral-400"
                      title={`Nearest existing sound: ${row.nearestLabel}`}
                    >
                      {String(row.nearestPct).padStart(2, "0")}%
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex gap-1">
                        <button onClick={() => playCandidate(row.key, row.patch, inventCategory)} className={PLAY_BTN}>
                          ▶ {i + 1}
                        </button>
                        {inventCategory === "transition" && (
                          <button
                            onClick={() => playLev(`${row.key}:inv`, invertPatch(row.patch), { cat: inventCategory })}
                            title="Play the reversed direction (does it work as a door?)"
                            className={PLAY_BTN}
                          >
                            ⇄
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="w-44">
                      <div className="flex gap-1">
                        <button onClick={() => inventKeep(row)} className={KEEP_BTN}>
                          keep
                        </button>
                        <button onClick={() => inventDelete(row)} className={DEL_BTN}>
                          delete
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="w-40 truncate font-bold text-purple-500">
                      {row.parents.length > 0 ? "hybrid" : `invented · ${row.archetype}`}
                    </TableCell>
                    <TableCell className="max-w-0 truncate text-neutral-500" title={inventRowDescription(row)}>
                      {inventRowDescription(row)}
                    </TableCell>
                    <TableCell className="w-56">
                      <div className="flex gap-1">
                        {row.parents.map((p, j) => (
                          <button
                            key={j}
                            onClick={() => playLev(`${row.key}:p${j}`, p.patch)}
                            title="Play parent"
                            className={SEED_BTN}
                          >
                            {j === 0 ? "⌂ " : "× "}
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )),
              )}
            </div>
          )}
          {!inventCategory && (
            <p className="mt-4 text-xs text-neutral-500">Pick a category to invent a batch.</p>
          )}
        </section>
      )}

      {tab === "wild" && (
        <section>
          <div className="mb-2 flex items-center justify-start gap-3 text-xs text-neutral-500">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWildRows(makeWildBatch(50, [], wildUltraShare / 100))}
                className={BATCH_PRIMARY_BTN}
              >
                generate 50 new
              </button>
              <button onClick={() => setWildRows([])} className={BATCH_SECONDARY_BTN}>
                clear
              </button>
              <label className="flex items-center gap-2">
                <span>wild {100 - wildUltraShare}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={wildUltraShare}
                  onChange={(e) => setWildUltraShare(Number(e.target.value))}
                  className="w-32 accent-orange-500"
                />
                <span className="font-bold text-orange-500">ultra {wildUltraShare}%</span>
                <span className="text-neutral-400">(product ships 70%)</span>
              </label>
            </div>
          </div>
          {genTable(
            wildRows.map((row, i) => (
              <TableRow key={row.key}>
                <TableCell
                  className="w-14 tabular-nums text-neutral-400"
                  title={`Nearest existing sound: ${row.nearestLabel} (lower = more foreign)`}
                >
                  {String(row.nearestPct).padStart(2, "0")}%
                </TableCell>
                <TableCell className="w-32">
                  <button onClick={() => playLev(row.key, row.patch)} className={PLAY_BTN}>
                    ▶ {i + 1}
                  </button>
                </TableCell>
                <TableCell className="w-44">
                  <button onClick={() => wildKeep(row)} className={KEEP_BTN}>
                    keep
                  </button>
                </TableCell>
                <TableCell className="w-40 truncate font-bold text-orange-500" title={row.label}>
                  {row.label}
                </TableCell>
                <TableCell className="max-w-0 truncate text-neutral-500">
                  untrained draw, no verdict recorded
                </TableCell>
                <TableCell className="w-56 text-neutral-400">no parent</TableCell>
              </TableRow>
            )),
          )}
        </section>
      )}

      {tab === "calibrate" && (
        <section className="max-w-3xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Loudness</CardTitle>
              <CardDescription>
                The survey measures every sound once. These numbers then solve a play-time
                volume, so moving them re-levels everything instantly.
              </CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" onClick={() => void runLoudnessSurvey()}>
                  Run survey
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {loudnessStatus && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {loudnessStatus}
                </p>
              )}
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                    master
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step={0.5}
                      value={loudnessCfg.master}
                      onChange={(e) => saveLoudnessCfg({ ...loudnessCfg, master: Number(e.target.value) })}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-neutral-400">winDb</span>
                  </div>
                </label>
                <label
                  className="flex flex-col gap-1"
                  title="Partial normalization. 100% drags every sound fully to target, which flattens quiet-by-design character; lower values compress the spread while deliberate softness survives proportionally."
                >
                  <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                    strength
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step={5}
                      min={0}
                      max={100}
                      value={Math.round((loudnessCfg.strength ?? 1) * 100)}
                      onChange={(e) => saveLoudnessCfg({ ...loudnessCfg, strength: Number(e.target.value) / 100 })}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-neutral-400">%</span>
                  </div>
                </label>
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-400">
                  per-category offset, dB from master
                </p>
                <div className="flex flex-wrap gap-3">
                  {CATEGORIES.map((cat) => (
                    <label key={cat} className="flex flex-col gap-1">
                      <span className="text-xs text-neutral-500">{cat}</span>
                      <Input
                        type="number"
                        step={0.5}
                        value={loudnessCfg.offsets[cat] ?? 0}
                        onChange={(e) =>
                          saveLoudnessCfg({
                            ...loudnessCfg,
                            offsets: { ...loudnessCfg.offsets, [cat]: Number(e.target.value) },
                          })
                        }
                        className="h-8 w-20"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Applied by the category a sound was drawn in.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Absolute pitch ceiling</CardTitle>
              <CardDescription>
                The ladders below are gated by PROMINENCE: a layer quieter than 0.12 gain or
                shorter than 120ms skips every ceiling, on the theory that a faint high partial
                is sparkle rather than pain. That theory leaks, because the gate reads the
                written gain while play-time leveling rescales the whole patch (p90 is 2.96x),
                so a partial it calls quiet can be boosted back to audible. This line is the
                backstop and nothing escapes it. Slide, listen to sparkle, then set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="font-medium">No tonal layer above</span>
                  <span className="text-[11px] text-neutral-400">
                    original: off (nothing clamped) · suggested: 2500 Hz
                  </span>
                  <span className="ml-auto shrink-0">
                    <Badge
                      variant="outline"
                      className={`font-mono ${
                        absCeiling !== limits.absoluteCeilingHz
                          ? "border-amber-500 text-amber-600 dark:text-amber-500"
                          : ""
                      }`}
                    >
                      {absCeiling >= 20000 ? "off" : `${absCeiling} Hz`}
                      {absCeiling !== limits.absoluteCeilingHz
                        ? " · unsaved"
                        : limits.absoluteCeilingHz === undefined
                          ? " · default"
                          : ""}
                    </Badge>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    value={Math.min(absCeiling, 8000)}
                    min={1200}
                    max={8000}
                    step={100}
                    onValueChange={(v) =>
                      setPendingLimits((prev) => ({
                        ...prev,
                        absoluteCeilingHz: Array.isArray(v) ? v[0] : v,
                      }))
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-7 shrink-0"
                    disabled={absCeiling === limits.absoluteCeilingHz}
                    onClick={() => {
                      saveLimit("absoluteCeilingHz", absCeiling);
                      setPendingLimits((prev) => {
                        const next = { ...prev };
                        delete next.absoluteCeilingHz;
                        return next;
                      });
                    }}
                  >
                    set
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-neutral-400"
                    onClick={() => {
                      saveLimit("absoluteCeilingHz", null);
                      setPendingLimits((prev) => {
                        const next = { ...prev };
                        delete next.absoluteCeilingHz;
                        return next;
                      });
                    }}
                  >
                    original
                  </Button>
                </div>
              </div>

              {/* The reference sparkle IS one of the offenders (#387 peaks at 3520Hz), so it
                  doubles as the canary: if this pair ever stops sounding like sparkle, the
                  ceiling has gone too far. */}
              {(() => {
                const spark = ENTRY_BY_ID.get("seed-c/sparkle");
                if (!spark) return null;
                const clamped = absReview.find((r) => r.e.id === spark.id);
                return (
                  <div className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                    <span className="text-xs font-medium">sparkle canary</span>
                    <span className="text-[11px] text-neutral-400">
                      {clamped ? `clamped: ${clamped.hz} Hz down to ${absCeiling}` : "untouched at this ceiling"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      <Button variant="outline" size="sm" className="h-7"
                              onClick={() => playLev("spark-before", spark.patch, { id: spark.id })}>
                        ▶ before
                      </Button>
                      <Button variant="outline" size="sm" className="h-7" disabled={!clamped}
                              onClick={() => clamped && playLev("spark-after", clamped.fixed)}>
                        ▶ after
                      </Button>
                    </span>
                  </div>
                );
              })()}

              <div>
                <p className="mb-2 text-xs text-neutral-500">
                  {absReview.length} sounds change at this ceiling. Rows leave the list as you
                  raise it.
                </p>
                <div className="max-h-80 overflow-y-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>sound</TableHead>
                        <TableHead className="w-28 text-right">peak</TableHead>
                        <TableHead className="w-40 text-right">hear it</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absReview.map(({ e, fixed, hz }) => (
                        <TableRow key={e.id}>
                          <TableCell className="w-16 tabular-nums text-neutral-400">{pid(e.num)}</TableCell>
                          <TableCell className="max-w-0 truncate">
                            {effCats(e).join(", ") || "unsorted"}
                          </TableCell>
                          <TableCell className="w-28 text-right font-mono text-amber-600 dark:text-amber-500">
                            {hz} → {absCeiling}
                          </TableCell>
                          <TableCell className="w-40">
                            <div className="flex justify-end gap-1">
                              <Button variant="outline" size="sm" className="h-6 px-2"
                                      onClick={() => playLev(`${e.id}:before`, e.patch, { id: e.id })}>
                                before
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 px-2"
                                      onClick={() => playLev(`${e.id}:after`, fixed)}>
                                after
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ear-safety ceilings</CardTitle>
              <CardDescription>
                Play up each ladder, hit ✕ on the first step that hurts. Steps past your
                ceiling stay marked red.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {PROBE_ROWS.map((row) => {
                const saved = limits[row.key];
                const current = pendingLimits[row.key] ?? saved ?? DEFAULT_LIMITS[row.key];
                const dirty = current !== saved;
                return (
                  <div key={row.key}>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="font-medium">{row.title}</span>
                      <span className="text-[11px] text-neutral-400">{row.desc}</span>
                      <span className="ml-auto shrink-0">
                        <Badge
                          variant={dirty ? "outline" : saved !== undefined ? "secondary" : "outline"}
                          className={`font-mono ${dirty ? "border-amber-500 text-amber-600 dark:text-amber-500" : ""}`}
                        >
                          {current} {row.unit}
                          {dirty ? " · unsaved" : saved === undefined ? " · default" : ""}
                        </Badge>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={current}
                        min={row.min}
                        max={row.max}
                        step={row.stepSize}
                        onValueChange={(v) =>
                          setPendingLimits((prev) => ({
                            ...prev,
                            [row.key]: Array.isArray(v) ? v[0] : v,
                          }))
                        }
                        onValueCommitted={(v) => {
                          const at = Array.isArray(v) ? v[0] : v;
                          playGuarded(`probe-${row.key}`, row.probe(at));
                        }}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => playGuarded(`probe-${row.key}`, row.probe(current))}
                      >
                        ▶
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 shrink-0"
                        disabled={current === saved}
                        onClick={() => {
                          saveLimit(row.key, current);
                          setPendingLimits((prev) => {
                            const next = { ...prev };
                            delete next[row.key];
                            return next;
                          });
                        }}
                      >
                        set
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-neutral-400"
                        onClick={() => {
                          saveLimit(row.key, null);
                          setPendingLimits((prev) => {
                            const next = { ...prev };
                            delete next[row.key];
                            return next;
                          });
                        }}
                      >
                        reset
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {tab === "creations" && (
        <section>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCreateCategory(cat);
                  setCreateBatchRows(makeCreateBatch(cat, 50, []));
                }}
                title="Total Orbit training in this category: keeps + deletes across every op cell."
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  createCategory === cat
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                }`}
              >
                {cat} ({pool.byCategory.get(cat)?.length ?? 0}) <span className="opacity-60">· {opVerdicts(cat)} RL</span>
              </button>
            ))}
          </div>

          {createCategory && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-start gap-3 text-xs text-neutral-500">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCreateBatchRows(makeCreateBatch(createCategory, 50, []))}
                    className={BATCH_PRIMARY_BTN}
                  >
                    generate 50 new
                  </button>
                  <button onClick={() => setCreateBatchRows([])} className={BATCH_SECONDARY_BTN}>
                    clear
                  </button>
                </div>
              </div>
              {genTable(
                createBatchRows.map((row, i) => (
                  <TableRow
                    key={row.key}
                    onMouseEnter={
                      createCategory === "hover"
                        ? () => playLev(row.key, row.patch, { cat: createCategory })
                        : undefined
                    }
                  >
                    <TableCell
                      className="w-14 tabular-nums text-neutral-400"
                      title={`Nearest existing sound: ${row.nearestLabel}`}
                    >
                      {String(row.nearestPct).padStart(2, "0")}%
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex gap-1">
                        <button onClick={() => playLev(row.key, row.patch, { cat: createCategory })} className={PLAY_BTN}>
                          ▶ {i + 1}
                        </button>
                        {createCategory === "transition" && (
                          <button
                            onClick={() => playLev(`${row.key}:inv`, invertPatch(row.patch), { cat: createCategory })}
                            title="Play the reversed direction (does it work as a door?)"
                            className={PLAY_BTN}
                          >
                            ⇄
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="w-44">
                      <div className="flex gap-1">
                        <button onClick={() => createKeep(row)} className={KEEP_BTN}>
                          keep
                        </button>
                        <button onClick={() => createDelete(row)} className={DEL_BTN}>
                          delete
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="w-40 truncate text-neutral-400">
                      {(row.ops ?? []).length} move{(row.ops ?? []).length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell
                      className="max-w-0 truncate font-medium text-purple-500/90"
                      title={(row.ops ?? []).join(" · ")}
                    >
                      {(row.ops ?? []).join(" · ")}
                    </TableCell>
                    <TableCell className="w-56">
                      <button
                        onClick={() => playLev(`${row.key}:seed`, row.seedPatch, { cat: createCategory })}
                        title="Play the seed this creation grew from"
                        className={SEED_BTN}
                      >
                        from {row.seedLabel}
                      </button>
                    </TableCell>
                  </TableRow>
                )),
              )}
            </div>
          )}
          {!createCategory && (
            <p className="mt-4 text-xs text-neutral-500">Pick a category to create a batch.</p>
          )}
        </section>
      )}

      {tab === "variations" && (
        <section>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => startBatch(cat)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  varCategory === cat
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                }`}
              >
                {cat} ({pool.byCategory.get(cat)?.length ?? 0})
              </button>
            ))}
          </div>

          {varCategory && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-start gap-3 text-xs text-neutral-500">
                <div className="flex gap-2">
                  <button
                    onClick={() => setVarBatch(makeBatch(varCategory, 50, []))}
                    className={BATCH_PRIMARY_BTN}
                  >
                    generate 50 new
                  </button>
                  <button onClick={() => setVarBatch([])} className={BATCH_SECONDARY_BTN}>
                    clear
                  </button>
                </div>
              </div>
              {genTable(
                varBatch.map((row, i) => (
                  <TableRow
                    key={row.key}
                    onMouseEnter={
                      varCategory === "hover"
                        ? () => playLev(row.key, row.patch, { cat: varCategory })
                        : undefined
                    }
                  >
                    <TableCell
                      className="w-14 tabular-nums text-neutral-400"
                      title={`Nearest existing sound: ${row.nearestLabel}`}
                    >
                      {String(row.nearestPct).padStart(2, "0")}%
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex gap-1">
                        <button onClick={() => playLev(row.key, row.patch, { cat: varCategory })} className={PLAY_BTN}>
                          ▶ {i + 1}
                        </button>
                        {varCategory === "transition" && (
                          <button
                            onClick={() => playLev(`${row.key}:inv`, invertPatch(row.patch), { cat: varCategory })}
                            title="Play the reversed direction (does it work as a door?)"
                            className={PLAY_BTN}
                          >
                            ⇄
                          </button>
                        )}
                      </div>
                    </TableCell>
                    {/* No delete: the frozen variation pass has no learnable parameters, so
                        a verdict has nothing to point at. A delete would read as training
                        and write nothing. */}
                    <TableCell className="w-44">
                      <div className="flex gap-1">
                        <button onClick={() => varKeep(row)} className={KEEP_BTN}>
                          add to library
                        </button>
                        <button
                          onClick={() => openInEditor(row.patch, `variation of ${row.seedLabel}`, undefined, varCategory)}
                          title="Open in the Editor to tweak before keeping"
                          className="shrink-0 rounded p-1 text-neutral-400 transition-colors hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="w-40 truncate text-neutral-400">nudged, not remixed</TableCell>
                    <TableCell className="max-w-0 truncate text-neutral-500">
                      trains nothing; keeping only grows the library
                    </TableCell>
                    <TableCell className="w-56">
                      <button
                        onClick={() => playLev(`${row.key}:seed`, row.seedPatch, { cat: varCategory })}
                        title="Play the seed this variation came from"
                        className={SEED_BTN}
                      >
                        from {row.seedLabel}
                      </button>
                    </TableCell>
                  </TableRow>
                )),
              )}
            </div>
          )}
        </section>
      )}

      {tab === "editor" && (
        <section>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-500">open:</span>
            <input
              value={editorNumQuery}
              onChange={(e) => setEditorNumQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openByNumber()}
              placeholder="#123"
              className="w-20 rounded-md border border-neutral-300 bg-transparent px-2 py-1 font-mono outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
            <button
              onClick={openByNumber}
              className="rounded-md border border-neutral-300 px-2.5 py-1 dark:border-neutral-700"
            >
              load
            </button>
            <button
              onClick={doGenerate}
              className="ml-2 rounded-md bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
            >
              🎲 randomize
            </button>
          </div>

          {(draft || note) && (
            <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              {draft && (
                <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                  <button
                    onClick={() => playLev("generate", draft, { cat: genCategory })}
                    className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black dark:hover:bg-neutral-300"
                  >
                    ▶ Play edit
                  </button>
                  {editorOrigin && (
                    <button
                      onClick={() =>
                        playLev("editor-origin", editorOrigin.patch, {
                          id: editorOrigin.id,
                          cat: genCategory,
                        })
                      }
                      title={`Play ${editorOrigin.label} as it is saved right now, to A/B against the edit`}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      ▶ Play original
                    </button>
                  )}
                  <button
                    onClick={doKeep}
                    disabled={!draft}
                    title="Mints a SEPARATE sound with its own number, into the to-sort inbox. Whatever you opened stays exactly as it was."
                    className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-40 dark:text-emerald-400"
                  >
                    Keep as new sound
                  </button>
                  {editorOrigin && (
                    <button
                      onClick={() => setConfirmReplace(true)}
                      disabled={!draft || !replaceable}
                      title={`Overwrite ${editorOrigin.label} in place, in ${
                        isKeepOrigin ? "its pool file" : "reference-sounds.json"
                      }. It keeps its number, so #nnn still resolves; the recipe behind it changes and the old one is not recoverable.`}
                      className="rounded-md border border-amber-500 px-3 py-1.5 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-40 dark:text-amber-500"
                    >
                      Replace {editorOrigin.label.split(" ")[0]}
                    </button>
                  )}
                  <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Overwrite {editorOrigin?.label ?? "this sound"}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          The saved recipe is replaced by your edit. It keeps its number, so
                          anything referring to {editorOrigin?.label.split(" ")[0] ?? "it"} still
                          resolves, but the sound behind that number changes and{" "}
                          <span className="font-medium text-foreground">
                            the old one cannot be recovered
                          </span>{" "}
                          - this is not a delete, so Trash will not have it. Use &quot;Keep as new
                          sound&quot; if you want to keep both.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void doReplace()}
                          className="bg-amber-600 hover:bg-amber-500"
                        >
                          Yes, overwrite it
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
              {result && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      result.mutated
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {result.mutated ? "variation" : "original"}
                  </span>
                  <span className="text-xs text-neutral-500">from</span>
                  <button
                    onClick={() => playLev("seed", result.seed.patch, { id: result.seed.id })}
                    title="Play the seed this came from"
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-bold transition-colors hover:border-neutral-500 dark:border-neutral-700"
                  >
                    {(() => {
                      const num = entryById.get(result.seed.id)?.num;
                      return num ? `${pid(num)} ` : "";
                    })()}
                    {NUMBERS[result.seed.id] ? pid(NUMBERS[result.seed.id]) : "library seed"}
                  </button>
                  {genCategory && <span className="text-xs text-neutral-500">in: {genCategory}</span>}
                </div>
              )}

              {!result && editorSource && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-700 dark:text-sky-400">
                    opened
                  </span>
                  <span className="text-xs text-neutral-500">from</span>
                  <span className="text-xs font-bold">{editorSource}</span>
                  {/* What it has to SOUND like, which the label cannot say. "tap 29" is the
                      bucket file it was written into plus its index, never its membership, so
                      a sound living in hover and transition still reads "tap" up there. */}
                  {editorOrigin &&
                    (() => {
                      const origin = entryById.get(editorOrigin.id);
                      const cats = origin
                        ? effectiveCategories(origin.id, origin.patch, slots, exclusions, toSortSet)
                        : [];
                      return (
                        <>
                          <span className="text-xs text-neutral-500">·</span>
                          <span className="text-xs text-neutral-500">editing a</span>
                          {cats.length === 0 ? (
                            <span className="rounded border border-pink-400 px-1.5 py-0.5 text-xs text-pink-600 dark:border-pink-700 dark:text-pink-400">
                              {toSortSet.has(editorOrigin.id) ? "to sort" : "no category"}
                            </span>
                          ) : (
                            cats.map((c) => (
                              <span
                                key={c}
                                className="rounded border border-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                              >
                                {c}
                              </span>
                            ))
                          )}
                          <span className="text-xs text-neutral-400">
                            {cats.length > 1 ? "(it has to work as all of them)" : ""}
                          </span>
                        </>
                      );
                    })()}
                </div>
              )}

              {draft && neighbors.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
                    closest existing sounds (re-ranks as you tweak)
                  </div>
                  <div className="flex flex-col gap-1">
                    {neighbors.map(({ e, d }) => {
                      const { kind, label } = classifyTraits(traitDiffs(draft, e.patch), d);
                      const isDupe = kind !== "variation";
                      const inFamily = d < FAMILY_THRESHOLD;
                      return (
                        <button
                          key={e.id}
                          onClick={() => playLev(e.id, e.patch, { id: e.id })}
                          className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-1 text-left text-xs transition-colors hover:border-neutral-500 ${
                            isDupe
                              ? "border-amber-300 bg-amber-400/[0.08] dark:border-amber-800"
                              : "border-neutral-200 dark:border-neutral-800"
                          }`}
                        >
                          <span className="truncate">
                            {pid(e.num)}
                          </span>
                          <span className={`shrink-0 ${isDupe ? "text-amber-500/90" : "text-neutral-400"}`}>
                            {matchPercent(d)}%
                            {isDupe ? " · likely dupe" : inFamily ? ` · ${label}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {draft && <TweakPanel patch={draft} onChange={onTweak} />}
              {draft && (
                <SoundPreview
                  category={genCategory}
                  onTrigger={() => playLev("preview", draft, { cat: genCategory })}
                />
              )}
              {note && <p className="mt-1 text-neutral-500">{note}</p>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
