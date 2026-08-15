"use client";

import { useState } from "react";
import { Button } from "@/components/ui/btn";
import { downloadSoundWav, soundToSnippet } from "@/lib/audio/export";
import { useProductStore, type SoundEntry } from "@/lib/store";
import { Check, Copy, Download, Play } from "lucide-react";

interface Props {
  onPlay: (entry: SoundEntry) => void;
}

export function HistoryList({ onPlay }: Props) {
  const history = useProductStore((s) => s.history);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const onExport = async (entry: SoundEntry) => {
    if (busy) return;
    setBusy(entry.id);
    try {
      await downloadSoundWav(entry);
    } finally {
      setBusy(null);
    }
  };

  const onCopy = async (entry: SoundEntry) => {
    await navigator.clipboard.writeText(soundToSnippet(entry));
    setCopied(entry.id);
    setTimeout(() => setCopied((id) => (id === entry.id ? null : id)), 1600);
  };

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Every sound you create shows up here, and it stays across refreshes.
      </p>
    );
  }

  return (
    <div className="max-h-[26rem] overflow-y-auto rounded-xl border bg-card shadow-sm">
      <ul className="divide-y">
        {history.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
            <Button shape="rounded" press="bounce" variant="ghost" size="icon-xs" aria-label="Play" onClick={() => onPlay(entry)}>
              <Play />
            </Button>
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{entry.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {entry.freqLabel} · {entry.duration.toFixed(2)}s
            </span>
            <Button
              shape="rounded"
              press="bounce"
              variant="ghost"
              size="icon-xs"
              aria-label="Copy JS"
              onClick={() => void onCopy(entry)}
            >
              {copied === entry.id ? <Check /> : <Copy />}
            </Button>
            <Button
              shape="rounded"
              press="bounce"
              variant="ghost"
              size="icon-xs"
              aria-label="Export WAV"
              disabled={busy === entry.id}
              onClick={() => void onExport(entry)}
            >
              <Download />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
