import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listDriveFiles } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 403 });
  }

  const refreshToken = session.refreshToken as string | undefined;
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const pageToken = req.nextUrl.searchParams.get("pageToken") || undefined;
  const pageSize = Number.parseInt(
    req.nextUrl.searchParams.get("pageSize") || "20",
    10,
  );

  try {
    const data = await listDriveFiles(accessToken, refreshToken, {
      query: q,
      pageToken,
      pageSize: Number.isFinite(pageSize)
        ? Math.min(Math.max(pageSize, 1), 100)
        : 20,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
