import { create } from "zustand";
import type { Patch } from "@/lib/audio/patch";

export interface SoundEntry {
  id: string;
  name: string;
  category: string | null;
  freqLabel: string;
  duration: number;
  patch: Patch;
  at: number;
  volume?: number; // loudness-leveling multiplier solved at generate time (loudness.ts)
}

interface ProductStore {
  current: SoundEntry | null;
  history: SoundEntry[];
  setCurrent: (entry: SoundEntry) => void;
  restore: (id: string) => void;
  clearHistory: () => void;
}

// Session-scoped on purpose, no persistence: a refresh starts clean. It used to persist to
// localStorage uncapped, and with every heard sound kept, the synchronous JSON.parse of that
// blob at page load was the reload hitch. Export is the way to keep a sound, not this list.
const HISTORY_CAP = 40;

export const useProductStore = create<ProductStore>()((set, get) => ({
  current: null,
  history: [],
  setCurrent: (entry) =>
    set((s) => ({
      current: entry,
      history: [entry, ...s.history].slice(0, HISTORY_CAP),
    })),
  restore: (id) => {
    const found = get().history.find((e) => e.id === id);
    if (found) set({ current: found });
  },
  clearHistory: () => set({ history: [] }),
}));
