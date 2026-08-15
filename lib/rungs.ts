export interface Rung {
  key: string;
  name: string;
  /** Bare form for sentences that already carry the verb ("Generate another v1"). */
  short: string;
  hint: string;
}

// Two stops, both curated. The generative stops that used to sit to the right (`nebula`
// and `singularity`) were removed from the product: their hit rate never reached
// something a stranger would enjoy, and shipping them undercut the promise the curated
// tiers keep. Both engines still exist and still run in the workbench, where they feed
// the library that these two stops draw from. Their `key` values are deliberately NOT
// reused, so old stored sounds carrying `rung: "nebula"` remain readable.
export const RUNGS: Rung[] = [
  {
    key: "core",
    name: "Generate v1",
    short: "v1",
    hint: "The core library: hand-curated sounds, each varied within strict bounds",
  },
  {
    key: "orbit",
    name: "Generate v2",
    short: "v2",
    hint: "The remix engine: library sounds rebuilt into new structures by learned taste",
  },
];
