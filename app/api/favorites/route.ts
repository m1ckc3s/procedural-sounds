import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const FAVORITES_PATH = path.join(process.cwd(), "data", "pool", "favorites.json");

export async function GET() {
  try {
    const raw = await fs.readFile(FAVORITES_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, favorite } = body ?? {};
  if (typeof id !== "string" || typeof favorite !== "boolean") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let list: string[] = [];
  try {
    list = JSON.parse(await fs.readFile(FAVORITES_PATH, "utf8"));
  } catch {}

  const set = new Set(list);
  if (favorite) set.add(id);
  else set.delete(id);

  await fs.mkdir(path.dirname(FAVORITES_PATH), { recursive: true });
  await fs.writeFile(FAVORITES_PATH, JSON.stringify([...set], null, 2));
  return NextResponse.json({ ok: true, count: set.size });
}
