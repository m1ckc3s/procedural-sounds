import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isCategory } from "@/lib/audio/categories";

// Curator vetoes for the Craft bench: a component (instrument, figure or space) that
// must never draw for a category again. Deliberately NOT a weight - the component is
// removed outright, so the file reads as a list of decisions and any one of them can be
// undone by deleting a line.
const PATH = path.join(process.cwd(), "data", "pool", "craft-vetoes.json");
const KINDS = ["instruments", "figures", "spaces"] as const;

type Store = Record<string, Partial<Record<(typeof KINDS)[number], string[]>>>;

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(await read());
}

export async function POST(req: Request) {
  const { category, kind, name, on } = (await req.json()) ?? {};
  if (
    typeof category !== "string" ||
    !isCategory(category) ||
    !(KINDS as readonly string[]).includes(kind) ||
    typeof name !== "string" ||
    !name
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const store = await read();
  const cat = (store[category] ??= {});
  const list = new Set(cat[kind as (typeof KINDS)[number]] ?? []);
  if (on === false) list.delete(name);
  else list.add(name);
  cat[kind as (typeof KINDS)[number]] = [...list];

  await fs.mkdir(path.dirname(PATH), { recursive: true });
  await fs.writeFile(PATH, JSON.stringify(store, null, 2));
  return NextResponse.json({ ok: true, store });
}
