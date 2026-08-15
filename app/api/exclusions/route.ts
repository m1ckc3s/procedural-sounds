import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { GATED_CATEGORIES } from "@/lib/audio/gates";

const EXCLUSIONS_PATH = path.join(process.cwd(), "data", "pool", "exclusions.json");

export async function GET() {
  try {
    const raw = await fs.readFile(EXCLUSIONS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, category, excluded } = body ?? {};
  if (
    typeof id !== "string" ||
    typeof excluded !== "boolean" ||
    !(GATED_CATEGORIES as readonly string[]).includes(category)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let exclusions: Record<string, string[]> = {};
  try {
    exclusions = JSON.parse(await fs.readFile(EXCLUSIONS_PATH, "utf8"));
  } catch {}

  const current = new Set(exclusions[id] ?? []);
  if (excluded) current.add(category);
  else current.delete(category);
  if (current.size > 0) exclusions[id] = [...current];
  else delete exclusions[id];

  await fs.mkdir(path.dirname(EXCLUSIONS_PATH), { recursive: true });
  await fs.writeFile(EXCLUSIONS_PATH, JSON.stringify(exclusions, null, 2));
  return NextResponse.json({ ok: true });
}
