"use client";

import { useState } from "react";
import type { DelayEffect, Filter, Layer, Patch, Waveform } from "@/lib/audio/patch";
import { layersOf } from "@/lib/audio/patch";

// Workbench curation tool (generate view): nudge a generated patch before saving it to
// the pool. Modeled on a captured reference playground (kept in the local archive)
// but patch-native and chip-based. NOT the deferred product tweaker.

const WAVEFORMS: (Waveform | "noise")[] = ["sine", "triangle", "square", "sawtooth", "noise"];
const FILTER_TYPES = ["none", "lowpass", "highpass", "bandpass", "notch"] as const;

const DEFAULT_SHIMMER: DelayEffect = { type: "delay", delay: 0.12, feedback: 0.25, wet: 0.18, lowpass: 4000 };

function Chips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            value === opt
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-emerald-600"
      />
      <span className="w-14 shrink-0 text-right font-mono tabular-nums text-neutral-400">
        {value.toFixed(step < 1 ? (step < 0.01 ? 3 : 2) : 0)}
      </span>
    </div>
  );
}

export function TweakPanel({ patch, onChange }: { patch: Patch; onChange: (p: Patch) => void }) {
  const layers = layersOf(patch);
  const [active, setActive] = useState(0);
  const idx = Math.min(active, layers.length - 1);
  const layer = layers[idx];

  const update = (mutate: (l: Layer) => void) => {
    const next = layers.map((l) => structuredClone(l));
    mutate(next[idx]);
    onChange(next.length === 1 ? next[0] : { layers: next });
  };

  const src = layer.source;
  const isNoise = src.type === "noise";
  const freq = !isNoise && "frequency" in src ? src.frequency : undefined;
  const fStart = typeof freq === "object" ? freq.start : (freq ?? 440);
  const fEnd = typeof freq === "object" ? freq.end : 0;
  const filter = Array.isArray(layer.filter) ? layer.filter[0] : layer.filter;
  const shimmer = (layer.effects ?? []).find((e): e is DelayEffect => e.type === "delay");

  const setFreq = (start: number, end: number) =>
    update((l) => {
      if (l.source.type === "noise") return;
      l.source.frequency = end > 0 ? { start, end } : start;
    });

  const setFilter = (f: Filter | undefined) =>
    update((l) => {
      if (f) l.filter = f;
      else delete l.filter;
    });

  const setShimmer = (s: DelayEffect | undefined) =>
    update((l) => {
      const others = (l.effects ?? []).filter((e) => e.type !== "delay");
      const effects = s ? [...others, s] : others;
      if (effects.length > 0) l.effects = effects;
      else delete l.effects;
    });

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="mb-3 flex items-center gap-1 overflow-x-auto">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-neutral-400">tweak</span>
        {layers.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors ${
              idx === i
                ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            }`}
          >
            Layer {i + 1}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">source</span>
          <Chips
            value={src.type}
            options={WAVEFORMS}
            onChange={(v) =>
              update((l) => {
                if (v === "noise") {
                  l.source = { type: "noise", color: "white" };
                } else if (l.source.type === "noise") {
                  l.source = { type: v as Waveform, frequency: 440 };
                } else {
                  l.source = { ...l.source, type: v as Waveform };
                }
              })
            }
          />
        </div>

        {!isNoise && (
          <>
            <Range label="freq" value={fStart} min={20} max={4000} step={1} onChange={(v) => setFreq(v, fEnd)} />
            <Range label="freq end" value={fEnd} min={0} max={4000} step={1} onChange={(v) => setFreq(fStart, v)} />
          </>
        )}

        <div className="flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">filter</span>
          <Chips
            value={filter?.type ?? "none"}
            options={FILTER_TYPES}
            onChange={(v) =>
              setFilter(
                v === "none"
                  ? undefined
                  : { ...(filter ?? { frequency: 1000, Q: 1 }), type: v as BiquadFilterType },
              )
            }
          />
        </div>
        {filter && (
          <>
            <Range
              label="cutoff"
              value={filter.frequency}
              min={20}
              max={8000}
              step={1}
              onChange={(v) => setFilter({ ...filter, frequency: v })}
            />
            <Range
              label="Q"
              value={filter.Q ?? 1}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => setFilter({ ...filter, Q: v })}
            />
          </>
        )}

        <div className="flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">curve</span>
          <Chips
            value={layer.envelope?.curve === "ramp" ? "ramp" : "smooth"}
            options={["smooth", "ramp"]}
            onChange={(v) =>
              update((l) => {
                l.envelope = { decay: 0.1, ...l.envelope };
                if (v.startsWith("ramp")) l.envelope.curve = "ramp";
                else delete l.envelope.curve;
              })
            }
          />
        </div>
        <Range
          label="attack"
          value={layer.envelope?.attack ?? 0}
          min={0}
          max={0.5}
          step={0.001}
          onChange={(v) => update((l) => (l.envelope = { decay: 0.1, ...l.envelope, attack: v }))}
        />
        <Range
          label="decay"
          value={layer.envelope?.decay ?? 0.1}
          min={0.01}
          max={2}
          step={0.01}
          onChange={(v) => update((l) => (l.envelope = { ...l.envelope, decay: v }))}
        />
        <Range
          label="gain"
          value={layer.gain ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update((l) => (l.gain = v))}
        />
        <Range
          label="delay"
          value={layer.delay ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update((l) => (l.delay = v > 0 ? v : undefined))}
        />

        <div className="flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">echo</span>
          <Chips
            value={shimmer ? "on" : "off"}
            options={["off", "on"]}
            onChange={(v) => setShimmer(v === "on" ? { ...DEFAULT_SHIMMER } : undefined)}
          />
        </div>
        {shimmer && (
          <>
            <Range
              label="time"
              value={shimmer.delay}
              min={0.02}
              max={0.5}
              step={0.01}
              onChange={(v) => setShimmer({ ...shimmer, delay: v })}
            />
            <Range
              label="feedback"
              value={shimmer.feedback}
              min={0}
              max={0.9}
              step={0.01}
              onChange={(v) => setShimmer({ ...shimmer, feedback: v })}
            />
            <Range
              label="wet"
              value={shimmer.wet}
              min={0}
              max={0.6}
              step={0.01}
              onChange={(v) => setShimmer({ ...shimmer, wet: v })}
            />
            <Range
              label="tone"
              value={shimmer.lowpass ?? 4000}
              min={500}
              max={8000}
              step={50}
              onChange={(v) => setShimmer({ ...shimmer, lowpass: v })}
            />
          </>
        )}
      </div>
    </div>
  );
}
