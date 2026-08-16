/*
 * Adapted from @web-kits/audio (https://github.com/raphaelsalaja/audio),
 * commit 3a9fe941c589d26d3487db17f5183eb9cecf3258, packages/audio/src/effects.ts.
 * Copyright (c) 2026 Raphael Salaja. MIT License. Full text: THIRD-PARTY-NOTICES.md.
 */

import type { DelayEffect, ReverbEffect } from "./patch";

export interface EffectNode {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  // Seconds the effect keeps sounding after its input goes silent; the caller waits this
  // long before disconnecting `nodes`.
  tail: number;
}

function withMix(
  ctx: BaseAudioContext,
  mix: number,
  tail: number,
  create: (wet: GainNode, wetOut: GainNode) => AudioNode[],
): EffectNode {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  input.connect(dry);
  dry.connect(output);

  const wet = ctx.createGain();
  wet.gain.value = mix;
  input.connect(wet);

  const wetOut = ctx.createGain();
  wetOut.connect(output);

  const inner = create(wet, wetOut);

  return { input, output, tail, nodes: [input, output, dry, wet, wetOut, ...inner] };
}

/*
 * Feedback-delay echo ("shimmer"), adapted from cuelume (https://github.com/Danilaa1/cuelume)
 * v0.1.0 dist/audio/engine.js attachShimmer. Copyright (c) 2026 Daniel Belyi. MIT License.
 * Full text: THIRD-PARTY-NOTICES.md. Dry signal passes through untouched; the echo is a send.
 */
export function createShimmer(ctx: BaseAudioContext, opts: DelayEffect): EffectNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);

  const delay = ctx.createDelay(1);
  delay.delayTime.value = opts.delay;
  const feedbackFilter = ctx.createBiquadFilter();
  feedbackFilter.type = "lowpass";
  feedbackFilter.frequency.value = opts.lowpass ?? 4000;
  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = opts.feedback;
  const wetGain = ctx.createGain();
  wetGain.gain.value = opts.wet;

  input.connect(delay);
  delay.connect(feedbackFilter);
  feedbackFilter.connect(feedbackGain);
  feedbackGain.connect(delay);
  feedbackFilter.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    tail: shimmerTail(opts),
    nodes: [input, output, delay, feedbackFilter, feedbackGain, wetGain],
  };
}

const INAUDIBLE_GAIN = 0.001;

// How long the echo rings after the source ends (cuelume shimmerTail).
export function shimmerTail(opts: DelayEffect): number {
  if (opts.feedback <= 0) return 0;
  if (opts.feedback >= 1) return opts.delay;
  return opts.delay * (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(opts.feedback)));
}

// Impulse responses are cached by shape, not regenerated per play. A fresh 2ch x seconds
// Math.random buffer per node was built three times per draw (live play plus two offline
// renders); on iOS Safari a spam-tapped reverb sound made that allocation storm freeze the
// tab. An AudioBuffer is not bound to the context that created it, so one IR serves live and
// offline contexts alike; the noise was random anyway, so nothing audible changes.
const IR_CACHE = new Map<string, AudioBuffer>();
const IR_CACHE_MAX = 24;

function impulseResponse(ctx: BaseAudioContext, length: number, damping: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const key = `${sampleRate}|${length}|${damping}`;
  const hit = IR_CACHE.get(key);
  if (hit) return hit;

  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.28));
    }
  }

  if (damping > 0) {
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      const coeff = Math.min(damping, 0.99);
      let prev = 0;
      for (let i = 0; i < length; i++) {
        prev = data[i] * (1 - coeff) + prev * coeff;
        data[i] = prev;
      }
    }
  }

  if (IR_CACHE.size >= IR_CACHE_MAX) IR_CACHE.delete(IR_CACHE.keys().next().value as string);
  IR_CACHE.set(key, buffer);
  return buffer;
}

export function createReverb(ctx: BaseAudioContext, opts: ReverbEffect): EffectNode {
  const decay = opts.decay ?? 0.5;
  const mix = opts.mix ?? 0.3;
  const preDelay = opts.preDelay ?? 0;
  const damping = opts.damping ?? 0;
  const roomSize = opts.roomSize ?? 1;
  const effectiveDecay = decay * roomSize;

  return withMix(ctx, mix, preDelay + effectiveDecay, (wet, wetOut) => {
    const length = Math.max(1, Math.ceil(ctx.sampleRate * effectiveDecay));
    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(ctx, length, damping);

    const nodes: AudioNode[] = [convolver];
    if (preDelay > 0) {
      const preDelayNode = ctx.createDelay(Math.max(preDelay + 0.01, 1));
      preDelayNode.delayTime.value = preDelay;
      wet.connect(preDelayNode);
      preDelayNode.connect(convolver);
      nodes.push(preDelayNode);
    } else {
      wet.connect(convolver);
    }
    convolver.connect(wetOut);
    return nodes;
  });
}
