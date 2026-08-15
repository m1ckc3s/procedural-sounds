import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isCategory } from "@/lib/audio/categories";
import { recordTasteVerdict, type TasteStore } from "@/lib/audio/taste";

// Full-patch verdict log from the Invent review: feature-bucket tallies + a ring of
// deleted patches (twin suppression). Richer companion to invent-feedback.json.
const TASTE_PATH = path.join(process.cwd(), "data", "pool", "taste.json");

export async function GET() {
  try {
    const raw = await fs.readFile(TASTE_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { category, verdict, patch } = body ?? {};
  if (
    typeof category !== "string" ||
    !isCategory(category) ||
    (verdict !== "keep" && verdict !== "delete") ||
    typeof patch !== "object" ||
    patch === null
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let store: TasteStore = {};
  try {
    store = JSON.parse(await fs.readFile(TASTE_PATH, "utf8"));
  } catch {}

  recordTasteVerdict(store, category, patch, verdict);

  await fs.mkdir(path.dirname(TASTE_PATH), { recursive: true });
  await fs.writeFile(TASTE_PATH, JSON.stringify(store, null, 2));
  return NextResponse.json({ ok: true });
}
