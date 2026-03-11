import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * GET /api/agent/sessions/[id]/messages — Fetch all messages for a chat session
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const userId = session.userId as string;
  const db = getDb();

  // Verify the session belongs to this user
  const sessionCheck = await db.query(
    "SELECT id FROM agent_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId],
  );
  if (sessionCheck.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await db.query(
    `SELECT id, role, content, created_at
     FROM agent_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId],
  );

  const messages = result.rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: r.created_at,
  }));

  return NextResponse.json({ messages });
}
