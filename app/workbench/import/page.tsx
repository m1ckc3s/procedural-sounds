"use client";

import { useEffect, useMemo, useState } from "react";
import referenceJson from "@/data/reference/reference-sounds.json";
import { parseSound } from "@/lib/audio/export";
import { layersOf, type Patch } from "@/lib/audio/patch";
import {
  buildPool,
  type ApprovedPools,
  type Exclusions,
  type ReferenceData,
  type SlotOverrides,
} from "@/lib/audio/randomize";
import { matchPercent, perceptualDistance } from "@/lib/audio/similarity";
import { patchDuration, playPatch } from "@/lib/audio/synth";

const reference = referenceJson as unknown as ReferenceData;

// Same tiers the Prospect bench uses, so "near-twin" means the same thing on both.
const CLOSE = 70;
const RELATED = 58;

// The way back in for a sound that left. The product's Copy sound button is the only thing
// that can carry a draw off the page, so this is what makes that trip round: paste it here
// and it lands in the to-sort inbox with ZERO categories, exactly like every other keep.
export default function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<number | null>(null);

  const [slots, setSlots] = useState<SlotOverrides>({});
  const [approved, setApproved] = useState<ApprovedPools>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Exclusions>({});
  const [toSort, setToSort] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/slots").then((r) => r.json()).then(setSlots).catch(() => {});
    fetch("/api/pool").then((r) => r.json()).then(setApproved).catch(() => {});
    fetch("/api/deleted").then((r) => r.json()).then(setDeleted).catch(() => {});
    fetch("/api/duplicates").then((r) => r.json()).then(setDuplicates).catch(() => {});
    fetch("/api/exclusions").then((r) => r.json()).then(setExclusions).catch(() => {});
    fetch("/api/tosort").then((r) => r.json()).then(setToSort).catch(() => {});
  }, []);

  const parsed = useMemo(() => (text.trim() ? parseSound(text) : null), [text]);
  const patch = parsed?.ok ? parsed.patch : null;

  // Nearest library sound. A sound copied out of the product usually came FROM the library's
  // seeds, so re-importing one is a real way to grow a duplicate by hand.
  const nearest = useMemo(() => {
    if (!patch) return null;
    const pool = buildPool(reference, slots, approved, deleted, duplicates, exclusions, [], toSort);
    let best = { pct: 0, label: "", patch: null as Patch | null };
    for (const s of pool.all) {
      const pct = matchPercent(perceptualDistance(patch, s.patch));
      if (pct > best.pct) best = { pct, label: `${s.event} (${s.pack})`, patch: s.patch };
    }
    return best;
  }, [patch, slots, approved, deleted, duplicates, exclusions, toSort]);

  const importIt = async () => {
    if (!patch || busy) return;
    setBusy(true);
    try {
      const pool = await fetch("/api/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "unsorted", patch }),
      }).then((r) => r.json());
      if (!pool?.ok) return;
      const id = `pool/unsorted/${pool.count - 1}`;
      const post = (route: string, body: unknown) =>
        fetch(`/api/${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      await post("slots", { id, categories: [] });
      await post("origins", { id, origin: "generate" });
      await post("kept-dates", { id, date: new Date().toISOString().slice(0, 10) });
      await post("tosort", { id, tosort: true });
      const num = await post("numbers", { id });
      setKept(num?.number ?? 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 font-mono text-sm">
      <h1 className="font-sans text-xl font-semibold">import a sound</h1>
      <p className="mt-2 font-sans text-[13px] text-neutral-500">
        Paste what Copy sound gave you on the product page. The player code around it is
        ignored, so a whole standalone snippet works too. It enters the to-sort inbox with no
        categories, like every other keep.
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setKept(null);
        }}
        spellCheck={false}
        placeholder={'const readyRemix = {\n  "layers": [ ... ]\n};'}
        className="mt-4 h-64 w-full resize-y rounded-lg border border-neutral-300 bg-transparent p-3 text-xs outline-none focus:border-neutral-500 dark:border-neutral-700"
      />

      {parsed && !parsed.ok && (
        <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-400">{parsed.error}</p>
      )}

      {patch && (
        <>
          <p className="mt-3 text-xs text-neutral-500">
            {layersOf(patch).length === 1 ? "1 layer" : `${layersOf(patch).length} layers`} &middot;{" "}
            {Math.round(patchDuration(patch) * 1000)} ms
            {nearest && nearest.pct >= RELATED && (
              <span className={nearest.pct >= CLOSE ? " text-orange-600 dark:text-orange-400" : " text-amber-600"}>
                {" "}
                &middot; {nearest.pct >= CLOSE ? "near-twin" : "close relative"} of {nearest.label} ({nearest.pct}%)
              </span>
            )}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void playPatch(patch)}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 font-sans transition-colors hover:bg-neutral-500/10 dark:border-neutral-700"
            >
              play
            </button>
            {nearest?.patch && nearest.pct >= RELATED && (
              <button
                onClick={() => nearest.patch && void playPatch(nearest.patch)}
                className="rounded-lg border border-orange-500 px-4 py-3 font-sans text-orange-600 transition-colors hover:bg-orange-500/10 dark:text-orange-400"
              >
                compare
              </button>
            )}
            <button
              onClick={() => void importIt()}
              disabled={busy || kept !== null}
              className="flex-[2] rounded-lg border border-emerald-600 px-4 py-3 font-sans font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
            >
              {kept !== null ? `imported #${kept}, now sort it` : "import to library"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
