import type { Patch } from "./patch";

// The user-facing name of a generated sound: `<what it was drawn as>-<hash of the recipe>`.
//
// The prefix is the CATEGORY the user drew in, or "experimental" for the eighth button. It
// is never the source pack, never the seed's event name, and never an engine op: those are
// all internals, and the seed name in particular was actively misleading (a v2 draw called
// "success remix" is not the library's success sound). Experimental deliberately gets no
// guessed category, since a suggested "tap" that the ear hears as a transition would be the
// machine deciding for the user.
//
// The suffix is DERIVED from the patch, not rolled. That is what makes it honest: v1 replays
// a library sound verbatim a quarter of the time, and a derived tag gives that replay the
// same name both times, so "tap-4f2ak twice" means you heard the same sound twice. Random
// digits would claim two different sounds. It also makes a name reproducible from the recipe
// alone: an exported "success-8c1e3.wav" is findable, a random one is not.
//
// Five base32 characters (32^5 = 33M) rather than four hex (65k): a session can pile up a
// few hundred draws and four hex starts colliding around there.
export const EXPERIMENTAL_LABEL = "experimental";

const B32 = "0123456789abcdefghjkmnpqrstvwxyz"; // no i/l/o/u, so it never reads as digits

// FNV-1a over a canonical serialization. Key order is fixed by sorting so two structurally
// equal patches built in different orders hash alike; number formatting is JSON's, so
// 440 and 440.0 already agree.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${k}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function patchTag(patch: Patch): string {
  const s = canonical(patch);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += B32[h & 31];
    h >>>= 5;
  }
  return out;
}

export function soundName(prefix: string, patch: Patch): string {
  return `${prefix}-${patchTag(patch)}`;
}
