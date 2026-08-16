export type Waveform = "sine" | "triangle" | "square" | "sawtooth";

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
