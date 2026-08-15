"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@/lib/audio/categories";
import type { Patch } from "@/lib/audio/patch";
import { renderToBuffer } from "@/lib/audio/offline";

interface StageProps {
  category: Category;
  /** Category-free draw: show the generic waveform stage instead of a category widget. */
  orb?: boolean;
  fireKey: number;
  hasSound: boolean;
  onTrigger: () => void;
  onTriggerReverse: () => void;
}

interface SubProps {
  fireKey: number;
  hasSound: boolean;
  active: boolean;
  onTrigger: () => void;
}

// What the scope prints. Optional everywhere: with no sound drawn yet there is nothing to
// describe, and the panel falls back to a neutral resting wave.
export interface StageMeta {
  name: string;
  freqLabel: string;
  hz: number;
  seconds: number;
  patch: Patch;
}

const CONFETTI = ["#10b981", "#38bdf8", "#f59e0b", "#e879f9", "#8b5cf6", "#f43f5e"];

// `fired` keys the fx layer (0 = idle, nothing to replay). `since` is how many fires have
// landed while this stage was actually VISIBLE.
//
// Both halves are load-bearing, and they fix opposite failures. Baselining only at mount
// swallowed the animation whenever a category switch remounted a stage after the fire, which
// is why all eight stay mounted. But a hidden stage is display:none and CSS animations do not
// run there, so every fire it missed stayed queued and then played AT ONCE the moment it was
// shown. Advancing the baseline while hidden is what holds a tab switch to the single fire
// that arrived with it.
function useFired(fireKey: number, active: boolean) {
  const [base, setBase] = useState(fireKey);
  if (!active && base !== fireKey) setBase(fireKey);
  const since = active ? Math.max(0, fireKey - base) : 0;
  return { fired: since > 0 ? fireKey : 0, since };
}

// The last N fires, newest first, each under its OWN key. Keying an fx layer on the latest
// fire alone unmounts the previous one mid-flight, which is why spamming used to stutter and
// restart instead of stacking. Under separate keys React leaves earlier layers mounted and
// every burst runs to completion no matter how fast the clicks land.
const FX_WINDOW = 10;
function firesInFlight(fired: number, since: number, cap = FX_WINDOW) {
  if (fired <= 0) return [];
  return Array.from({ length: Math.min(cap, since) }, (_, i) => fired - i);
}

const TAP_RAYS = 12;

function Streaks() {
  const [rays] = useState(() =>
    Array.from({ length: TAP_RAYS }, (_, i) => ({
      a: (i / TAP_RAYS) * 360 + (Math.random() - 0.5) * 18,
      r0: 30 + Math.random() * 8,
      r1: 62 + Math.random() * 34,
      w: 9 + Math.random() * 14,
      dur: 430 + Math.random() * 280,
      delay: Math.random() * 40,
    })),
  );
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      {rays.map((r, i) => (
        <span
          key={i}
          style={
            {
              "--a": `${r.a}deg`,
              "--r0": `${r.r0}px`,
              "--r1": `${r.r1}px`,
              width: `${r.w}px`,
              animationDuration: `${r.dur}ms`,
              animationDelay: `${r.delay}ms`,
            } as CSSProperties
          }
          className="absolute top-0 left-0 block h-[2px] origin-left rounded-full bg-foreground/70 animate-[stage-streak_500ms_cubic-bezier(0.16,1,0.3,1)_both]"
        />
      ))}
    </span>
  );
}

function TapStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired, since } = useFired(fireKey, active);
  return (
    <div className="relative">
      {firesInFlight(fired, since).map((k) => (
        <Streaks key={k} />
      ))}
      <button
        key={fired}
        onClick={() => hasSound && onTrigger()}
        className={`relative cursor-pointer rounded-full border bg-background px-7 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted active:scale-95 ${
          fired > 0 ? "animate-[stage-press_280ms_ease-out]" : ""
        }`}
      >
        Tap
      </button>
    </div>
  );
}

// Hover fires on sweep, not on intent. Browsers synthesize mouseenter on tap,
// so without the fine-pointer gate a phone tap plays the hover sound. The
// throttle timestamp is module-global, not per element: a pointer crossing
// several hover targets should make one sound, not one per crossing.
const HOVER_THROTTLE_MS = 150;
let lastHoverAt = 0;

function hoverGate() {
  if (!window.matchMedia("(pointer: fine)").matches) return false;
  const now = performance.now();
  if (now - lastHoverAt < HOVER_THROTTLE_MS) return false;
  lastHoverAt = now;
  return true;
}

function HoverStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired, since } = useFired(fireKey, active);
  return (
    <div className="relative">
      <span
        onMouseEnter={() => hasSound && hoverGate() && onTrigger()}
        className="relative inline-block cursor-pointer overflow-hidden rounded-lg border bg-background px-5 py-2.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        {firesInFlight(fired, since).map((k) => (
          <span
            key={k}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/20 to-transparent animate-[stage-shine_600ms_cubic-bezier(0.4,0,0.2,1)_forwards]"
          />
        ))}
        Hover me
      </span>
      {firesInFlight(fired, since).map((k) => (
        <span
          key={k}
          className="pointer-events-none absolute -inset-1 rounded-xl border border-foreground/25 animate-[stage-ring_620ms_ease-out_forwards]"
        />
      ))}
    </div>
  );
}

function TransitionStage({
  fireKey,
  hasSound,
  active,
  onTrigger,
  onTriggerReverse,
}: SubProps & { onTriggerReverse: () => void }) {
  const { fired } = useFired(fireKey, active);
  // Generate = the photo COMES IN with the sound; the switch sends it away (inverted
  // patch) and brings it back (forward replay via onTrigger, which bumps fireKey).
  // Derived, not effect-driven: a send-away is recorded against its fired value, so
  // any new fire supersedes it. Must work at fired === 0 too (mounting with an
  // already-matching sound), or the switch shows ON but can't be flipped.
  const [sent, setSent] = useState({ at: -1, away: false });
  const present = !(sent.away && sent.at === fired);
  const animKey = present && fired === 0 ? 0 : fired * 2 + (present ? 0 : 1);
  const toggle = (checked: boolean) => {
    if (!hasSound || checked === present) return;
    if (!checked) {
      onTriggerReverse();
      setSent({ at: fired, away: true });
    } else {
      onTrigger();
    }
  };
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        key={animKey}
        className={`relative -mt-3 h-24 w-40 overflow-hidden rounded-lg border shadow-sm ${
          animKey === 0
            ? ""
            : present
              ? "animate-[stage-expand_450ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
              : "animate-[stage-collapse_150ms_ease-in_forwards]"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset, fixed 160x96
            box; next/image buys nothing here */}
        <img
          src="/gummy-bears.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <Switch
          label=""
          checked={present}
          onToggle={() => toggle(!present)}
          disabled={!hasSound}
        />
      </div>
    </div>
  );
}

// Solved from a launch velocity rather than from picked distances, so the pieces obey one
// gravity and their arcs actually agree with each other. Distances chosen by hand look wrong
// in a way that is hard to name: a piece thrown twice as high has to hang about 1.4x as long,
// and eyes catch it when it does not.
const CONFETTI_G = 1600; // px/s^2

// Every piece launches on the SAME frame. A real burst has no stagger; the variety comes from
// velocity, not from animation-delay. That also sidesteps the delay/fill trap entirely, since
// nothing is waiting around in an untransformed pose.
function ConfettiRain() {
  const [bits] = useState(() =>
    Array.from({ length: 34 }, () => {
      const vy = 330 + Math.random() * 300;
      const tUp = vy / CONFETTI_G;
      const life = 1.05 + Math.random() * 0.85;
      const tDown = Math.max(0.25, life - tUp);
      const squarish = Math.random() < 0.25;
      const w = 3 + Math.random() * 5;
      return {
        dx: (Math.random() - 0.5) * 780,
        rise: -((vy * vy) / (2 * CONFETTI_G)),
        fall: (CONFETTI_G * tDown * tDown) / 2,
        tUp,
        tDown,
        life,
        spin: (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 900),
        ax: Math.random(),
        ay: Math.random(),
        color: CONFETTI[(Math.random() * CONFETTI.length) | 0],
        w,
        h: squarish ? w : 6 + Math.random() * 9,
        round: Math.random() < 0.18,
        tumble: 340 + Math.random() * 520,
      };
    }),
  );
  return (
    <span className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          style={
            {
              "--dx": `${b.dx.toFixed(1)}px`,
              animationDuration: `${(b.life * 1000).toFixed(0)}ms`,
              animationTimingFunction: "cubic-bezier(0.1,0.62,0.32,1)",
            } as CSSProperties
          }
          className="absolute top-1/2 left-1/2 block animate-[confetti-drift_linear_forwards]"
        >
          <span
            style={
              {
                "--rise": `${b.rise.toFixed(1)}px`,
                animationDuration: `${(b.tUp * 1000).toFixed(0)}ms`,
                animationTimingFunction: "cubic-bezier(0.15,0.55,0.35,1)",
              } as CSSProperties
            }
            className="block animate-[confetti-rise_linear_forwards]"
          >
            <span
              style={
                {
                  "--fall": `${b.fall.toFixed(1)}px`,
                  animationDuration: `${(b.tDown * 1000).toFixed(0)}ms`,
                  animationDelay: `${(b.tUp * 1000).toFixed(0)}ms`,
                  animationTimingFunction: "cubic-bezier(0.5,0,0.9,0.6)",
                } as CSSProperties
              }
              className="block animate-[confetti-fall_linear_forwards]"
            >
              <span
                style={
                  {
                    width: `${b.w.toFixed(1)}px`,
                    height: `${b.h.toFixed(1)}px`,
                    background: b.color,
                    "--spin": `${b.spin.toFixed(0)}deg`,
                    "--ax": b.ax.toFixed(2),
                    "--ay": b.ay.toFixed(2),
                    animationDuration: `${b.tumble.toFixed(0)}ms, ${(b.life * 1000).toFixed(0)}ms`,
                  } as CSSProperties
                }
                className={`block animate-[confetti-tumble_linear_infinite,confetti-fade_linear_forwards] ${
                  b.round ? "rounded-full" : "rounded-[1px]"
                }`}
              />
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

function SuccessStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired, since } = useFired(fireKey, active);
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Capped well below FX_WINDOW: 24 pieces each, so an uncapped spam run would put
          hundreds of animating nodes on screen at once. */}
      {firesInFlight(fired, since, 3).map((k) => (
        <ConfettiRain key={k} />
      ))}
      <button onClick={() => hasSound && onTrigger()} className="relative cursor-pointer">
      <span
        key={fired}
        className={`flex w-80 items-center gap-3 rounded-lg border bg-background px-5 py-3 shadow-md ${
          fired > 0 ? "animate-[stage-toast_500ms_cubic-bezier(0.34,1.56,0.64,1)_both]" : ""
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
            <path
              key={fired}
              d="M3.5 8.5l3 3L12.5 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="14"
              strokeDashoffset={fired > 0 ? 14 : 0}
              className={fired > 0 ? "animate-[stage-draw_360ms_ease-out_180ms_forwards]" : ""}
            />
          </svg>
        </span>
        <span className="text-left">
          <span className="block text-sm leading-tight font-medium">Success</span>
          <span className="block text-xs leading-tight text-muted-foreground">Everything worked</span>
        </span>
      </span>
      </button>
    </div>
  );
}

// The character IS the blob: a solid colored body with two small dark eye slits, no mouth,
// no label. Everything it feels is eye angle, eye height, and body squash. The slits lean
// via a wrapper <g> because CSS animations OVERWRITE the transform property, so a lean on
// the animated rect itself would vanish every time a blink or emotion played.
function BlobEyes({
  y,
  fired,
  fireAnims,
  blink,
  eyeClass,
  lean = [9, 6],
}: {
  y: number;
  fired: number;
  /** One entry per eye, left then right (anger mirrors; alarm shares one). */
  fireAnims: [string, string];
  blink: string;
  eyeClass: string;
  /** Resting tilt per eye. Same-sign = the casual italic lean; mirrored negative-left,
      positive-right = "\ /", inner ends down, which is the standing angry face. */
  lean?: [number, number];
}) {
  return (
    <g className="animate-[stage-saccade_6.7s_ease-in-out_infinite]">
      {[19, 26.4].map((x, i) => (
        <g key={i} transform={`rotate(${lean[i]} ${x + 1.3} ${y + 3})`}>
          <rect
            x={x} y={y} width="2.6" height="6" rx="1.3"
            className={eyeClass}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              // Inline, not an animate-[...] class: Tailwind only compiles arbitrary
              // classes it can see statically, and these compose per eye.
              animation: fired > 0 ? `${fireAnims[i]}, ${blink}` : blink,
            }}
          />
        </g>
      ))}
    </g>
  );
}

function ErrorStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired } = useFired(fireKey, active);
  return (
    <button onClick={() => hasSound && onTrigger()} className="-mt-2 cursor-pointer">
      <span
        key={fired}
        className={`flex h-36 w-36 items-center justify-center ${
          fired > 0 ? "animate-[stage-shake_500ms_ease-in-out]" : ""
        }`}
      >
        <svg viewBox="0 0 48 48" className="h-28 w-28">
          <rect
            x="5" y="5" width="38" height="38" rx="15"
            className={`fill-red-500 ${fired > 0 ? "animate-[stage-blob-jolt_650ms_ease-out]" : ""}`}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          <BlobEyes
            y={17.5}
            fired={fired}
            lean={[14, -14]}
            fireAnims={[
              "stage-eye-glare-l 1.2s cubic-bezier(0.22,1,0.36,1)",
              "stage-eye-glare-r 1.2s cubic-bezier(0.22,1,0.36,1)",
            ]}
            blink="stage-blink 3.4s ease-in-out 1.4s infinite"
            eyeClass="fill-red-950/85"
          />
        </svg>
      </span>
    </button>
  );
}

function WarningStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired } = useFired(fireKey, active);
  return (
    <button onClick={() => hasSound && onTrigger()} className="-mt-2 cursor-pointer">
      <span
        key={fired}
        className={`flex h-36 w-36 items-center justify-center ${
          fired > 0 ? "animate-[stage-wobble_650ms_ease-in-out]" : ""
        }`}
      >
        {/* The warning character's body is the warning shape itself: a soft triangle. */}
        <svg viewBox="0 0 48 48" className="h-28 w-28">
          <path
            d="M21 7.5 Q24 3.5 27 7.5 L43 36 Q45.5 41 40 41 L8 41 Q2.5 41 5 36 Z"
            className={`fill-amber-500 ${fired > 0 ? "animate-[stage-blob-jolt_650ms_ease-out]" : ""}`}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          <BlobEyes
            y={24}
            fired={fired}
            fireAnims={[
              "stage-eye-alarm 1.3s cubic-bezier(0.22,1,0.36,1)",
              "stage-eye-alarm 1.3s cubic-bezier(0.22,1,0.36,1)",
            ]}
            blink="stage-blink 4.1s ease-in-out 1.6s infinite"
            eyeClass="fill-amber-950/85"
          />
        </svg>
      </span>
    </button>
  );
}

const IOS_BLUE = "#007aff";
const SENT_LINES = ["Did you hear that?", "That's the one", "Listen to this", "Again"];
const GOT_LINES = ["Hear what?", "Knock knock", "Nice", "Ping"];

function NotificationStage({ fireKey, hasSound, active, onTrigger }: SubProps) {
  const { fired, since } = useFired(fireKey, active);
  // Oldest first so the thread grows downward and the newest bubble lands at the bottom.
  const thread = firesInFlight(fired, since, 3).reverse();
  return (
    <button
      onClick={() => hasSound && onTrigger()}
      className="flex h-full w-full cursor-pointer items-center justify-center"
    >
      <span className="relative flex w-72 flex-col gap-px">
        {thread.map((k, i) => {
          const newest = i === thread.length - 1;
          // Parity of the permanent fire key, not of the row index. Keyed off the index, every
          // bubble would swap colour and side as the thread scrolls.
          const sent = k % 2 === 1;
          return (
            <span
              key={k}
              style={sent ? { background: IOS_BLUE } : undefined}
              className={`relative max-w-[62%] rounded-[18px] px-3.5 py-2 text-left text-[13px] leading-snug ${
                sent ? "mr-10 self-end text-white" : "ml-10 self-start bg-muted text-foreground"
              } ${
                newest
                  ? "animate-[stage-bubble_420ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
                  : "animate-[stage-bubble-age_260ms_ease-out_forwards]"
              }`}
            >
              {sent ? SENT_LINES[k % SENT_LINES.length] : GOT_LINES[k % GOT_LINES.length]}
            </span>
          );
        })}
      </span>
    </button>
  );
}

// The scope. A travelling line, not a static picture: phase advances every frame, so the
// wave scrolls continuously while it is audible and fades to nothing when it is not.
//
// Four things give it the character (mechanism studied from the reference, implementation
// ours):
//   - TRAVEL: phase advances with real time, so the line moves rather than sitting there.
//   - TWO PARTIALS at a non-integer ratio, so the pattern never repeats and never reads as
//     a textbook sine.
//   - BREATH: one slow amplitude sine. Deliberately NOT the reference's nested modulation,
//     which reads as wobbly rather than calm.
//   - PITCH MORPH: wavelength eases toward a target derived from the sound's frequency, so
//     changing sounds visibly reshapes the line instead of cutting to a new one.
// Amplitude rides the sound's envelope: it surges on a hit, then decays back to a RESTING
// level rather than to nothing. The line is persistent by design - it lives in the panel
// and vibrates when struck, instead of appearing and vanishing per sound. (The reference's
// current site clears the path when idle; the older one this is modelled on did not, and the
// persistent version is the one worth having: an empty panel says the instrument is off.)
//
// Written straight to the DOM in a rAF loop, deliberately. Per-frame setState at 60fps
// would re-render the whole stage tree for a path string.
const REST = 0.1;
// FIXED, and it must stay fixed. A crest sits at x = (c + phase)/K, so the ONLY way the wave
// can move left is K changing. Deriving K from the sound's pitch gave two flavours of that
// and both shipped: easing K drifted the wave backwards for the whole decay, and snapping K
// at fire time jumped it sideways on the press. There is no third option, because any change
// to wavelength moves the picture. With K constant, phase is the only time-varying term and
// phase only ever grows, so the wave translates right at every frame, always. The panel still
// answers to the sound through the amplitude swell and the rendered envelope; wavelength is
// not the place to express pitch.
const CYCLES = 12.5;
// THE VIEWBOX IS MEASURED IN CSS PIXELS, and that is not cosmetic bookkeeping. It used to be
// a fixed 100x100 box stretched by preserveAspectRatio="none", which is a ~5.7x horizontal
// and 1.4x vertical scale, and every LENGTH then had to survive that anisotropy:
// `vector-effect: non-scaling-stroke` and a CSS `blur()` are both under-specified for a
// non-uniform transform, so Chromium builds disagreed and the same line rendered hairline in
// one browser and heavy in another. With user units equal to CSS px there is no scale left to
// interpret: a strokeWidth of 4 is 4px everywhere. Keep it that way.
const PANEL_H = 144; // h-36
// Vertical headroom. The wave's worst case is amp(1) x breath(1.03) x env(1) x SWELL(1.3) x
// PANEL_H x AMP = ~64px either side of the 72 centre, so it CANNOT reach the viewport edge.
// SVG clips its root viewport, and a crest clipped at the edge comes back as a flat
// sharp-cornered top, which is what read as "not smooth". Sizing so it never happens is the
// fix; clamping y would draw the same flat top.
const AMP = 0.333;
const TILE_FRACTION = 0.6; // gradient tile, as a share of the panel width
const LINE_W = 4;
const GLOW_W = 10;
const GLOW_BLUR = 8;
// Before a measurement lands. Any value renders sanely; this is the desktop card width.
const FALLBACK_W = 574;
// Struck, the wave swells and its arcs stretch. One factor drives both, so a hit reads as one
// gesture rather than two effects.
const SWELL = 0.3;
// Seconds at full, then the fall back to rest. Deliberately NOT derived from the patch
// duration any more: tying it to the sound made a 90ms tap snap open and shut, and the panel
// is a mood rather than a meter. A fixed slow window reads better and is the same every time.
const SWELL_HOLD = 0.32;
const SWELL_TAIL = 1.5;
// Drawn past both edges and clipped by the viewport, so the line runs off the sides instead
// of terminating in a round cap floating mid-panel.
const X_PAD = 24;
// ~32 samples per cycle. Faceting is what turns a tall wave into a zigzag: the segments are
// drawn straight, so a steep crest needs points to round it off.
const WAVE_POINTS = 400;
const ENV_N = WAVE_POINTS + 1;
// How much of the line's height the sound's own shape is allowed to carve. 1 would pinch the
// tail to a dead flat line, which stops reading as an instrument.
const ENV_FLOOR = 0.45;
// Half-width of the envelope smoothing window, in buckets.
const ENV_SMOOTH = 26;

// Box-blurred in place, twice. RAW per-bucket peaks are unusable as a height multiplier: at
// 400 buckets a bucket is only a handful of samples, so the peaks track the audio's own zero
// crossings and the envelope comes back jagged. Multiplying a dense wave by a jagged envelope
// is what shredded the line into a helix. Two passes of a box blur is a Gaussian in all but
// name and leaves a silhouette, which is what this is for.
function smoothed(a: Float32Array, radius: number): Float32Array {
  let src = a;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(src.length);
    let sum = 0;
    for (let i = 0; i < Math.min(radius, src.length); i++) sum += src[i];
    for (let i = 0; i < src.length; i++) {
      const add = i + radius;
      const drop = i - radius - 1;
      if (add < src.length) sum += src[add];
      if (drop >= 0) sum -= src[drop];
      const lo = Math.max(0, i - radius);
      const hi = Math.min(src.length - 1, i + radius);
      out[i] = sum / (hi - lo + 1);
    }
    src = out;
  }
  return src;
}

// Peak per bucket, normalized. This is the sound's actual silhouette, so a percussive tap
// spikes at the left and tapers, while a pad holds flat across the panel.
function peakEnvelope(buffer: AudioBuffer, n: number): Float32Array {
  const ch = buffer.getChannelData(0);
  const out = new Float32Array(n);
  const per = Math.max(1, Math.floor(ch.length / n));
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    const start = i * per;
    for (let j = start, end = Math.min(start + per, ch.length); j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > p) p = v;
    }
    out[i] = p;
    if (p > max) max = p;
  }
  if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
  const soft = smoothed(out, ENV_SMOOTH);
  // Renormalize: blurring a percussive spike flattens the whole curve toward its mean, so
  // without this every short sound comes back as one uniformly short wave.
  let hi = 0;
  for (let i = 0; i < n; i++) if (soft[i] > hi) hi = soft[i];
  if (hi > 0) for (let i = 0; i < n; i++) soft[i] /= hi;
  return soft;
}

function WaveStage({ fireKey, hasSound, onTrigger, meta }: SubProps & { meta?: StageMeta }) {
  const line = useRef<SVGPathElement>(null);
  const echo = useRef<SVGPathElement>(null);
  const grad = useRef<SVGLinearGradientElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  // Width lives in BOTH: state draws the viewBox and the gradient tile, the ref feeds the rAF
  // loop, which must not restart on a resize.
  const [width, setWidth] = useState(FALLBACK_W);
  const w = useRef(FALLBACK_W);
  const st = useRef({
    phase: 0,
    amp: REST,
    elapsed: 0,
    playing: false,
    env: null as Float32Array | null,
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.max(120, Math.round(entry.contentRect.width));
      w.current = next;
      setWidth(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Straight into the ref, never into state: the rAF loop is the only reader, so a render is
  // pure waste and would fight the loop's direct DOM writes.
  useEffect(() => {
    const patch = meta?.patch;
    if (!patch) {
      st.current.env = null;
      return;
    }
    let alive = true;
    void renderToBuffer(patch)
      .then((buf) => {
        if (alive) st.current.env = peakEnvelope(buf, ENV_N);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [meta?.patch]);

  useEffect(() => {
    const s = st.current;
    const tick = (now: number, prev: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      // Speed rides the amplitude: a resting line drifts, a struck one runs. Self-easing,
      // because amp is already smoothed, so there is no jump when a sound lands.
      const lead = Math.max(0, (s.amp - REST) / (1 - REST));
      s.phase += dt * (0.7 + 2.6 * lead);
      let want = REST;
      if (s.playing) {
        s.elapsed += dt;
        const hit =
          s.elapsed > SWELL_HOLD
            ? Math.exp((-3.5 * (s.elapsed - SWELL_HOLD)) / SWELL_TAIL)
            : 1;
        want = REST + (1 - REST) * hit;
        if (hit < 0.02) s.playing = false;
      }
      s.amp += (want - s.amp) * (1 - Math.exp(-dt * 7));
      const breath = 1 + 0.03 * Math.sin(s.phase * 0.55);
      // TRAVEL DIRECTION, and why it is only ever rightward now.
      //
      // A crest sits where x*cycles - phase is constant, i.e. at x = (c + phase)/cycles. Its
      // velocity therefore has TWO terms: one from phase, one from cycles. Phase only ever
      // grows, so that term is always rightward. The cycles term is not: anything that widens
      // the wave slides crests out, and anything that narrows it drags them back.
      //
      // That is what made the direction flip at random. The wave used to stretch 30% wider on
      // a hit, so it ran right while swelling and then crawled LEFT for the whole two-second
      // decay as the stretch relaxed, which is most of the time you are looking at it. Easing
      // `cycles` toward a new pitch did the same thing on a smaller scale.
      //
      // So cycles is now CONSTANT between fires (set instantly at fire time, masked by the
      // amplitude spike), leaving phase as the only time-varying term. Direction cannot
      // reverse. Do not reintroduce a per-frame wavelength change without solving this.
      const swell = 1 + SWELL * lead;
      // K holds the CYCLE COUNT across the panel constant, so widening the window stretches
      // the same wave rather than adding crests. Between fires it is constant, which is what
      // keeps the travel direction from reversing (see above).
      const panelW = w.current;
      const k = (CYCLES * 2 * Math.PI) / panelW;
      const step = panelW / WAVE_POINTS;
      const pts: string[] = [];
      for (let x = -X_PAD; x <= panelW + X_PAD; x += step) {
        const th = x * k - s.phase;
        const r = 0.93 * Math.sin(th) + 0.07 * Math.sin(2.17 * th + 1.2);
        const ei = Math.min(ENV_N - 1, Math.max(0, Math.round((x / panelW) * (ENV_N - 1))));
        const env = s.env ? ENV_FLOOR + (1 - ENV_FLOOR) * s.env[ei] : 1;
        const y = PANEL_H / 2 - s.amp * breath * env * swell * (PANEL_H * AMP) * r;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      const d = "M" + pts.join(" L");
      // The gradient tile is 60% of the panel and repeats, so translating it by one tile is
      // seamless. The sign matters and is not cosmetic: the wave itself travels +x (a feature
      // at constant phase satisfies x = (phase + c)/k, so it moves right as phase grows), and
      // a NEGATIVE translate here sent the colour the other way. The colour also moves several
      // times faster than the shape, so it wins the eye, and the whole panel read as being
      // dragged backwards on every hit.
      const tile = panelW * TILE_FRACTION;
      grad.current?.setAttribute(
        "gradientTransform",
        `translate(${((s.phase * tile) / 10 % tile).toFixed(2)} 0)`,
      );
      // The line never fades: it is the instrument, and a dimmed instrument reads as broken.
      // Only the glow behind it blooms, so a hit still registers as brighter.
      line.current?.setAttribute("d", d);
      if (echo.current) {
        echo.current.setAttribute("d", d);
        echo.current.style.opacity = String(0.1 + 0.14 * lead);
      }
      raf.current = requestAnimationFrame((n) => tick(n, now));
    };
    if (raf.current === 0) {
      const start = performance.now();
      raf.current = requestAnimationFrame((n) => tick(n, start));
    }
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
    // Runs once: the line is always live, so the loop is never restarted per sound. A fire
    // is delivered through the ref below, not by tearing the animation down and rebuilding it.
  }, []);

  useEffect(() => {
    const s = st.current;
    if (fireKey > 0) {
      s.elapsed = 0;
      s.playing = true;
    }
  }, [fireKey]);

  return (
    <button
      ref={box}
      onClick={() => hasSound && onTrigger()}
      className="flex h-full w-full cursor-pointer items-center justify-center"
    >
      <svg viewBox={`0 0 ${width} ${PANEL_H}`} className="h-36 w-full">
        <defs>
          {/* First and last stop are the same colour so the repeat has no seam. */}
          <linearGradient
            ref={grad}
            id="wave-grad"
            gradientUnits="userSpaceOnUse"
            spreadMethod="repeat"
            x1="0"
            y1="0"
            x2={width * TILE_FRACTION}
            y2="0"
          >
            <stop offset="0" stopColor="var(--wave-1)" />
            <stop offset="0.25" stopColor="var(--wave-2)" />
            <stop offset="0.5" stopColor="var(--wave-3)" />
            <stop offset="0.75" stopColor="var(--wave-2)" />
            <stop offset="1" stopColor="var(--wave-1)" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2={width}
          y1={PANEL_H / 2}
          y2={PANEL_H / 2}
          strokeDasharray="1 7"
          strokeLinecap="round"
          className="stroke-foreground/25"
        />
        <path ref={echo} fill="none" stroke="url(#wave-grad)" strokeWidth={GLOW_W} strokeLinecap="round"
              style={{ filter: `blur(${GLOW_BLUR}px)` }} />
        <path ref={line} fill="none" stroke="url(#wave-grad)" strokeWidth={LINE_W} strokeLinecap="round"
              strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// DVD-screensaver drift: independent alternating x/y sweeps (co-prime durations) trace
// the classic corner-to-corner Lissajous path. 72px matches the keyframe calc() offsets.
function IdleStage() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 w-[72px] animate-[stage-bounce-x_7.3s_linear_infinite_alternate]">
        <div className="absolute h-[72px] w-[72px] animate-[stage-bounce-y_5.1s_linear_infinite_alternate]">
          {/* Same species as the error and warning blobs: a soft body, two leaning eye
              slits, nothing else. Its body is a lumpy cloud and it breathes slowly, which
              next to the drifting bounce is what reads as content rather than idle-dead. */}
          <svg viewBox="0 0 48 48" className="h-full w-full opacity-60">
            <path
              d="M10 30 Q6 22 13 19 Q12 11 21 12 Q25 5 32 9 Q40 8 40 17 Q46 21 42 28 Q44 35 36 36 Q32 41 25 38 Q16 41 13 35 Q7 36 10 30 Z"
              className="fill-muted-foreground/40 animate-[stage-breathe_4.6s_ease-in-out_infinite]"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            <BlobEyes
              y={19.5}
              fired={0}
              lean={[-8, 8]}
              fireAnims={["", ""]}
              blink="stage-blink 3.8s ease-in-out infinite"
              eyeClass="fill-foreground/60"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

const HINTS: Partial<Record<Category, string>> = {
  tap: "tap it to replay",
  hover: "hover to replay",
  transition: "",
  success: "click to celebrate again",
  error: "click to fail again",
  warning: "click to worry again",
  notification: "click for another ping",
};

export function SoundStage({
  category,
  orb,
  fireKey,
  hasSound,
  onTrigger,
  onTriggerReverse,
  footer,
  meta,
}: StageProps & { footer?: ReactNode; meta?: StageMeta }) {
  const sub = { fireKey, hasSound, onTrigger };
  const hint = !hasSound ? "nothing yet" : orb ? "click to replay" : (HINTS[category] ?? "click to replay");
  return (
    <div className="mx-auto flex max-w-xl flex-col overflow-hidden rounded-xl border bg-card shadow-100">
      {/* EVERY sub-stage stays mounted; only the active one is shown. This is load-bearing,
          not tidiness: each one baselines fireKey at mount (useFired), so anything that
          unmounts and remounts a stage makes it start from the already-bumped value and
          swallow its own animation. That is exactly what a ternary here did once a category
          switch began generating a sound: the new stage mounted after the fire and never
          saw an increase. Hidden stages are display:none, so no pointer events reach them. */}
      <div className="relative h-56">
      <div className={`h-full w-full items-center justify-center ${hasSound ? "flex" : "hidden"}`}>
      {(
        [
          ["orb", (p: SubProps) => <WaveStage {...p} meta={meta} />],
          ["tap", (p: SubProps) => <TapStage {...p} />],
          ["hover", (p: SubProps) => <HoverStage {...p} />],
          ["transition", (p: SubProps) => <TransitionStage {...p} onTriggerReverse={onTriggerReverse} />],
          ["success", (p: SubProps) => <SuccessStage {...p} />],
          ["error", (p: SubProps) => <ErrorStage {...p} />],
          ["warning", (p: SubProps) => <WarningStage {...p} />],
          ["notification", (p: SubProps) => <NotificationStage {...p} />],
        ] as const
      ).map(([key, render]) => {
        const active = key === (orb ? "orb" : category);
        return (
          <div
            key={key}
            className={`h-full w-full items-center justify-center ${active ? "flex" : "hidden"}`}
          >
            {render({ ...sub, active })}
          </div>
        );
      })}
      </div>
      {!hasSound && <IdleStage />}
      {hint !== "" && (
        <span className="pointer-events-none absolute right-0 bottom-6 left-0 text-center font-mono text-[10px] tracking-[0.08em] text-muted-foreground/60 uppercase">
          {hint}
        </span>
      )}
      </div>
      {footer && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">{footer}</div>
      )}
    </div>
  );
}
