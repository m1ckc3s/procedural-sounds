import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { DEFAULT_LOUDNESS, type LoudnessStore } from "@/lib/audio/loudness";

const MAP_PATH = path.join(process.cwd(), "data", "pool", "loudness.json");

async function readStore(): Promise<LoudnessStore> {
  try {
    const raw = JSON.parse(await fs.readFile(MAP_PATH, "utf8")) as Partial<LoudnessStore>;
    return {
      config: {
        ...DEFAULT_LOUDNESS,
        ...raw.config,
        offsets: { ...DEFAULT_LOUDNESS.offsets, ...raw.config?.offsets },
        strength: raw.config?.strength ?? DEFAULT_LOUDNESS.strength,
      },
      measures: raw.measures ?? {},
    };
  } catch {
    return { config: DEFAULT_LOUDNESS, measures: {} };
  }
}

export async function GET() {
  return NextResponse.json(await readStore());
}

// POST accepts partial updates: {config} merges, {measures} replaces wholesale (the
// survey always writes the complete library map).
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<LoudnessStore>;
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const stored = await readStore();
  if (body.config) {
    stored.config = {
      master: typeof body.config.master === "number" ? body.config.master : stored.config.master,
      offsets: { ...stored.config.offsets, ...body.config.offsets },
      strength:
        typeof body.config.strength === "number"
          ? Math.max(0, Math.min(1, body.config.strength))
          : stored.config.strength,
    };
  }
  if (body.measures) stored.measures = body.measures;
  await fs.mkdir(path.dirname(MAP_PATH), { recursive: true });
  await fs.writeFile(MAP_PATH, JSON.stringify(stored, null, 2));
  return NextResponse.json(stored);
}
