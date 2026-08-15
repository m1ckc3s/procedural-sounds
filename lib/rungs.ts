export interface Rung {
  key: string;
  name: string;
  /** The toggle label. Names the CHARACTER of the sound, never a version: "v2" read as a
   *  newer and better "v1" when the two are peers differing only in how far from the
   *  library a draw may travel. The flanking hints carry the how, so these carry the what. */
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
    name: "Generate familiar",
    short: "Familiar",
    hint: "The core library: hand-curated sounds, each varied within strict bounds",
  },
  {
    key: "orbit",
    name: "Generate exotic",
    short: "Exotic",
    hint: "The remix engine: library sounds rebuilt into new structures by learned taste",
  },
];
