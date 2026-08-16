"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/audio/categories";
import {
  CRAFT_CATEGORIES,
  craftBatch,
  profileShape,
  type CraftResult,
  type VetoStore,
} from "@/lib/audio/craft";
import { layersOf, type Patch } from "@/lib/audio/patch";
import { patchDuration, playPatch } from "@/lib/audio/synth";
import { invertPatch } from "@/lib/audio/invert";

interface Row extends CraftResult {
  key: string;
}

type Kind = "instruments" | "figures" | "spaces";

// Each part of a draw gets its own colour, and the legend names them, so feedback can
// be aimed ("blur-three does not belong in tap") instead of describing a whole row.
const PART = {
  instrument: "text-purple-600 dark:text-purple-400",
  figure: "text-emerald-600 dark:text-emerald-400",
  space: "text-sky-600 dark:text-sky-400",
};

export default function CraftPage() {
  const [cat, setCat] = useState<Category | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [vetoes, setVetoes] = useState<VetoStore>({});
  const [keptCount, setKeptCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    fetch("/api/craft-vetoes")
      .then((r) => r.json())
      .then(setVetoes)
      .catch(() => {});
  }, []);

  const generate = useCallback(
    (c: Category, v: VetoStore) => {
      let n = seq;
      setRows(craftBatch(c, 20, v).map((res) => ({ key: `craft-${++n}`, ...res })));
      setSeq(n);
    },
    [seq],
  );

  const play = (p: Patch) => void playPatch(p);

  const keep = async (row: Row) => {
    if (!cat || busy) return;
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
      await post("numbers", { id });
      setKeptCount((k) => k + 1);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
    } finally {
      setBusy(false);
    }
  };

  const veto = async (kind: Kind, name: string) => {
    if (!cat) return;
    const next: VetoStore = {
      ...vetoes,
      [cat]: { ...vetoes[cat], [kind]: [...(vetoes[cat]?.[kind] ?? []), name] },
    };
    setVetoes(next);
    setRows((prev) =>
      prev.filter((r) =>
        kind === "instruments"
          ? r.instrument !== name && r.bodyInstrument !== name && r.transientInstrument !== name
          : kind === "figures"
            ? r.figure !== name
            : r.space !== name,
      ),
    );
    await fetch("/api/craft-vetoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat, kind, name }),
    }).catch(() => {});
  };

  const unveto = async (kind: Kind, name: string) => {
    if (!cat) return;
    setVetoes((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [kind]: (prev[cat]?.[kind] ?? []).filter((n) => n !== name) },
    }));
    await fetch("/api/craft-vetoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat, kind, name, on: false }),
    }).catch(() => {});
  };

  const shape = cat ? profileShape(cat, vetoes) : null;
  const catVetoes = cat ? vetoes[cat] : undefined;
  const vetoList: [Kind, string][] = catVetoes
    ? ([
        ...(catVetoes.instruments ?? []).map((n) => ["instruments", n]),
        ...(catVetoes.figures ?? []).map((n) => ["figures", n]),
        ...(catVetoes.spaces ?? []).map((n) => ["spaces", n]),
      ] as [Kind, string][])
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 pb-16 font-mono text-sm">
      <header className="py-6 font-sans">
        <h1 className="text-xl font-semibold tracking-tight">Craft</h1>
        <p className="mt-1 max-w-3xl leading-relaxed text-muted-foreground">
          Every draw is one <span className={PART.instrument}>instrument</span> (a physical object),
          playing one <span className={PART.figure}>figure</span> (a gesture), in one{" "}
          <span className={PART.space}>space</span> (the room). Cut discards a row and teaches
          nothing; the <span className="font-semibold">never</span> buttons remove a component from
          this category for good. Keeps land in the to-sort inbox with zero categories.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {CRAFT_CATEGORIES.map((c) => {
          const s = profileShape(c, vetoes);
          return (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                generate(c, vetoes);
              }}
              title={`${s.leads} instruments x ${s.figures} figures x ${s.spaces} spaces x ${s.intervals} interval sets = ${s.combos} recipes, each re-randomised per draw`}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                cat === c
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
              }`}
            >
              {c} <span className="opacity-60">· {s.combos} recipes</span>
            </button>
          );
        })}
      </div>

      {cat && shape && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => generate(cat, vetoes)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-bold text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-black"
            >
              generate 20 new
            </button>
            <button
              onClick={() => setRows([])}
              className="rounded-md border border-neutral-300 px-3 py-1.5 dark:border-neutral-700"
            >
              clear
            </button>
            <span className="ml-auto text-neutral-500">
              <span className={PART.instrument}>{shape.leads} instruments</span> ×{" "}
              <span className={PART.figure}>{shape.figures} figures</span> ×{" "}
              <span className={PART.space}>{shape.spaces} spaces</span> × {shape.intervals} interval
              sets = {shape.combos} recipes
              {keptCount > 0 && (
                <span className="ml-3 text-emerald-600 dark:text-emerald-400">kept {keptCount}</span>
              )}
            </span>
          </div>

          {vetoList.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-[11px] dark:border-neutral-800">
              <span className="text-neutral-500">never in {cat}:</span>
              {vetoList.map(([kind, name]) => (
                <button
                  key={`${kind}:${name}`}
                  onClick={() => void unveto(kind, name)}
                  title="Click to allow again"
                  className="rounded border border-neutral-300 px-1.5 py-0.5 line-through decoration-red-500 transition-colors hover:border-neutral-500 dark:border-neutral-700"
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
              >
                <span className="w-5 shrink-0 tabular-nums text-neutral-400">{i + 1}</span>
                <button
                  onClick={() => play(row.patch)}
                  className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1 font-bold text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-black"
                >
                  ▶
                </button>
                {cat === "transition" && (
                  <button
                    onClick={() => play(invertPatch(row.patch))}
                    title="Play the reversed direction (does it work as a door?)"
                    className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1 font-bold text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-black"
                  >
                    ⇄
                  </button>
                )}
                <button
                  onClick={() => void keep(row)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-emerald-600 px-2.5 py-1 font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
                >
                  keep
                </button>
                <button
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  className="shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-red-500 transition-colors hover:bg-red-500/10 dark:border-red-900"
                >
                  cut
                </button>

                <span className={`shrink-0 font-bold ${PART.instrument}`}>{row.instrument}</span>
                <button
                  onClick={() => void veto("instruments", row.instrument)}
                  title={`Never use ${row.instrument} in ${cat} again`}
                  className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 hover:border-red-400 hover:text-red-500 dark:border-neutral-800"
                >
                  never
                </button>
                {row.bodyInstrument && (
                  <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    +{row.bodyInstrument}
                  </span>
                )}
                {row.transientInstrument && (
                  <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                    +{row.transientInstrument}
                  </span>
                )}

                <span className={`shrink-0 ${PART.figure}`}>{row.figure}</span>
                <button
                  onClick={() => void veto("figures", row.figure)}
                  title={`Never use the ${row.figure} figure in ${cat} again`}
                  className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 hover:border-red-400 hover:text-red-500 dark:border-neutral-800"
                >
                  never
                </button>

                <span className={`shrink-0 ${PART.space}`}>{row.space}</span>
                <button
                  onClick={() => void veto("spaces", row.space)}
                  title={`Never use the ${row.space} space in ${cat} again`}
                  className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 hover:border-red-400 hover:text-red-500 dark:border-neutral-800"
                >
                  never
                </button>

                <span className="ml-auto shrink-0 text-neutral-400">
                  {layersOf(row.patch).length}L · {Math.round(patchDuration(row.patch) * 1000)} ms
                </span>
              </div>
            ))}
          </div>

          {rows.length === 0 && <p className="mt-4 text-xs text-neutral-500">Batch judged. Generate another.</p>}
        </div>
      )}

      {!cat && <p className="mt-4 text-xs text-neutral-500">Pick a category to craft a batch.</p>}
    </main>
  );
}
