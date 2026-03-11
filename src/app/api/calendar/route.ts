import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCalendarEvents } from "@/lib/google";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = session.accessToken as string;
  const refreshToken = session.refreshToken as string | undefined;
  if (!accessToken)
    return NextResponse.json(
      { error: "No Google access token" },
      { status: 403 },
    );

  const timeMin = req.nextUrl.searchParams.get("timeMin") || undefined;
  const timeMax = req.nextUrl.searchParams.get("timeMax") || undefined;
  const maxResults = parseInt(req.nextUrl.searchParams.get("max") || "50");

  try {
    const events = await listCalendarEvents(
      accessToken,
      refreshToken,
      timeMin,
      timeMax,
      maxResults,
    );
    const formatted = events.map((event) => ({
      id: event.id,
      summary: event.summary || "No title",
      description: event.description || null,
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      meetLink: event.hangoutLink || null,
      attendees: (event.attendees || []).map((a) => a.email || ""),
      organizer: event.organizer?.email || null,
    }));
    return NextResponse.json(formatted);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
