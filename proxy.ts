import { NextResponse } from "next/server";

// The workbench and every /api route only exist under `npm run dev`: the API routes write
// curation state to data/pool/*.json on the local filesystem, and the workbench is the
// curation tool that drives them. In a production build there is no such filesystem to
// write to and no curator, so both are closed at the edge, before any route code runs.
// Hiding the footer link is cosmetic; this is the door.
//
// NODE_ENV is set by Next itself: "development" under `next dev`, "production" under
// `next build`. No env var to remember, nothing that can be left on by accident.
const CLOSED = process.env.NODE_ENV === "production";

export function proxy() {
  if (!CLOSED) return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = {
  matcher: ["/workbench/:path*", "/api/:path*"],
};
