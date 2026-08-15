"use client";

import { useState } from "react";
import { Button } from "@/components/ui/btn";
import { downloadSoundWav, soundToSnippet } from "@/lib/audio/export";
import type { SoundEntry } from "@/lib/store";

// Copy gives the SOUND only. The player is a one-time setup and lives in the steps under
// Recent Sounds, so a copied sound is the handful of lines that actually differ.
export function ExportButtons({ entry }: { entry?: SoundEntry | null }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onWav = async () => {
    if (!entry || busy) return;
    setBusy(true);
    try {
      await downloadSoundWav(entry);
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!entry) return;
    await navigator.clipboard.writeText(soundToSnippet(entry));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <Button
        size="xs"
        shape="rounded"
        press="bounce"
        hover="grow"
        variant="ghost"
        className={!entry || busy ? "" : "bg-muted text-foreground hover:bg-muted/70"}
        disabled={!entry || busy}
        onClick={() => void onWav()}
      >
        Export WAV
      </Button>
      <Button
        size="xs"
        shape="rounded"
        press="bounce"
        hover="grow"
        variant="ghost"
        className={!entry ? "" : "bg-muted text-foreground hover:bg-muted/70"}
        disabled={!entry}
        onClick={() => void onCopy()}
      >
        {copied ? "Copied" : "Copy sound"}
      </Button>
    </>
  );
}
