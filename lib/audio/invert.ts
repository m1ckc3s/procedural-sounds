import type { Frequency, Layer, Patch } from "./patch";
import { layersOf } from "./patch";

// Derive the other side of a directional pair (open->close, on->off): flip each layer's
// pitch sweep, transpose static tones down a minor third, and mirror layer onset order.
// An approximation for auditioning "is this door-like?" - real paired sounds are often
// hand-crafted asymmetrically (close shorter/softer than open); refine at product time.

const STATIC_TRANSPOSE_RATIO = Math.pow(2, -3 / 12);

function flip(freq: Frequency): Frequency {
  if (typeof freq === "number") return freq * STATIC_TRANSPOSE_RATIO;
  return { start: freq.end, end: freq.start };
}

export function invertPatch(patch: Patch): Patch {
  const layers: Layer[] = layersOf(patch).map((l) => structuredClone(l));
  const maxOnset = Math.max(...layers.map((l) => l.delay ?? 0));
  for (const layer of layers) {
    const mirrored = maxOnset - (layer.delay ?? 0);
    layer.delay = mirrored > 0 ? mirrored : undefined;
    if (layer.source.type !== "noise") {
      layer.source.frequency = flip(layer.source.frequency);
    }
  }
  return layers.length === 1 ? layers[0] : { layers };
}
