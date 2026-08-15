"use client";

import { useState } from "react";
import { toast } from "sonner";

// Trigger the current sound from real UI controls to feel it in context.
// onTrigger plays the currently selected/generated patch (guarded upstream).

type Feedback = { label: string; cls: string; toast: () => void };
const FEEDBACK: Feedback[] = [
  {
    label: "success",
    cls: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    toast: () => toast.success("Success"),
  },
  {
    label: "error",
    cls: "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400",
    toast: () => toast.error("Error"),
  },
  {
    label: "warning",
    cls: "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    toast: () => toast.warning("Warning"),
  },
  {
    label: "notification",
    cls: "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    toast: () => toast.info("Notification"),
  },
];

const DEMOS = ["tap", "toggle", "hover", "success", "error", "warning", "notification"];

// The switch IS the transition demo, and the complete one: it is the only affordance with
// a real off state, so toggling it off plays the reversed patch. Both tap and transition
// point at it - tap because tap absorbed toggle, transition because a door opening and
// closing is exactly what it auditions.
const CATEGORY_DEMOS: Record<string, string[]> = {
  tap: ["tap", "toggle"],
  hover: ["hover"],
  transition: ["toggle"],
  success: ["success"],
  error: ["error"],
  warning: ["warning"],
  notification: ["notification"],
};

// category scopes the demos to the one context (generate view); null/unknown shows all (slot view).
function visibleFor(category?: string | null): Set<string> {
  if (category && category in CATEGORY_DEMOS) return new Set(CATEGORY_DEMOS[category]);
  return new Set(DEMOS);
}

export function SoundPreview({
  onTrigger,
  onTriggerReverse,
  category,
}: {
  onTrigger: () => void;
  onTriggerReverse?: () => void;
  category?: string | null;
}) {
  const [on, setOn] = useState(false);

  const show = visibleFor(category);
  const fire = () => onTrigger();
  const feedback = (fb: Feedback) => {
    fire();
    fb.toast();
  };

  return (
    <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-400">preview</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        {show.has("tap") && (
          <button
            onClick={fire}
            className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 active:scale-95 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Tap me
          </button>
        )}

        {show.has("toggle") && (
          <div className="flex items-center gap-3">
            <button
              role="switch"
              aria-checked={on}
              onClick={() => {
                // off-toggle plays the reversed patch (when provided) to audition it as a door
                if (on && onTriggerReverse) onTriggerReverse();
                else fire();
                setOn((v) => !v);
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"
              }`}
              title="toggle"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  on ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        )}

        {show.has("hover") && (
          <span
            onMouseEnter={fire}
            className="cursor-default text-neutral-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Hover me
          </span>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {FEEDBACK.filter((fb) => show.has(fb.label)).map((fb) => (
            <button
              key={fb.label}
              onClick={() => feedback(fb)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${fb.cls}`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
