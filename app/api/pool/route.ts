import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { POOL_BUCKETS, isPoolBucket } from "@/lib/audio/categories";

const POOL_DIR = path.join(process.cwd(), "data", "pool");

export async function GET() {
  const pools: Record<string, unknown[]> = {};
  for (const cat of POOL_BUCKETS) {
    try {
      const raw = await fs.readFile(path.join(POOL_DIR, `${cat}.json`), "utf8");
      pools[cat] = JSON.parse(raw);
    } catch {}
  }
  return NextResponse.json(pools);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { category, patch } = body ?? {};
  if (typeof category !== "string" || !isPoolBucket(category) || typeof patch !== "object" || patch === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const file = path.join(POOL_DIR, `${category}.json`);
  let patches: unknown[] = [];
  try {
    patches = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}

  patches.push(patch);
  await fs.mkdir(POOL_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(patches, null, 2));
  return NextResponse.json({ ok: true, count: patches.length });
}

// In-place replace of ONE curated keep, addressed by its pool id. The index is a position
// inside the bucket file and is what the id already encodes, so the sound keeps its id and
// therefore its permanent number: #nnn still resolves, it just plays the edited recipe.
// Imported reference sounds have no pool id and cannot be reached here by design.
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, patch } = body ?? {};
  if (typeof id !== "string" || typeof patch !== "object" || patch === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const [prefix, bucket, rawIndex] = id.split("/");
  const index = Number(rawIndex);
  if (prefix !== "pool" || !bucket || !isPoolBucket(bucket) || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "not a curated pool id" }, { status: 400 });
  }

  const file = path.join(POOL_DIR, `${bucket}.json`);
  let patches: unknown[] = [];
  try {
    patches = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return NextResponse.json({ error: "bucket not found" }, { status: 404 });
  }
  if (index >= patches.length) {
    return NextResponse.json({ error: "index out of range" }, { status: 404 });
  }

  patches[index] = patch;
  await fs.writeFile(file, JSON.stringify(patches, null, 2));
  return NextResponse.json({ ok: true, id });
}
