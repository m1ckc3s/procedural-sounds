import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isCategory } from "@/lib/audio/categories";

const SLOTS_PATH = path.join(process.cwd(), "data", "pool", "slots.json");

export async function GET() {
  try {
    const raw = await fs.readFile(SLOTS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, categories } = body ?? {};
  if (
    typeof id !== "string" ||
    !Array.isArray(categories) ||
    !categories.every((c: unknown) => typeof c === "string" && isCategory(c))
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let slots: Record<string, string[]> = {};
  try {
    slots = JSON.parse(await fs.readFile(SLOTS_PATH, "utf8"));
  } catch {}

  slots[id] = categories;
  await fs.mkdir(path.dirname(SLOTS_PATH), { recursive: true });
  await fs.writeFile(SLOTS_PATH, JSON.stringify(slots, null, 2));
  return NextResponse.json({ ok: true });
}
