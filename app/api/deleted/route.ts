import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const DELETED_PATH = path.join(process.cwd(), "data", "pool", "deleted.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DELETED_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, deleted } = body ?? {};
  if (typeof id !== "string" || typeof deleted !== "boolean") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let list: string[] = [];
  try {
    list = JSON.parse(await fs.readFile(DELETED_PATH, "utf8"));
  } catch {}

  const set = new Set(list);
  if (deleted) set.add(id);
  else set.delete(id);

  await fs.mkdir(path.dirname(DELETED_PATH), { recursive: true });
  await fs.writeFile(DELETED_PATH, JSON.stringify([...set], null, 2));
  return NextResponse.json({ ok: true, count: set.size });
}
