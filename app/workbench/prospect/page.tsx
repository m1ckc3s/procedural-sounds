"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import referenceJson from "@/data/reference/reference-sounds.json";
import { newMemory, prospect, type Prospected, type ProspectSeed } from "@/lib/audio/prospect";
import type { OpStats } from "@/lib/audio/create";
import { layersOf } from "@/lib/audio/patch";
import {
  buildPool,
  type ApprovedPools,
  type Exclusions,
  type ReferenceData,
  type SlotOverrides,
} from "@/lib/audio/randomize";
import { patchDuration, playPatch } from "@/lib/audio/synth";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

const reference = referenceJson as unknown as ReferenceData;

interface Heard extends Prospected {
  number?: number;
}

// The similarity scale is calibrated in similarity.ts: the 0.15 rejection bar reads as
// 79%, and under 50% is a genuinely different sound. Anything the generator lets
// through is therefore already legal; these tiers flag the near misses so a close
// relative is a decision rather than an accident.
const CLOSE = 70; // a near-twin of something already on the shelf
const RELATED = 58; // same family, still arguably worth keeping

const dupeTone = (pct: number) =>
  pct >= CLOSE
    ? "text-orange-600 dark:text-orange-400"
    : pct >= RELATED
      ? "text-amber-600 dark:text-amber-500"
      : "text-neutral-400";

// PROSPECT: one button, one sound. No categories, no dials. The session history below
// is a safety net rather than a feature: a double-press on generate must never be able
// to lose something good. It holds everything heard this sitting, is never persisted,
// and starts empty on reload, the same contract as the product's Recent Sounds list.
export default function ProspectPage() {
  const memory = useRef(newMemory());
  const [history, setHistory] = useState<Heard[]>([]);
  const [busy, setBusy] = useState(false);

  // The remix and breed sources draw from curated library material, so the bench needs
  // the same pool the rest of the workbench builds.
  const [slots, setSlots] = useState<SlotOverrides>({});
  const [approved, setApproved] = useState<ApprovedPools>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Exclusions>({});
  const [toSort, setToSort] = useState<string[]>([]);
  const [opStats, setOpStats] = useState<OpStats>({});

  useEffect(() => {
    fetch("/api/slots").then((r) => r.json()).then(setSlots).catch(() => {});
    fetch("/api/pool").then((r) => r.json()).then(setApproved).catch(() => {});
    fetch("/api/deleted").then((r) => r.json()).then(setDeleted).catch(() => {});
    fetch("/api/duplicates").then((r) => r.json()).then(setDuplicates).catch(() => {});
    fetch("/api/exclusions").then((r) => r.json()).then(setExclusions).catch(() => {});
    fetch("/api/tosort").then((r) => r.json()).then(setToSort).catch(() => {});
    fetch("/api/creations-feedback").then((r) => r.json()).then(setOpStats).catch(() => {});
  }, []);

  const seeds: ProspectSeed[] = useMemo(() => {
    const pool = buildPool(reference, slots, approved, deleted, duplicates, exclusions, [], toSort);
    return pool.all.map((s) => ({ patch: s.patch, label: `${s.event} (${s.pack})` }));
  }, [slots, approved, deleted, duplicates, exclusions, toSort]);

  const current = history[0] ?? null;
  const keptCount = history.filter((h) => h.number !== undefined).length;

  const next = useCallback(() => {
    const drawn = prospect(memory.current, seeds, opStats);
    setHistory((prev) => [drawn, ...prev]);
    void playPatch(drawn.patch);
  }, [seeds, opStats]);

  const keep = useCallback(
    async (row: Heard) => {
      if (busy || row.number !== undefined) return;
      setBusy(true);
      try {
        const pool = await fetch("/api/pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "unsorted", patch: row.patch }),
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
        await post("origins", { id, origin: "invention" });
        await post("kept-dates", { id, date: new Date().toISOString().slice(0, 10) });
        await post("tosort", { id, tosort: true });
        const num = await post("numbers", { id });
        setHistory((prev) => prev.map((h) => (h.id === row.id ? { ...h, number: num?.number ?? 0 } : h)));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  // Space generates, k keeps the current draw, r replays it. Judging hundreds of sounds
  // should not require moving the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        next();
      } else if (e.key === "k" || e.key === "K") {
        if (current) void keep(current);
      } else if ((e.key === "r" || e.key === "R") && current) {
        void playPatch(current.patch);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, keep, current]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 font-mono text-sm">
      <button
        onClick={next}
        className="w-full rounded-xl bg-neutral-900 px-8 py-7 font-sans text-2xl font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.99] dark:bg-neutral-100 dark:text-black"
      >
        generate sound
      </button>

      <div className="mt-3 flex w-full gap-2">
        <button
          onClick={() => current && void playPatch(current.patch)}
          disabled={!current}
          className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 font-sans transition-colors hover:bg-neutral-500/10 disabled:opacity-30 dark:border-neutral-700"
        >
          replay
        </button>
        <button
          onClick={() => current && void keep(current)}
          disabled={!current || busy || current.number !== undefined}
          className="flex-[2] rounded-lg border border-emerald-600 px-4 py-3 font-sans font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-30 dark:text-emerald-400"
        >
          {current?.number !== undefined ? `kept #${current.number}` : "keep"}
        </button>
      </div>

      {current && current.nearestPct >= RELATED && (
        <p
          className={`mt-3 text-center text-[11px] font-bold ${dupeTone(current.nearestPct)}`}
          title={current.nearestLabel}
        >
          {current.nearestPct >= CLOSE ? "near-twin" : "close relative"} of{" "}
          {current.nearestLabel || "a library sound"} &middot; {current.nearestPct}% match
          {current.nearestPatch && (
            <button
              onClick={() => current.nearestPatch && void playPatch(current.nearestPatch)}
              title={`Play ${current.nearestLabel} to compare`}
              className="ml-2 rounded-md border border-current px-1.5 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-70"
            >
              ▶ compare
            </button>
          )}
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-neutral-400">
        space generates &middot; k keeps &middot; r replays
        {history.length > 0 && ` · ${history.length} heard · ${keptCount} kept`}
      </p>

      {history.length > 0 && (
        <div className="mt-6 max-h-[30rem] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <Table>
            <TableBody>
              {history.map((row, i) => (
                <TableRow
                  key={row.id}
                  className={
                    row.nearestPct >= CLOSE
                      ? "bg-orange-500/10"
                      : i === 0
                        ? "bg-neutral-500/5"
                        : undefined
                  }
                >
                  <TableCell className="w-10 tabular-nums text-neutral-400">{row.id}</TableCell>
                  <TableCell
                    className={`w-12 tabular-nums text-[11px] font-bold ${dupeTone(row.nearestPct)}`}
                    title={`Closest library sound: ${row.nearestLabel || "none"} (${row.nearestPct}% match)`}
                  >
                    {row.nearestPct}%
                  </TableCell>
                  <TableCell className="w-9">
                    {row.nearestPct >= CLOSE && row.nearestPatch && (
                      <button
                        onClick={() => row.nearestPatch && void playPatch(row.nearestPatch)}
                        title={`Play the original it resembles: ${row.nearestLabel}`}
                        className="rounded-md border border-orange-500 px-1.5 py-1 text-[10px] font-bold text-orange-600 transition-colors hover:bg-orange-500/10 dark:text-orange-400"
                      >
                        ▶orig
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="w-12">
                    <button
                      onClick={() => void playPatch(row.patch)}
                      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-black"
                    >
                      ▶
                    </button>
                  </TableCell>
                  <TableCell className="w-20">
                    {row.number !== undefined ? (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">#{row.number}</span>
                    ) : (
                      <button
                        onClick={() => void keep(row)}
                        disabled={busy}
                        className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
                      >
                        keep
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-[11px] text-neutral-400" title={row.label}>
                    {row.label}
                  </TableCell>
                  <TableCell className="w-24 text-right text-[11px] text-neutral-400">
                    {layersOf(row.patch).length}L · {Math.round(patchDuration(row.patch) * 1000)} ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
