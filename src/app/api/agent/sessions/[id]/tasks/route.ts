import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * GET /api/agent/sessions/[id]/tasks — List tasks for a specific session
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const userId = session.userId as string;
  const db = getDb();

  // Verify session belongs to user
  const sessionCheck = await db.query(
    "SELECT id FROM agent_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId],
  );
  if (sessionCheck.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await db.query(
    `SELECT id, parent_task_id, agent_role, description, status, input, output, error, created_at, completed_at
     FROM agent_tasks WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );

  return NextResponse.json({ tasks: result.rows });
}
