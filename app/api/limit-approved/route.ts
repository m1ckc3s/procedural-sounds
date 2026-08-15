import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// id -> the ceilings the sound was waved through UNDER, not a bare exempt flag. Tightening
// a ceiling later must re-surface everything approved against the looser number, otherwise
// a wave-through silently grandfathers a sound past a limit since decided against.
const FILE = path.join(process.cwd(), "data", "pool", "limit-approved.json");

export async function GET() {
  try {
    return NextResponse.json(JSON.parse(await fs.readFile(FILE, "utf8")));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, limits } = body ?? {};
  if (typeof id !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let map: Record<string, unknown> = {};
  try {
    map = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}

  if (limits === null) delete map[id];
  else map[id] = limits;

  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2));
  return NextResponse.json({ ok: true });
}
