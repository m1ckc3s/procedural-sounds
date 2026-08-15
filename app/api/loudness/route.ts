import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const REPORT_PATH = path.join(process.cwd(), "data", "loudness-report.json");

export async function GET() {
  try {
    const raw = await fs.readFile(REPORT_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  if (typeof body !== "object" || body === null || !Array.isArray((body as { rows?: unknown }).rows)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true, rows: (body as { rows: unknown[] }).rows.length });
}
