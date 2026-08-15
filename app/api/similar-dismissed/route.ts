import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const FILE = path.join(process.cwd(), "data", "pool", "similar-dismissed.json");

export async function GET() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { pair, dismissed } = body ?? {};
  if (typeof pair !== "string" || typeof dismissed !== "boolean") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let list: string[] = [];
  try {
    list = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}

  const set = new Set(list);
  if (dismissed) set.add(pair);
  else set.delete(pair);

  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify([...set], null, 2));
  return NextResponse.json({ ok: true, count: set.size });
}
