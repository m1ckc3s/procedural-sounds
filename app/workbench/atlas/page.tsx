"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/audio/categories";
import {
  ARCHETYPE_INFO,
  FIGURE_INFO,
  GESTURE_INFO,
  INSTRUMENT_INFO,
  OP_INFO,
  PROSPECT_SOURCE_INFO,
  SPACE_INFO,
  WARP_INFO,
} from "@/lib/audio/atlas";
import { INSTRUMENTS } from "@/lib/audio/instruments";
import { FIGURES, SPACES } from "@/lib/audio/figures";
import { CRAFT_CATEGORIES, figuresFor, leadsFor, profileShape } from "@/lib/audio/craft";
import { archWeight, type InventStats } from "@/lib/audio/compose";
import { PALETTES, opWeight, type CreateOp, type OpStats } from "@/lib/audio/create";
import {
  ARCHETYPE_ORIGIN,
  archetypePrior,
  GESTURE_SPECS,
  gesturePrior,
  NEBULA_SCALES,
} from "@/lib/audio/invent";
import { MOTIF_ABLE, ULTRA_GESTURES, ULTRA_SCALES, WARP_NAMES } from "@/lib/audio/wild";
import type { TasteStore } from "@/lib/audio/taste";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CATS = CATEGORIES;
const ALL_OPS = Object.keys(OP_INFO) as CreateOp[];
const DECK = Object.keys(ULTRA_GESTURES);

const STOP_TONE: Record<string, string> = {
  v1: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  v2: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Invent: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  Wild: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Craft: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  Prospect: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
};

const FAMILY_ORDER = ["wood", "tine", "metal", "string", "body", "transient", "air", "digital", "sustained"] as const;

function Dice({ w, k, d, prior }: { w: number; k: number; d: number; prior?: number }) {
  const trained = k + d > 0;
  if (!trained && prior !== undefined) {
    return (
      <span
        title={`untrained - prior ${prior} (natural 0.5 / plausible 0.35 / suspect 0.2); first verdict overrides`}
        className="font-mono text-xs tabular-nums text-muted-foreground/50"
      >
        ~{prior.toFixed(2)}
      </span>
    );
  }
  if (w === 0) {
    return (
      <span
        title={`MUTED: ${d} deletes, zero keeps (threshold 5). Never drawn again; revive by editing the feedback file.`}
        className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-destructive"
      >
        ✕<span className="line-through opacity-70">{k}/{d}</span>
      </span>
    );
  }
  return (
    <span
      title={trained ? `${k} keeps / ${d} deletes` : "untrained (prior 0.5)"}
      className={`font-mono text-xs tabular-nums ${
        trained
          ? w >= 0.5
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-500"
          : "text-muted-foreground/50"
      }`}
    >
      {w.toFixed(2)}
      {trained && <span className="ml-1 opacity-50">{k}/{d}</span>}
    </span>
  );
}

function CatHead() {
  return (
    <>
      {CATS.map((c) => (
        <TableHead
          key={c}
          className="w-[76px] px-1 text-center text-[11px] font-medium leading-tight whitespace-normal capitalize"
        >
          {c === "notification" ? "notify" : c}
        </TableHead>
      ))}
    </>
  );
}

// Table cells sit at p-2 while the card header pads to --card-spacing (16px); the edge
// classes re-align column one and the last column with the title above them.
const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";
const WRAP = "whitespace-normal align-top leading-relaxed text-muted-foreground";

function SubHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-t px-4 pb-2 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children && <p className="max-w-3xl leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

function Section({
  title,
  stop,
  description,
  children,
}: {
  title: string;
  stop?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          {title}
          {stop && (
            <Badge variant="ghost" className={`${STOP_TONE[stop]} font-medium`}>
              {stop}
            </Badge>
          )}
        </CardTitle>
        {description && (
          <CardDescription className="max-w-3xl leading-relaxed">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

export default function Atlas() {
  const [inventStats, setInventStats] = useState<InventStats>({});
  const [opStats, setOpStats] = useState<OpStats>({});
  const [taste, setTaste] = useState<TasteStore>({});

  useEffect(() => {
    fetch("/api/invent-feedback").then((r) => r.json()).then(setInventStats).catch(() => {});
    fetch("/api/creations-feedback").then((r) => r.json()).then(setOpStats).catch(() => {});
    fetch("/api/taste").then((r) => r.json()).then(setTaste).catch(() => {});
  }, []);

  const iStats = (cat: Category, key: string) => inventStats[cat]?.[key] ?? { k: 0, d: 0 };
  const oStats = (cat: Category, op: CreateOp) => opStats[cat]?.[op] ?? { k: 0, d: 0 };

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 font-sans text-sm">
      <header className="py-6">
        <h1 className="text-xl font-semibold tracking-tight">Engine atlas</h1>
        <p className="mt-1 max-w-3xl leading-relaxed text-muted-foreground">
          Everything every generator can say, rendered live from the code constants and the
          current dice files. Hover any dice cell for its raw keep/delete tally.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">0.72</span>
            keeps favor it
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums text-amber-600 dark:text-amber-500">0.31</span>
            deletes winning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-destructive">
              ✕
            </span>
            muted · 5+ deletes, zero keeps
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums text-muted-foreground/50">~0.50</span>
            untrained prior
          </span>
        </div>
      </header>

      <Section
        title="Legend"
        description="The whole vocabulary. The product ships v1, v2 and the experimental button; the rest are workbench engines that fill the library those tiers draw from. Ingredients are the pieces each engine builds from, and the learning layer is what watches you curate."
      >
        <SubHead title="Engines — two ship as v1 and v2, one as experimental, the rest fill the library" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            {(
              [
                ["Library", ["v1"], "every sound a human kept in the workbench. Not a generator - the DNA bank everything else draws from. SHIPS, as the product's v1."],
                ["Variation", ["v1"], "frozen freshness nudge on a Library sound (pitch a hair, decay a hair). Never trained. Ships inside v1."],
                ["Creation", ["v2"], "ONE Library seed + 1-3 operations. A recognizable cousin. SHIPS, as the product's v2."],
                ["Invention", ["Invent"], "a brand-new sound from ONE of exactly three recipes: Hybrid, Archetype, or Character. Workbench only: it feeds the library rather than the product."],
                ["Discovery", ["Wild"], "70% Ultra: the full character deck on exotic scales. 30% Remix: library DNA cross-bred and warped. Workbench only now."],
                ["Craft", ["Craft"], "instrument x figure x space. Coherent physical objects rather than randomised parameters. Workbench only; it feeds the library."],
                ["Prospect", ["Prospect"], "one button drawing across FIVE engines at once, with no category. Workbench, plus the product's experimental button."],
              ] as const
            ).map(([term, stops, def]) => (
              <TableRow key={term}>
                <TableCell className="w-[130px] align-top font-medium">{term}</TableCell>
                <TableCell className="w-[124px] align-top">
                  {stops.map((st) => (
                    <Badge key={st} variant="ghost" className={`${STOP_TONE[st]} font-medium`}>
                      {st}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell className={WRAP}>{def}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="Ingredients — the pieces an engine builds from" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            {(
              [
                ["Operation", ["v2"], "one named transformation applied to a seed (swap-waveform, transpose-wide, add-shimmer...). Creation stacks 1-3; each is dice-trained per category."],
                ["Hybrid", ["Invent", "Wild"], "skeleton of Library parent A + timbre of Library parent B. A child, never a replay. Invent breeds inside the chosen category; Wild's Remix breeds across categories."],
                ["Archetype", ["Invent", "Wild"], "a hand-written grammar (clean-blip, stairs, arpeggio...); drawable in every category since the fusion. Wild's Remix also draws them off-leash, then warps."],
                ["Character", ["Invent", "Wild"], "a hand-written playable figure from the shared deck (boop, bell, pluck...; code calls these gestures). Invent hands it a tame contract (category register, consonant scales); Wild hands it an exotic one - same character, different rules."],
                ["Warp", ["Wild"], "Wild's version of an operation (fm-inject, filter-drama...). Wilder, and never trained. Remix's deep branch takes 2-4; half of its plain cross-breeds take exactly one."],
              ] as const
            ).map(([term, stops, def]) => (
              <TableRow key={term}>
                <TableCell className="w-[130px] align-top font-medium">{term}</TableCell>
                <TableCell className="w-[124px] align-top">
                  <div className="flex flex-wrap gap-1">
                    {stops.map((st) => (
                      <Badge key={st} variant="ghost" className={`${STOP_TONE[st]} font-medium`}>
                        {st}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className={WRAP}>{def}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="The learning layer — and the one law" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            {(
              [
                ["Patch", "the JSON recipe every sound IS - layers, envelopes, filters. Everything above produces patches."],
                ["Dice", "per-recipe keep/delete weights (WHICH molds you like). 5 straight deletes mutes a mold."],
                ["Taste", "per-feature buckets (WHY a verdict happened), anomaly-weighted blame."],
                ["Twin ring", "the perceptual neighborhood of each queue-rejected patch is banned, on a 200-per-category ring that evicts oldest first."],
                ["Clamps", "hand-set ear-safety law from Calibrate. Not learned. Two of them, the buzz floor and the absolute ceiling, sit outside the prominence gate and cannot be opened by it."],
              ] as const
            ).map(([term, def]) => (
              <TableRow key={term}>
                <TableCell className="w-[130px] align-top font-medium">{term}</TableCell>
                <TableCell className={WRAP}>{def}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Library"
        stop="v1"
        description="Every sound a human kept, slotted, and numbered. Membership: a keep is its manual slots; an import is manual slots ∪ gates − vetoes. Deletes and duplicates never resurface. The product's v1 plays these as-is (favorites drawn 1.5x), optionally through a Variation nudge. This library is also the parent DNA for Creation seeds, Invention hybrids, and Discovery remixes."
      >
        <p className="px-6 text-muted-foreground">
          No dice: nothing here is generated, so there is nothing to train. Curate it on the{" "}
          <span className="font-medium text-foreground">Library</span> page.
        </p>
      </Section>

      <Section
        title="Creations"
        stop="v2"
        description="One Library seed plus 1-3 operations, each a named transformation of that seed. Dice are per-category: a dot means the operation is not in that category's palette."
      >
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Operation</TableHead>
              <TableHead className="whitespace-normal">What it does</TableHead>
              <CatHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_OPS.map((op) => (
              <TableRow key={op}>
                <TableCell className="align-top font-medium">{op}</TableCell>
                <TableCell className={WRAP}>{OP_INFO[op]}</TableCell>
                {CATS.map((c) => (
                  <TableCell key={c} className="px-2 text-center align-top">
                    {PALETTES[c].includes(op) ? (
                      <Dice w={opWeight(opStats, c, op)} {...oStats(c, op)} />
                    ) : (
                      <span className="text-muted-foreground/25">·</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Invent"
        stop="Invent"
        description={
          <>
            One pull = one of three recipes. Invent first rolls the Hybrid share, otherwise
            runs ONE dice lottery over ALL Archetypes and ALL Characters together — every one of
            them drawable in every category since the fusion. Untrained cells start at a tiered
            prior (~0.50 natural / ~0.35 plausible / ~0.20 suspect); your first verdict
            replaces it with real dice. None of Creation&apos;s ops apply here.
          </>
        }
      >
        <SubHead title="Recipe 1 of 3 · Hybrids">
          Skeleton from Library parent A, timbre from parent B; the child never existed. Share
          of all Invent pulls = 0.6 × hybrid dice weight, capped at 45% (prior lands at 30%).
        </SubHead>
        <Table className={EDGE}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Category</TableHead>
              <CatHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Share of pulls</TableCell>
              {CATS.map((c) => (
                <TableCell key={c} className="px-2 text-center font-mono text-xs tabular-nums">
                  {Math.round(Math.min(0.45, 0.6 * archWeight(inventStats, c, "hybrid")) * 100)}%
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Dice</TableCell>
              {CATS.map((c) => (
                <TableCell key={c} className="px-2 text-center">
                  <Dice w={archWeight(inventStats, c, "hybrid")} {...iStats(c, "hybrid")} />
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>

        <SubHead title="Recipe 2 of 3 · Archetypes">
          Hand-written grammars, every one drawable in every category since the fusion. Grey
          ~priors still vary by column: each archetype&apos;s origin category seeds a higher
          untrained value at home than away.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Archetype</TableHead>
              <TableHead className="whitespace-normal">What it is</TableHead>
              <CatHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(ARCHETYPE_ORIGIN).map((a) => (
              <TableRow key={a}>
                <TableCell className="align-top font-medium">{a}</TableCell>
                <TableCell className={WRAP}>{ARCHETYPE_INFO[a] ?? ""}</TableCell>
                {CATS.map((c) => (
                  <TableCell key={c} className="px-2 text-center align-top">
                    <Dice
                      w={archWeight(inventStats, c, a)}
                      {...iStats(c, a)}
                      prior={archetypePrior(c, a)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="Recipe 3 of 3 · Characters">
          One shared deck serves two engines: Invent draws it on the tamed contract below
          (consonant scales only — {NEBULA_SCALES.join(", ")}), Wild draws it at full
          strength. ♪ marks characters that may elaborate into a 2-3 note motif.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Character</TableHead>
              <TableHead className="whitespace-normal">Shape</TableHead>
              <TableHead className="w-[170px] whitespace-normal">Feel</TableHead>
              <CatHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {DECK.map((g) => {
              const info = GESTURE_INFO[g];
              return (
                <TableRow key={g}>
                  <TableCell className="align-top font-medium">
                    {g}
                    {MOTIF_ABLE.has(g) && (
                      <span
                        title="may elaborate into a 2-3 note motif"
                        className="ml-1 text-muted-foreground"
                      >
                        ♪
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={WRAP}>{info?.shape ?? ""}</TableCell>
                  <TableCell className={WRAP}>{info?.character ?? ""}</TableCell>
                  {CATS.map((c) => (
                    <TableCell key={c} className="px-2 text-center align-top">
                      <Dice
                        w={archWeight(inventStats, c, `g:${g}`)}
                        {...iStats(c, `g:${g}`)}
                        prior={gesturePrior(c, g)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <SubHead title="The tamed contract" />
        <Table className={EDGE}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Constraint</TableHead>
              <CatHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Register (Hz)</TableCell>
              {CATS.map((c) => (
                <TableCell key={c} className="px-2 text-center font-mono text-xs tabular-nums">
                  {GESTURE_SPECS[c].root[0]}–{GESTURE_SPECS[c].root[1]}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Shimmer chance</TableCell>
              {CATS.map((c) => (
                <TableCell key={c} className="px-2 text-center font-mono text-xs tabular-nums">
                  {Math.round(GESTURE_SPECS[c].shimmer * 100)}%
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Wild"
        stop="Wild"
        description={
          <>
            Every pull flips a weighted coin. <strong className="font-medium text-foreground">Ultra (70%)</strong>{" "}
            is totally new — no library DNA anywhere: the full deck ({DECK.length} characters) on
            exotic contracts ({Object.keys(ULTRA_SCALES).join(", ")}), with motif elaboration,
            duets (~20% of single-strike pulls), transient ticks, shimmer/reverb tails, loudness
            normalization. Coherent by construction, bounded by the deck&apos;s vocabulary.{" "}
            <strong className="font-medium text-foreground">Remix (30%)</strong> is real library
            DNA deformed — the only place curated sounds get bred across categories and warped,
            and the only consumer of the Warp ops below. Its deep branch takes 2-4 warps; of
            the plainer cross-breeds, half now take exactly ONE warp and half ship straight
            (settled by A/B ear test), so the &quot;almost belongs&quot; tail keeps
            both ends of its range. It produces &quot;familiar gone strange&quot;, which Ultra
            structurally cannot. Untrained by design: no dice, no taste, ever.
          </>
        }
      >
        <Table className={EDGE}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">Warp operation</TableHead>
              <TableHead>What it does</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WARP_NAMES.map((w) => (
              <TableRow key={w}>
                <TableCell className="align-top font-medium">{w}</TableCell>
                <TableCell className={WRAP}>{WARP_INFO[w] ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Taste"
        description="The WHY layer. Every keep/delete logs the full patch, and nine features get tallied: pitch band, waveform harshness, duration, attack, filter type, layer count, shimmer, noise, sweep. A bucket needs 4+ verdicts to influence anything. Deletes are anomaly-weighted, so blame lands on the features that look unusual next to this category's keeps. Ring = deleted-twin fingerprints: anything perceptually close to a deleted sound is never surfaced again."
      >
        <div className="space-y-4 px-6">
          {CATS.map((cat) => {
            const t = taste[cat];
            if (!t) return null;
            const keys = Object.keys(t.buckets).sort();
            return (
              <div key={cat}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">{cat}</span>
                  <Badge variant="outline" className="font-mono text-[10px] font-normal tabular-nums">
                    ring {t.deleted.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {keys.map((b) => {
                    const { k, d } = t.buckets[b];
                    const matured = k + d >= 4;
                    const score = (k + 1) / (k + d + 2);
                    return (
                      <span
                        key={b}
                        title={`${k} keeps / ${Math.round(d * 10) / 10} deletes`}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
                      >
                        <span className="text-muted-foreground">{b}</span>
                        <span
                          className={`font-mono tabular-nums ${
                            !matured
                              ? "text-muted-foreground/50"
                              : score >= 0.5
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-500"
                          }`}
                        >
                          {matured ? score.toFixed(2) : "young"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Instruments"
        stop="Craft"
        description={
          <>
            The timbre half of the instrument-first engine. Each entry renders ONE note of one
            coherent physical object and knows the register it is plausible at, how it gives up
            its energy, and its highest sounding partial. No dice: this bank is not trained, it
            is designed, and a draw that is wrong is a rule to edit rather than a verdict to
            file. STRUCK objects ramp to silence with no sustain; RINGING and SUSTAINED ones use
            the natural exponential tail. Getting that one distinction wrong is what made
            earlier output read as synthetic rather than physical.
          </>
        }
      >
        {FAMILY_ORDER.map((fam) => {
          const rows = INSTRUMENTS.filter((i) => i.family === fam);
          if (rows.length === 0) return null;
          return (
            <div key={fam}>
              <SubHead title={fam} />
              <Table className={`table-fixed ${EDGE}`}>
                <TableBody>
                  {rows.map((inst) => (
                    <TableRow key={inst.name}>
                      <TableCell className="w-[150px] align-top font-medium">{inst.name}</TableCell>
                      <TableCell className="w-[110px] align-top text-muted-foreground">
                        {inst.decay}
                        {inst.unpitched && <span className="ml-1 opacity-60">· unpitched</span>}
                      </TableCell>
                      <TableCell className="w-[130px] align-top font-mono text-xs tabular-nums text-muted-foreground">
                        {inst.unpitched ? "—" : `${Math.round(inst.register[0])}–${Math.round(inst.register[1])} Hz`}
                        {inst.topRatio && <span className="ml-1 opacity-60">·{inst.topRatio}x</span>}
                      </TableCell>
                      <TableCell className={WRAP}>{INSTRUMENT_INFO[inst.name] ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </Section>

      <Section
        title="Figures and spaces"
        stop="Craft"
        description="A figure decides WHAT IS PLAYED and names no timbre at all; an instrument supplies the sound. Keeping the two apart is the point: one gesture can be a wooden bar, a thumb piano or a struck tube without any of the three sounding mashed together. Roles let a single draw combine objects, which is what the hand-curated keepers kept turning out to be."
      >
        <SubHead title="Figures" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Figure</TableHead>
              <TableHead className="w-[110px]">Motion</TableHead>
              <TableHead className="w-[130px]">Roles</TableHead>
              <TableHead className="whitespace-normal">What it plays</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FIGURES.map((f) => {
              const roles = [...new Set(f.build(() => 0.5, [4, 7, 12]).map((e) => e.role))];
              return (
                <TableRow key={f.name}>
                  <TableCell className="align-top font-medium">{f.name}</TableCell>
                  <TableCell className="align-top text-muted-foreground">{f.motion}</TableCell>
                  <TableCell className="align-top text-muted-foreground">{roles.join(", ")}</TableCell>
                  <TableCell className={WRAP}>{FIGURE_INFO[f.name] ?? ""}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <SubHead title="Spaces">
          Ambience is budgeted against the category&apos;s own note length, so a category that
          wants its sounds gone in a quarter second is never handed a two-second echo.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            {Object.keys(SPACES).map((name) => (
              <TableRow key={name}>
                <TableCell className="w-[150px] align-top font-medium">{name}</TableCell>
                <TableCell className={WRAP}>{SPACE_INFO[name] ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Craft"
        stop="Craft"
        description={
          <>
            The caster. A draw is instrument x figure x space, and the root is placed so the
            instrument&apos;s highest PARTIAL already clears the category ceiling: nothing is
            generated and then rescued by clamping. Counts below are live, and drop as you veto
            components on the Craft bench. A recipe is not a sound: every one of them
            re-randomises pitch, decay, gap and strike force on each draw, so the reachable
            sounds are unbounded and these are only the skeletons.
          </>
        }
      >
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Category</TableHead>
              <TableHead className="w-[110px]">Instruments</TableHead>
              <TableHead className="w-[110px]">Figures</TableHead>
              <TableHead className="w-[110px]">Spaces</TableHead>
              <TableHead className="w-[110px]">Interval sets</TableHead>
              <TableHead className="whitespace-normal">Recipes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CRAFT_CATEGORIES.map((c) => {
              const shape = profileShape(c);
              return (
                <TableRow key={c}>
                  <TableCell className="align-top font-medium capitalize">{c}</TableCell>
                  <TableCell className="align-top font-mono tabular-nums">{leadsFor(c).length}</TableCell>
                  <TableCell className="align-top font-mono tabular-nums">{figuresFor(c).length}</TableCell>
                  <TableCell className="align-top font-mono tabular-nums">{shape.spaces}</TableCell>
                  <TableCell className="align-top font-mono tabular-nums">{shape.intervals}</TableCell>
                  <TableCell className="align-top font-mono tabular-nums text-muted-foreground">
                    {shape.combos}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Prospect — five engines behind one button"
        stop="Prospect"
        description={
          <>
            The discovery bench, and the only surface that draws across engines. Every press
            picks ONE of five sources, each contributing something none of the others can, then
            sends the result through a single finishing pass so they arrive at a common
            standard. There is no category and no learning: keep it or move on.
          </>
        }
      >
        <SubHead title="The five sources" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Source</TableHead>
              <TableHead className="w-[190px]">Engine it comes from</TableHead>
              <TableHead className="w-[90px]">Share</TableHead>
              <TableHead className="whitespace-normal">What only it can do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(PROSPECT_SOURCE_INFO).map(([name, info]) => (
              <TableRow key={name}>
                <TableCell className="align-top font-medium">{name}</TableCell>
                <TableCell className="align-top font-mono text-xs text-muted-foreground">
                  {info.engine}
                </TableCell>
                <TableCell className="align-top font-mono tabular-nums text-muted-foreground">
                  {info.share}
                </TableCell>
                <TableCell className={WRAP}>{info.why}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="The finishing pass">
          Source-blind on purpose. A rule only some engines obey is a rule that leaks, and every
          quality complaint this project logged (piercing, harsh, drags, clipping, thin) was a
          failure of one of these four.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            {(
              [
                ["Register", "whole-patch octave drops until the highest tonal partial clears 1050 Hz, which sits under the calibrated sine ceiling. Whole-patch, so intervals and direction survive."],
                ["Length", "an envelope running past 0.85 s scales its delays, decays and releases down together."],
                ["Tail", "a gentle shimmer on about two thirds of draws that brought none. The single change that most reliably reads as finished rather than raw."],
                ["Level", "layers balanced against each other, the sum clamped to a 0.5 budget, then the ear-safety clamps."],
              ] as const
            ).map(([term, def]) => (
              <TableRow key={term}>
                <TableCell className="w-[150px] align-top font-medium">{term}</TableCell>
                <TableCell className={WRAP}>{def}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="Anti-repetition">
          Two guards, both at the same 0.15 perceptual threshold the rest of the workbench uses.
          A draw is re-rolled up to 40 times until it clears BOTH.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableBody>
            <TableRow>
              <TableCell className="w-[150px] align-top font-medium">Session</TableCell>
              <TableCell className={WRAP}>
                the last 160 sounds of the sitting, so nothing repeats what you just heard.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="align-top font-medium">Library</TableCell>
              <TableCell className={WRAP}>
                every sound you already own. This one matters because the remix source starts
                from a curated sound and can drift back within reach of its own parent, which is
                a duplicate rather than a discovery. Near misses that clear the bar are still
                flagged with a match percentage, and above 70% the row offers the original for
                comparison.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="How the learning works">
        <div className="grid gap-4 px-6 sm:grid-cols-2">
          {(
            [
              [
                "1 · Dice — WHICH mold",
                "Creations ops and Invent archetypes/characters/hybrid each learn weight = (keeps + 1) / (keeps + deletes + 2), starting 0.5. 5+ deletes with zero keeps mutes a key; revival is a manual feedback-file edit. Deliberately no exploration floor.",
              ],
              [
                "2 · Taste — WHY",
                "Feature buckets learn across all molds at once, with anomaly-weighted delete blame, so deleting a half-good sound for its piercing layer barely touches the innocent features.",
              ],
              [
                "3 · Twin ring — not again, for a while",
                "The deleted-twin ring blacklists the perceptual neighborhood of every Creations or Invent rejection. It holds the most recent 200 per category and evicts oldest first, so an old delete stops suppressing its neighbourhood once the ring rolls over. Library deletes do not enter it.",
              ],
              [
                "The law — clamps",
                "limits.ts, the Calibrate clamps: hard ear-safety ceilings, set by hand, never learned.",
              ],
              [
                "Product tournament",
                "Rolls 4 candidates, skips deleted-twins, weights by tasteScore² × novelty² (novelty = perceptual distance to your last 6 pulls), and avoids the last 3 archetype keys (hybrids: the same parent pair).",
              ],
              [
                "What never learns",
                "Wild and Prospect learn nothing, by design. The experimental button only adds a best-of-3 freshness pick, which never updates any weights.",
              ],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="rounded-lg border p-3">
              <div className="mb-1 text-xs font-semibold">{title}</div>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Under the hood"
        description="The whole system in plain language: where the sounds come from, how each generator works, and how curation trains them. Written for someone seeing this for the first time."
      >
        <SubHead title="It all starts with a curated library">
          Every sound in this product is a <span className="font-medium text-foreground">recipe</span>,
          not a recording: a small JSON patch describing oscillator or noise layers, envelopes,
          filters, and effects, played live by the Web Audio API. There is no sampling and no
          neural net anywhere. The foundation is a library of thousands of hand-kept recipes:
          candidates were generated, listened to one by one, and most were deleted. What survived
          is the DNA bank. Every generator below either plays that library, remixes it, breeds
          it, or is trained by verdicts on its own output. Human ears are the model.
        </SubHead>

        <SubHead title="The engines are increasing distance from the library">
          <span className="font-medium text-foreground">v1</span> plays curated sounds
          as-is, sometimes through a tiny variation nudge (a hair of pitch or decay) so repeats
          stay fresh; same character every time.{" "}
          <span className="font-medium text-foreground">v2</span> takes ONE library sound and
          applies 1 to 3 named operations from the table above; you get a recognizable cousin.{" "}
          <span className="font-medium text-foreground">Invent</span> writes a brand-new sound
          that never replays a library entry, via one of three recipes: breed two library
          parents (Hybrid), perform a hand-written grammar (Archetype), or hand a character
          from the shared deck a tamed contract. Every Invent recipe is dice-trained.{" "}
          <span className="font-medium text-foreground">Wild</span> is the untrained
          frontier: 70% pure de-novo (the full character deck on exotic contracts, zero library
          DNA) and 30% library DNA bred across categories and warped. Only the first two ship on
          the product, as v1 and v2; the rest run in the workbench, and the experimental button
          samples across them. Anything kept from any engine lands back in the library inbox,
          gets sorted, and becomes parent DNA for the next generation. That loop is the whole
          product.
        </SubHead>

        <SubHead title="Contracts: tamed vs exotic">
          A <span className="font-medium text-foreground">contract</span> is the bundle of rules
          a character performs within: root pitch, musical scale, waveform, attack speed, note
          spacing. The same character code plays both kinds; only the contract changes. The{" "}
          <span className="font-medium text-foreground">tamed</span> contract (Invent) proposes a
          root inside the category&apos;s register band (about a third of the characters
          re-clamp it to their own register), allows only consonant scales
          ({NEBULA_SCALES.join(", ")}), leans heavily sine, and applies per-category taming
          where a category declares any: only hover and tap do (hover squeezes gain and decay,
          tap shortens); the other five are constrained by the pitch band alone. The{" "}
          <span className="font-medium text-foreground">exotic</span> contract (Wild)
          opens the full scale set ({Object.keys(ULTRA_SCALES).join(", ")}), any waveform, FM,
          and wider ranges on everything. A boop is still a boop in both worlds; Wild
          just lets it say stranger things.
        </SubHead>

        <SubHead title="How Remix relates to Hybrid">
          Both use the same breeding function: skeleton (layer count, timing, envelopes) from
          parent A, timbre (waveforms, registers, effects) from parent B; the child never
          existed. Invent&apos;s Hybrid breeds two parents from the SAME category, prefers
          parents from different origins, and its share of pulls is dice-trained.
          Wild&apos;s Remix breeds ACROSS categories, may also draw archetypes off-leash,
          then piles on warps (2-4 on its deep branch, exactly one on half of the plain
          cross-breeds), and never trains. Remix is the only path that produces &quot;familiar
          gone strange&quot;; pure de-novo structurally cannot, because it contains no library
          DNA to recognize.
        </SubHead>

        <SubHead title="The module map">
          Every system, one line each. Generators on top, the learning and scoring stack below
          them, infrastructure last.
        </SubHead>
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Module</TableHead>
              <TableHead className="whitespace-normal">What it does</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              [
                ["randomize.ts", "pool build (membership = slots ∪ gates − vetoes) + the weighted library draw (favorites 1.5x) + the FROZEN variation engine: one shared pitch ratio (±3 semitones) and delay factor across all layers, per-layer texture jitter, so intervals and rhythm survive the mutation."],
                ["create.ts", "the Creator: one library seed + 1-3 structural ops sampled from the category's palette, each op dice-weighted per category."],
                ["compose.ts", "the Composer: hand-written per-category archetype grammars, plus hybridize(): skeleton (layer count, onsets, envelopes) from parent A, timbre (waveforms, registers, effects) from parent B."],
                ["invent.ts", "the Invent draw: ONE weighted lottery over every archetype and every character in every category (~470 trainable cells), tiered code priors on untrained cells, tamed contracts, per-category taming."],
                ["wild.ts", "the character deck (35 hand-written playable figures), exotic contracts, the warp ops, and the three untrained paths: ultraWild (de novo), wild (library remix), discovery (the 70/30 blend)."],
                ["taste.ts", "the WHY learner: 9-feature bucketization, tasteScore, anomaly-weighted delete blame, and the deleted-twin ring."],
                ["similarity.ts", "hand-built perceptual distance in feature space (onset-ordered layer alignment, log-pitch in semitones, calibrated deadzones, gain deliberately excluded). One metric serves dedupe triage, tournament novelty, and the twin ring."],
                ["gates.ts", "mechanical + semantic casting of any patch into categories from its acoustics; one half of the membership formula, veto-able per sound."],
                ["limits.ts", "hand-calibrated ear-safety clamps enforced on every generation path. The law, never learned."],
                ["loudness.ts", "offline-render measurement → play-time volume solve per drawn category (master target + per-category offsets + partial-normalization strength). Sounds are never rewritten."],
                ["invert.ts", "directional mirror: reverses layer order in time and flips glide directions, deriving off/close/exit from on/open/enter."],
                ["patch.ts / synth.ts", "the Patch schema (the single IR every module above reads and writes) and the player that compiles a Patch into a Web Audio node graph."],
              ] as const
            ).map(([mod, role]) => (
              <TableRow key={mod}>
                <TableCell className="whitespace-normal break-words align-top font-mono text-xs">{mod}</TableCell>
                <TableCell className={WRAP}>{role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <SubHead title="The learning stack, precisely">
          Every keep/delete is an online training signal that updates three learners at once.
          No gradients, no embeddings, no offline training runs: it is human-in-the-loop
          Bayesian bookkeeping, and all of it is inspectable JSON.
        </SubHead>
        <div className="grid gap-4 px-4 pb-2 sm:grid-cols-2">
          {(
            [
              [
                "Dice · smoothed Beta posteriors per cell",
                "Each category × recipe cell holds a keep/delete tally; its draw weight is the posterior mean (k+1)/(k+d+2) under a Beta(1,1) prior, i.e. Laplace-smoothed keep rate. The Invent lottery samples cells ∝ weight. Untrained cells use hand-set informative priors (0.50 natural / 0.35 plausible / 0.20 suspect) encoding sound-design judgment; the first real verdict replaces the prior entirely. 5 deletes with 0 keeps hard-mutes the cell: weight 0, never drawn, no exploration floor by design.",
              ],
              [
                "Taste · anomaly-weighted credit assignment",
                "Every patch is discretized into 9 perceptual features (pitch band, waveform harshness, duration, attack, filter type, layer count, shimmer, noise, sweep); each bucket is its own smoothed keep-rate, matured at 4+ verdicts. A keep credits all 9 buckets fully. A delete distributes blame ∝ how anomalous each feature value is among this category's own keeps (1 − k_bucket/k_feature, renormalized to constant total mass), so one piercing layer takes the hit instead of the 8 innocent features. Cold features (<4 keeps) take zero blame.",
              ],
              [
                "Twin ring · instance-based negative memory",
                "Every deleted patch is stored verbatim (ring buffer, cap 200 per category). Any candidate within perceptual distance 0.30 of any stored delete is rejected before you ever hear it. The threshold sits between the dedupe metric's identical (0.05) and family (0.45) tiers: close enough that the ear says \"that thing I already rejected\".",
              ],
              [
                "Tournament · rejection sampling + softened argmax",
                "Each product v2 pull generates up to 16 candidates to collect 4 that pass the twin-ring filter, drops recently-played molds (last 3 archetype keys; hybrids: same parent pair), then samples the winner ∝ (tasteScore × novelty)². Novelty = clamp(minimum perceptual distance to the last 6 pulls / 0.45, floor 0.3). Sampling, not argmax: argmax collapsed every pull onto the taste mode. Squaring sharpens without collapsing.",
              ],
              [
                "Priors as weights, not walls",
                "The fusion removed all binary eligibility: every archetype and character is drawable in every category. Curatorial judgment moved into the prior tiers, so a \"wrong\" pairing is merely improbable until evidence arrives, and evidence always wins over the prior, in both directions.",
              ],
              [
                "What deliberately does NOT learn",
                "Wild (both branches) and the variation engine: the exploration edge stays strange and the freshness nudge stays frozen. Clamps and the loudness solve are hand-calibrated, not fitted. The frontier feeds back only one way: a kept Wild sound gets sorted into the library and becomes parent DNA.",
              ],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="rounded-lg border p-3">
              <div className="mb-1 text-xs font-semibold">{title}</div>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <SubHead title="Surfaced names vs code names" />
        <Table className={`table-fixed ${EDGE}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px] whitespace-normal">Surfaced name</TableHead>
              <TableHead className="w-[230px] whitespace-normal">Code</TableHead>
              <TableHead className="whitespace-normal">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              [
                ["v1 / Library", "generate() · randomize.ts", "stored key stays `core`; library draw + optional variation nudge"],
                ["Variation", "mutatePatch() · randomize.ts", "frozen; runtime freshness only, never stockpiled"],
                ["v2 / Creations", "createFrom() · create.ts", "one seed + 1-3 ops from the per-category palette"],
                ["Invent", "invent() · invent.ts", "code key stays `nebula`; one lottery over hybrid + archetypes + characters"],
                ["Archetype", "compose() · compose.ts", "hand-written per-category grammars"],
                ["Character", "ULTRA_GESTURES · wild.ts", "code calls these gestures; one deck serves Invent and Wild"],
                ["Hybrid", "hybridize() · compose.ts", "shared by Invent (within category) and Remix (across categories)"],
                ["Wild", "discovery() · wild.ts", "one dial, ultraShare; runs at 0.7"],
                ["Ultra", "ultraWild() · wild.ts", "de novo, zero library DNA; only clamps apply"],
                ["Remix", "wild() · wild.ts", "off-leash hybrids + archetypes + warps, then Ultra's finishing pass"],
              ] as const
            ).map(([name, code, note]) => (
              <TableRow key={name}>
                <TableCell className="whitespace-normal break-words align-top font-medium">{name}</TableCell>
                <TableCell className="whitespace-normal break-words align-top font-mono text-xs">{code}</TableCell>
                <TableCell className={WRAP}>{note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </main>
  );
}
