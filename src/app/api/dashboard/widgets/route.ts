import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getCalendarPreview,
  getDashboardWidgetBundle,
  getGmailInboxPreview,
  primeDriveMetadataCache,
} from "@/lib/google-workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
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
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userKey = session.userId as string;
  const widget = req.nextUrl.searchParams.get("widget") || "overview";
  const pageToken = req.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    if (widget === "gmail") {
      const preview = await getGmailInboxPreview({
        accessToken,
        refreshToken,
        pageToken,
      });
      return NextResponse.json(preview);
    }

    if (widget === "calendar") {
      const preview = await getCalendarPreview({
        accessToken,
        refreshToken,
        pageToken,
      });
      return NextResponse.json(preview);
    }

    void primeDriveMetadataCache({
      userKey,
      accessToken,
      refreshToken,
    }).catch(() => undefined);

    const overview = await getDashboardWidgetBundle({
      userKey,
      accessToken,
      refreshToken,
      grantedScopes: session.grantedScopes,
      bypassCache: true,
    });
    return NextResponse.json(overview);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load dashboard widgets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
