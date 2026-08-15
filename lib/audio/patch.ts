export type Waveform = "sine" | "triangle" | "square" | "sawtooth";

// Sweep glides start->end over the layer's full duration unless `time` caps it (the
// pitch then holds at `end`); `time` is opt-in so pre-existing sweeps are unchanged.
export type Frequency = number | { start: number; end: number; time?: number };

export interface FM {
  ratio: number;
  depth: number;
}

export interface OscillatorSource {
  type: Waveform;
  frequency: Frequency;
  fm?: FM;
  detune?: number;
}

export type NoiseColor = "white" | "pink" | "brown";

export interface NoiseSource {
  type: "noise";
  color?: NoiseColor;
}

export type Source = OscillatorSource | NoiseSource;

// curve "ramp" = the reference pack's hard exponential ramps (attack rises exponentially from
// silence, decay ramps to silence ending exactly at attack+decay: punchier, shorter tail).
// Default (absent) = the ported setTargetAtTime behavior; opt-in only, so every patch
// without it renders byte-identical.
export interface Envelope {
  attack?: number;
  decay: number;
  sustain?: number;
  release?: number;
  curve?: "ramp";
}

export interface FilterEnvelope {
  attack?: number;
  peak: number;
  decay: number;
}

export interface Filter {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
  resonance?: number;
  envelope?: FilterEnvelope;
}

export interface ReverbEffect {
  type: "reverb";
  decay?: number;
  damping?: number;
  mix?: number;
  preDelay?: number;
  roomSize?: number;
}

// Feedback-delay echo ("shimmer"), ported from the reference pack (attribution in effects.ts). Opt-in only:
// runs solely when a patch declares it, so every patch without it renders byte-identical.
export interface DelayEffect {
  type: "delay";
  delay: number;
  feedback: number;
  wet: number;
  lowpass?: number;
}

export type Effect = ReverbEffect | DelayEffect;

export interface Layer {
  source: Source;
  envelope?: Envelope;
  gain?: number;
  delay?: number;
  filter?: Filter | Filter[];
  effects?: Effect[];
}

export type Patch = Layer | { layers: Layer[] };

export function layersOf(patch: Patch): Layer[] {
  return "layers" in patch ? patch.layers : [patch];
}
