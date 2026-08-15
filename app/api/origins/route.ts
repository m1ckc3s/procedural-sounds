import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// Which engine a curated keep came from (pool id -> variation | creation | invention |
// generate), so the Slot grid can group the curated section by source.
const ORIGINS_PATH = path.join(process.cwd(), "data", "pool", "origins.json");
const ORIGINS = ["variation", "creation", "invention", "generate", "wild"] as const;

export async function GET() {
  try {
    const raw = await fs.readFile(ORIGINS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, origin } = body ?? {};
  if (typeof id !== "string" || !(ORIGINS as readonly string[]).includes(origin)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let origins: Record<string, string> = {};
  try {
    origins = JSON.parse(await fs.readFile(ORIGINS_PATH, "utf8"));
  } catch {}

  origins[id] = origin;
  await fs.mkdir(path.dirname(ORIGINS_PATH), { recursive: true });
  await fs.writeFile(ORIGINS_PATH, JSON.stringify(origins, null, 2));
  return NextResponse.json({ ok: true });
}
