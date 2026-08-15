import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// id -> the two ceilings the sound's exposed tail was kept UNDER, not a bare exempt flag.
// Same reasoning as limit-approved: lowering a ceiling later has to re-surface everything
// waved through against the looser number. Separate file on purpose, because "this chime is
// fine" and "this recipe is fine" are different questions and answering one must not silence
// the other.
const FILE = path.join(process.cwd(), "data", "pool", "tail-approved.json");

export async function GET() {
  try {
    return NextResponse.json(JSON.parse(await fs.readFile(FILE, "utf8")));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, ceilings } = body ?? {};
  if (typeof id !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let map: Record<string, unknown> = {};
  try {
    map = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}

  if (ceilings === null) delete map[id];
  else map[id] = ceilings;

  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2));
  return NextResponse.json({ ok: true });
}
