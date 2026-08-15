import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { DEFAULT_LIMITS, type Limits } from "@/lib/audio/limits";

const LIMITS_PATH = path.join(process.cwd(), "data", "pool", "limits.json");
const KEYS = Object.keys(DEFAULT_LIMITS) as (keyof Limits)[];

export async function GET() {
  try {
    const raw = await fs.readFile(LIMITS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let stored: Partial<Limits> = {};
  try {
    stored = JSON.parse(await fs.readFile(LIMITS_PATH, "utf8"));
  } catch {}

  for (const key of KEYS) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) stored[key] = v;
    else if (v === null) delete stored[key];
  }

  await fs.mkdir(path.dirname(LIMITS_PATH), { recursive: true });
  await fs.writeFile(LIMITS_PATH, JSON.stringify(stored, null, 2));
  return NextResponse.json(stored);
}
