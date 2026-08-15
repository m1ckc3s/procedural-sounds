export const CATEGORIES = [
  "tap",
  "hover",
  "transition",
  "success",
  "error",
  "warning",
  "notification",
] as const;

export type Category = (typeof CATEGORIES)[number];

// A BUCKET is a filename, never a membership. A keep has to be written somewhere before
// it has any category at all, and a keep from a category-less engine (Wild, Editor) goes
// to `unsorted`. Its categories then come from slots and gates like every other sound's,
// and it stays in the to-sort inbox until a human signs those off.
//
// This is deliberately outside Category. The retired `misc` key was a bucket, a slot
// value AND the merged-archetype set all at once, which is how sounds ended up in aisles
// nobody had approved: it looked like plumbing in one place and like a category in
// another. A bucket that cannot be a Category cannot become a chip, a slot, a gate result
// or a suggestion.
export const UNSORTED_BUCKET = "unsorted";
export const POOL_BUCKETS = [...CATEGORIES, UNSORTED_BUCKET] as const;
export type PoolBucket = (typeof POOL_BUCKETS)[number];

export function isPoolBucket(value: string): value is PoolBucket {
  return (POOL_BUCKETS as readonly string[]).includes(value);
}

export function categoryId(cat: Category): string {
  return `C${CATEGORIES.indexOf(cat) + 1}`;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

// Shown in the workbench as a hint when a sound is selected. Suggestions only,
// never auto-applied: slotting is fully manual (a "key-press" someone else would
// use as a hover is exactly why). Multi-category OK.
export const CATEGORY_USE_CASES: Record<Category, string> = {
  tap: "buttons, taps, toggles, switches, checkboxes, tabs",
  hover: "pointer hover, focus highlights",
  transition: "open/close, page or panel movement, sending",
  success: "completed tasks, saves, wins, celebrations",
  error: "failures, invalid input, rejections",
  warning: "caution prompts, risky actions",
  notification: "incoming messages, alerts, dings",
};

// Name-based suggestions only (decision log in .claude/ARCHITECTURE.md). NOT applied at runtime:
// slotting is fully manual by the curator; sounds start unassigned (not drawn in the product).
export const SUGGESTED_EVENT_CATEGORIES: Record<string, Category[]> = {
  tap: ["tap"],
  click: ["tap"],
  "key-press": ["tap"],
  tick: ["tap"],
  "progress-tick": ["tap"],
  select: ["tap"],
  deselect: ["tap"],
  "tab-switch": ["tap"],
  "scroll-snap": ["tap"],
  "toggle-on": ["tap"],
  "toggle-off": ["tap"],
  checkbox: ["tap"],
  radio: ["tap"],
  hover: ["hover"],
  focus: ["hover"],
  blur: ["hover"],
  swoosh: ["transition"],
  whoosh: ["transition"],
  slide: ["transition"],
  "slide-up": ["transition"],
  "slide-down": ["transition"],
  "page-enter": ["transition"],
  "page-exit": ["transition"],
  send: ["transition"],
  expand: ["transition"],
  collapse: ["transition"],
  "modal-open": ["transition"],
  "modal-close": ["transition"],
  "drawer-open": ["transition"],
  "drawer-close": ["transition"],
  "dropdown-open": ["transition"],
  "dropdown-close": ["transition"],
  success: ["success"],
  complete: ["success"],
  save: ["success"],
  error: ["error"],
  warning: ["warning"],
  notification: ["notification"],
  notify: ["notification"],
  mention: ["notification"],
  badge: ["notification"],
  info: ["notification"],
  receive: ["notification"],
  ding: ["notification"],
  sparkle: ["success"],
  star: ["success"],
  confetti: ["success"],
  "level-up": ["success"],
  streak: ["success"],
  heart: ["success"],
  "loading-start": ["transition"],
  "loading-end": ["transition"],
  sync: ["notification", "success"],
  "interaction.tap": ["tap"],
  "interaction.subtle": ["hover", "tap"],
  "interaction.toggle": ["tap"],
  "interaction.confirm": ["tap", "success"],
  "navigation.forward": ["transition"],
  "navigation.backward": ["transition"],
  "navigation.tab": ["tap", "transition"],
  "notification.info": ["notification"],
  "notification.success": ["success"],
  "notification.warning": ["warning"],
  "notification.error": ["error"],
  "overlay.open": ["transition"],
  "overlay.close": ["transition"],
  "overlay.expand": ["transition"],
  "overlay.collapse": ["transition"],
  "hero.complete": ["success"],
  "hero.milestone": ["success"],
  chime: ["notification"],
  droplet: ["tap"],
  bloom: ["success", "notification"],
  whisper: ["hover"],
  press: ["tap"],
  release: ["tap"],
  toggle: ["tap"],
};
