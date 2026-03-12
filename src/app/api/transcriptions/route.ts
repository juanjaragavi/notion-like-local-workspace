import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { processTranscriptionEmailForWorkspace } from "@/lib/transcription-processing";

export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string;
  const db = getDb();
  const resWs = await db.query(
    "SELECT id FROM workspaces WHERE owner_id = $1",
    [userId],
  );
  const ws = resWs.rows[0] as { id: string } | undefined;
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const resTs = await db.query(
    "SELECT * FROM transcriptions WHERE workspace_id = $1 ORDER BY created_at DESC",
    [ws.id],
  );

  return NextResponse.json(resTs.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = session.accessToken as string;
  const refreshToken = session.refreshToken as string | undefined;

  if (!session.userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string;

  if (!accessToken)
    return NextResponse.json(
      { error: "No Google access token" },
      { status: 403 },
    );

  const db = getDb();
  const resWs = await db.query(
    "SELECT id FROM workspaces WHERE owner_id = $1",
    [userId],
  );
  const ws = resWs.rows[0] as { id: string } | undefined;
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const { emailId } = await req.json();
  if (!emailId)
    return NextResponse.json({ error: "emailId required" }, { status: 400 });

  try {
    const result = await processTranscriptionEmailForWorkspace({
      accessToken,
      refreshToken,
      workspaceId: ws.id,
      emailId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcription processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
