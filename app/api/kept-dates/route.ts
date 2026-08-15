import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// When a curated keep was added (pool id -> "YYYY-MM-DD", local date supplied by the
// client). Powers the Slot grid's group-by-day review view. Separate from origins so
// neither field disturbs the other; keeps before this existed simply have no date.
const PATH = path.join(process.cwd(), "data", "pool", "kept-dates.json");

export async function GET() {
  try {
    return NextResponse.json(JSON.parse(await fs.readFile(PATH, "utf8")));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  const { id, date } = (await req.json()) ?? {};
  if (typeof id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  let dates: Record<string, string> = {};
  try {
    dates = JSON.parse(await fs.readFile(PATH, "utf8"));
  } catch {}
  dates[id] = date;
  await fs.mkdir(path.dirname(PATH), { recursive: true });
  await fs.writeFile(PATH, JSON.stringify(dates, null, 2));
  return NextResponse.json({ ok: true });
}
