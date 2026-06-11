// GET /api/version
// Returns the build identifier baked into THIS deployment's server bundle.
// Client compares against the build id baked into its own (older) bundle to detect new deploys.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currentBuildId(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.NEXT_PUBLIC_BUILD_ID ??
    "dev"
  );
}

export async function GET() {
  return NextResponse.json(
    { buildId: currentBuildId() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    },
  );
}
