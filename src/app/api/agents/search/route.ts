import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  searchGoogleWorkspace,
  primeDriveMetadataCache,
} from "@/lib/google-workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleSearch(req, req.nextUrl.searchParams.get("q") || "");
}

export async function POST(req: NextRequest) {
  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return handleSearch(req, body.query || "");
}

async function handleSearch(req: NextRequest, query: string) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json(
      { error: "No Google access token" },
      { status: 403 },
    );
  }

  const refreshToken = session.refreshToken as string | undefined;
  const userKey =
    (session.userId as string) || session.user?.email || "workspace";
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return NextResponse.json({
      query: "",
      results: [],
      cached: false,
      errors: {},
      generatedAt: new Date().toISOString(),
    });
  }

  void primeDriveMetadataCache({
    userKey,
    accessToken,
    refreshToken,
  }).catch(() => undefined);

  try {
    const response = await searchGoogleWorkspace({
      userKey,
      query: normalizedQuery,
      accessToken,
      refreshToken,
      grantedScopes: session.grantedScopes,
      bypassCache: req.nextUrl.searchParams.get("fresh") === "1",
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
