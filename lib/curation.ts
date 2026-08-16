import type { Patch } from "@/lib/audio/patch";
import type { PoolBucket } from "@/lib/audio/categories";
import type { ApprovedPools, Exclusions, SlotOverrides } from "@/lib/audio/randomize";
import type { OpStats } from "@/lib/audio/create";
import type { TasteStore } from "@/lib/audio/taste";
import { withLoudnessDefaults, type LoudnessConfig } from "@/lib/audio/loudness";

import tap from "@/data/pool/tap.json";
import hover from "@/data/pool/hover.json";
import transition from "@/data/pool/transition.json";
import success from "@/data/pool/success.json";
import error from "@/data/pool/error.json";
import warning from "@/data/pool/warning.json";
import notification from "@/data/pool/notification.json";
import unsorted from "@/data/pool/unsorted.json";
import slots from "@/data/pool/slots.json";
import deleted from "@/data/pool/deleted.json";
import duplicates from "@/data/pool/duplicates.json";
import exclusions from "@/data/pool/exclusions.json";
import favorites from "@/data/pool/favorites.json";
import tosort from "@/data/pool/tosort.json";
import creationsFeedback from "@/data/pool/creations-feedback.json";
import taste from "@/data/pool/taste.json";
import loudness from "@/data/pool/loudness.json";

// The product's curation state, frozen into the bundle at build time.
//
// This exists because /api/* is closed in production by proxy.ts, and the product page
// used to load ALL of this state through those routes at runtime. Every fetch 404'd on the
// live site, every `.catch(() => {})` swallowed it, and the product silently ran on empty
// state: no keeps, no deletes, no slots, no taste, no trained op dice. What shipped was the
// raw imports including every trashed sound, remixed by untrained dice. Nothing curated
// ever reached a visitor, and nothing said so.
//
// The rule now: the product reads THIS for its initial state, always. The API routes are a
// dev-only live refresh on top, so a workbench keep shows up on localhost without a
// rebuild; production never calls them. Every push therefore ships the library exactly as
// it stands in data/pool at that commit, which is what "the data is the only truth" means.
//
// Every state file the product reads MUST be imported here. A file that is only fetched
// ships as its default in production, and the failure mode is exactly the silent one above.
// The Record<PoolBucket, ...> annotation is the guard for buckets: adding one to
// POOL_BUCKETS without importing it here fails typecheck.

const buckets: Record<PoolBucket, Patch[]> = {
  tap: tap as Patch[],
  hover: hover as Patch[],
  transition: transition as Patch[],
  success: success as Patch[],
  error: error as Patch[],
  warning: warning as Patch[],
  notification: notification as Patch[],
  unsorted: unsorted as Patch[],
};

export interface CurationSnapshot {
  slots: SlotOverrides;
  approved: ApprovedPools;
  deleted: string[];
  duplicates: string[];
  exclusions: Exclusions;
  favorites: string[];
  toSort: string[];
  opStats: OpStats;
  taste: TasteStore;
  loudness: LoudnessConfig;
  loudnessMeasures: Record<string, { winDb: number; peakDb: number }>;
}

export const CURATION: CurationSnapshot = {
  slots: slots as SlotOverrides,
  approved: buckets,
  deleted: deleted as string[],
  duplicates: duplicates as string[],
  exclusions: exclusions as Exclusions,
  favorites: favorites as string[],
  toSort: tosort as string[],
  opStats: creationsFeedback as OpStats,
  taste: taste as unknown as TasteStore,
  loudness: withLoudnessDefaults((loudness as { config?: Partial<LoudnessConfig> }).config),
  // The Calibrate survey, keyed by sound id. A library draw levels from here and never needs
  // a live render; that is what lets iOS skip the OfflineAudioContext entirely.
  loudnessMeasures: ((loudness as { measures?: Record<string, { winDb: number; peakDb: number }> }).measures) ?? {},
};
