import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isCategory } from "@/lib/audio/categories";

// Keep/delete tallies per category+archetype from the Invent review; weights the
// composer's archetype dice (lib/audio/compose.ts archWeight).
const FEEDBACK_PATH = path.join(process.cwd(), "data", "pool", "invent-feedback.json");

export async function GET() {
  try {
    const raw = await fs.readFile(FEEDBACK_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { category, archetype, verdict } = body ?? {};
  if (
    typeof category !== "string" ||
    !isCategory(category) ||
    typeof archetype !== "string" ||
    (verdict !== "keep" && verdict !== "delete")
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let stats: Record<string, Record<string, { k: number; d: number }>> = {};
  try {
    stats = JSON.parse(await fs.readFile(FEEDBACK_PATH, "utf8"));
  } catch {}

  const cat = (stats[category] ??= {});
  const s = (cat[archetype] ??= { k: 0, d: 0 });
  if (verdict === "keep") s.k += 1;
  else s.d += 1;

  await fs.mkdir(path.dirname(FEEDBACK_PATH), { recursive: true });
  await fs.writeFile(FEEDBACK_PATH, JSON.stringify(stats, null, 2));
  return NextResponse.json({ ok: true });
}
