import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// In-place replace of ONE imported sound, addressed by its `pack/event` id. The id is the
// permanent address (numbers.json maps ids to #nnn), so overwriting the recipe behind it
// renumbers nothing.
//
// Only an EXISTING pack/event may be written. This is an edit surface, not an import one:
// creating entries here would mint sounds with no numbers.json registration, which renders
// them as #0.
//
// Worth knowing if a pack is ever re-imported: an import script that rewrites a whole pack
// object will clobber edits made here. Merge into the existing pack instead of replacing it.
const FILE = path.join(process.cwd(), "data", "reference", "reference-sounds.json");

type Pack = { description?: string; sounds: Record<string, unknown> };

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, patch } = body ?? {};
  if (typeof id !== "string" || typeof patch !== "object" || patch === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const cut = id.indexOf("/");
  if (cut <= 0) return NextResponse.json({ error: "not a pack/event id" }, { status: 400 });
  const pack = id.slice(0, cut);
  const event = id.slice(cut + 1);

  let data: Record<string, Pack>;
  try {
    data = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return NextResponse.json({ error: "reference data unreadable" }, { status: 500 });
  }
  if (!data[pack]?.sounds || !(event in data[pack].sounds)) {
    return NextResponse.json({ error: "no such sound" }, { status: 404 });
  }

  data[pack].sounds[event] = patch;
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
  return NextResponse.json({ ok: true, id });
}
