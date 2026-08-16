import { bakeVolume } from "../loudness";
import type { Patch } from "../patch";

// Two halves, because they have different lifetimes. A SOUND is data and there is one per
// export; the PLAYER is the node-building code and there is one per project. Emitting both
// every time is what made a single tap read as 150 lines.
//
// The player is a standalone copy of synth.ts and effects.ts and imports nothing from this
// repo, which is the whole point: it must run in a stranger's blank file. That also makes it
// the one place a change to the real node graph can silently drift, so an edit there belongs
// here too.

export const PLAYER_JS = `function playSound(patch, context) {
  const ctx = context || playSound.ctx || (playSound.ctx = new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === "suspended") ctx.resume();
  const S = 0.0001;
  const t0 = ctx.currentTime;

  function noiseBuffer(seconds, color) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (color === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (color === "brown") {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function impulse(len, damping) {
    const cache = playSound.ir || (playSound.ir = new Map());
    const key = ctx.sampleRate + "|" + len + "|" + damping;
    if (cache.has(key)) return cache.get(key);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
      if (damping > 0) {
        const c = Math.min(damping, 0.99);
        let prev = 0;
        for (let i = 0; i < len; i++) { prev = d[i] * (1 - c) + prev * c; d[i] = prev; }
      }
    }
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    cache.set(key, buf);
    return buf;
  }

  function reverb(o) {
    const decay = o.decay == null ? 0.5 : o.decay;
    const mix = o.mix == null ? 0.3 : o.mix;
    const damping = o.damping == null ? 0 : o.damping;
    const input = ctx.createGain(), output = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 1 - mix;
    input.connect(dry); dry.connect(output);
    const wet = ctx.createGain(); wet.gain.value = mix; input.connect(wet);
    const wetOut = ctx.createGain(); wetOut.connect(output);
    const seconds = decay * (o.roomSize == null ? 1 : o.roomSize);
    const len = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
    const conv = ctx.createConvolver(); conv.buffer = impulse(len, damping);
    const nodes = [input, output, dry, wet, wetOut, conv];
    const pre = o.preDelay == null ? 0 : o.preDelay;
    if (pre > 0) {
      const pd = ctx.createDelay(Math.max(pre + 0.01, 1));
      pd.delayTime.value = pre;
      wet.connect(pd); pd.connect(conv);
      nodes.push(pd);
    } else {
      wet.connect(conv);
    }
    conv.connect(wetOut);
    return { input: input, output: output, nodes: nodes, tail: pre + seconds };
  }

  function shimmer(o) {
    const input = ctx.createGain(), output = ctx.createGain();
    input.connect(output);
    const delay = ctx.createDelay(1); delay.delayTime.value = o.delay;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = o.lowpass == null ? 4000 : o.lowpass;
    const fb = ctx.createGain(); fb.gain.value = o.feedback;
    const wet = ctx.createGain(); wet.gain.value = o.wet;
    input.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
    lp.connect(wet); wet.connect(output);
    const tail = o.feedback <= 0 ? 0 : o.feedback >= 1 ? o.delay : o.delay * (1 + Math.ceil(Math.log(0.001) / Math.log(o.feedback)));
    return { input: input, output: output, nodes: [input, output, delay, lp, fb, wet], tail: tail };
  }

  function disconnectAll(nodes) {
    for (const n of nodes) { try { n.disconnect(); } catch (e) {} }
  }

  for (const layer of (patch.layers || [patch])) {
    const t = t0 + (layer.delay || 0);
    const gain = layer.gain == null ? 0.5 : layer.gain;
    const env = layer.envelope;
    const a = env ? env.attack || 0 : 0;
    const d = env ? env.decay : 0;
    const sus = env ? env.sustain || 0 : 0;
    const rel = env ? env.release || 0 : 0;
    const dur = env ? a + d + rel : 0.5;

    const g = ctx.createGain();
    if (!env) {
      g.gain.setValueAtTime(gain, t);
      g.gain.setTargetAtTime(S, t, 0.15);
    } else if (env.curve === "ramp") {
      const peak = Math.max(gain, S);
      g.gain.setValueAtTime(S, t);
      if (a > 0) g.gain.exponentialRampToValueAtTime(peak, t + a);
      else g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(S, t + a + d);
    } else {
      g.gain.setValueAtTime(S, t);
      if (a > 0) g.gain.linearRampToValueAtTime(gain, t + a);
      else g.gain.setValueAtTime(gain, t);
      if (sus > 0) {
        g.gain.setTargetAtTime(Math.max(sus * gain, S), t + a, d / 3);
        if (rel > 0) g.gain.setTargetAtTime(S, t + a + d, rel / 3);
      } else {
        g.gain.setTargetAtTime(S, t + a, d / 3);
      }
    }

    let src;
    const s = layer.source;
    if (s.type === "noise") {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur + 0.1, s.color);
    } else {
      src = ctx.createOscillator();
      src.type = s.type;
      const f = s.frequency;
      if (typeof f === "number") {
        src.frequency.setValueAtTime(f, t);
      } else {
        src.frequency.setValueAtTime(f.start, t);
        src.frequency.exponentialRampToValueAtTime(Math.max(f.end, 1), t + Math.min(f.time == null ? dur : f.time, dur));
      }
      if (s.detune) src.detune.value = s.detune;
      if (s.fm) {
        const carrier = typeof f === "number" ? f : f.start;
        const mod = ctx.createOscillator();
        mod.type = "sine";
        mod.frequency.value = carrier * s.fm.ratio;
        const mg = ctx.createGain();
        mg.gain.value = s.fm.depth;
        mod.connect(mg); mg.connect(src.frequency);
        mod.start(t); mod.stop(t + dur + 0.1);
      }
    }
    src.start(t); src.stop(t + dur + 0.1);

    let node = src;
    const own = [src, g];
    const filters = !layer.filter ? [] : (Array.isArray(layer.filter) ? layer.filter : [layer.filter]);
    for (const f of filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.setValueAtTime(f.frequency, t);
      bq.Q.value = f.Q == null ? (f.resonance == null ? 1 : f.resonance) : f.Q;
      if (f.envelope) {
        const peakAt = t + (f.envelope.attack || 0);
        bq.frequency.linearRampToValueAtTime(f.envelope.peak, peakAt);
        bq.frequency.exponentialRampToValueAtTime(Math.max(f.frequency, 1), peakAt + f.envelope.decay);
      }
      node.connect(bq); node = bq; own.push(bq);
    }
    node.connect(g);

    let out = g;
    const fxNodes = [];
    let fxTail = 0;
    for (const fx of (layer.effects || [])) {
      const built = fx.type === "reverb" ? reverb(fx) : fx.type === "delay" ? shimmer(fx) : null;
      if (!built) continue;
      out.connect(built.input); out = built.output;
      fxNodes.push.apply(fxNodes, built.nodes); fxTail += built.tail;
    }
    out.connect(ctx.destination);
    src.onended = function () {
      disconnectAll(own);
      if (fxNodes.length) setTimeout(function () { disconnectAll(fxNodes); }, (fxTail + 0.2) * 1000);
    };
  }
}`;

export interface SnippetOptions {
  /** The play-time loudness multiplier (loudness.ts). Baked so the snippet is the sound that was heard. */
  volume?: number;
  name?: string;
}

function identifier(name: string | undefined): string {
  const parts = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "sound";
  const camel = parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  return /^[0-9]/.test(camel) ? `sound${camel[0].toUpperCase()}${camel.slice(1)}` : camel;
}

// Just the sound. This is what the copy button gives you, because the player is a one-time
// setup and repeating it per sound is what buries the four lines that actually differ.
export function toSoundJs(patch: Patch, opts: SnippetOptions = {}): string {
  const name = identifier(opts.name);
  return `const ${name} = ${JSON.stringify(bakeVolume(patch, opts.volume ?? 1), null, 2)};

playSound(${name});
`;
}

// Sound plus player in one paste, for a blank file with nothing else in it.
export function toSnippet(patch: Patch, opts: SnippetOptions = {}): string {
  return `${PLAYER_JS}\n\n${toSoundJs(patch, opts)}`;
}

// The way back in. A sound copied out of the product is JSON wearing a `const` and a
// semicolon, so the reader takes the first balanced object it can find and ignores the rest
// of the paste. It accepts bare JSON too, since that is what the Editor and the pool files
// hold.
export type ParsedSound = { ok: true; patch: Patch } | { ok: false; error: string };

function balancedObject(src: string, from: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(from, i + 1);
  }
  return null;
}

const WAVEFORMS = new Set(["sine", "triangle", "square", "sawtooth"]);

function layerProblem(layer: unknown, i: number): string | null {
  if (!layer || typeof layer !== "object") return `layer ${i + 1} is not an object`;
  const l = layer as { source?: { type?: string; frequency?: unknown }; envelope?: { decay?: unknown } };
  const type = l.source?.type;
  if (!type) return `layer ${i + 1} has no source`;
  if (type !== "noise" && !WAVEFORMS.has(type)) return `layer ${i + 1} has an unknown source type "${type}"`;
  if (type !== "noise" && l.source?.frequency === undefined) return `layer ${i + 1} has no frequency`;
  if (l.envelope && typeof l.envelope.decay !== "number") return `layer ${i + 1} has an envelope with no decay`;
  return null;
}

function patchProblem(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return "the paste is not a patch";
  const obj = parsed as { layers?: unknown };
  const layers = Array.isArray(obj.layers) ? obj.layers : [parsed];
  if (layers.length === 0) return "the patch has no layers";
  for (let i = 0; i < layers.length; i++) {
    const problem = layerProblem(layers[i], i);
    if (problem) return problem;
  }
  return null;
}

// EVERY `{` is a candidate, not just the first one. A paste of the standalone snippet opens
// dozens of braces of player code before the sound object, and they are only distinguishable
// by the fact that JS is not JSON, so the reader tries each in turn and keeps the first that
// parses AND looks like a patch.
export function parseSound(text: string): ParsedSound {
  const src = text.trim();
  if (!src) return { ok: false, error: "nothing pasted" };

  let sawJson = false;
  // The OUTERMOST candidate is the one the paster meant, and it comes first in a left to
  // right scan, so its complaint is the one worth showing.
  let firstProblem = "";
  let unclosed = false;
  for (let i = src.indexOf("{"); i >= 0; i = src.indexOf("{", i + 1)) {
    const body = balancedObject(src, i);
    if (!body) {
      unclosed = true;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    sawJson = true;
    const problem = patchProblem(parsed);
    if (!problem) return { ok: true, patch: parsed as Patch };
    if (!firstProblem) firstProblem = problem;
  }
  if (firstProblem) return { ok: false, error: firstProblem };
  if (sawJson) return { ok: false, error: "the paste is not a patch" };
  if (unclosed) return { ok: false, error: "the patch object is not closed" };
  return { ok: false, error: "no patch object found in the paste" };
}
