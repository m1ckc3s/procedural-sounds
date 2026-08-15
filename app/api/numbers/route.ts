import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// Permanent number registry: id -> #number, append-only, one sequence covering imports
// AND curated keeps. Numbers are the curator's addresses and NEVER change or get reused; a new
// id always gets max+1. Import scripts write their entries here directly.
const NUMBERS_PATH = path.join(process.cwd(), "data", "pool", "numbers.json");

async function readNumbers(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(NUMBERS_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(await readNumbers());
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body?.id;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const numbers = await readNumbers();
  if (numbers[id] !== undefined) {
    return NextResponse.json({ id, number: numbers[id] });
  }
  const next = Object.values(numbers).reduce((m, n) => Math.max(m, n), 0) + 1;
  numbers[id] = next;
  await fs.writeFile(NUMBERS_PATH, JSON.stringify(numbers, null, 1));
  return NextResponse.json({ id, number: next });
}
