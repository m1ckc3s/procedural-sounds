"use client";

import { useState } from "react";
import { Button } from "@/components/ui/btn";
import { PLAYER_JS } from "@/lib/audio/export";

// The split the export makes: the PLAYER is setup and you take it once, a SOUND is data and
// you take one per sound. These steps exist so that split is obvious before anyone wonders
// why a copied sound is four lines instead of a working file.
const EXAMPLE = `button.addEventListener("click", () => playSound(readyRemix));`;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] tabular-nums text-muted-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function UsageSteps() {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(PLAYER_JS);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <ol className="space-y-6">
      <Step n={1} title="Paste the player into your project, once">
        <p className="text-balance">
          One function, no dependencies, about 4kb. It turns a sound into Web Audio nodes and
          it is the same code for every sound you ever export.
        </p>
        <Button
          size="xs"
          shape="rounded"
          press="bounce"
          hover="grow"
          variant="ghost"
          className="mt-2 bg-card shadow-100 enabled:hover:bg-card enabled:hover:shadow-200"
          onClick={() => void onCopy()}
        >
          {copied ? "Copied" : "Copy player"}
        </Button>
      </Step>

      <Step n={2} title="Copy any sound you like">
        <p className="text-balance">
          Copy sound gives you the recipe and nothing else: a plain object of layers,
          envelopes and filters. Take as many as you want, they all run on the one player.
        </p>
      </Step>

      <Step n={3} title="Play it wherever the interface needs it">
        <pre className="mt-1 overflow-x-auto rounded-lg border bg-card px-3 py-2 font-mono text-[12px] text-foreground">
          {EXAMPLE}
        </pre>
      </Step>
    </ol>
  );
}
