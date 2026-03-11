import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * GET /api/agent/sessions — List agent sessions for the current user
 * POST /api/agent/sessions — Create a new session
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string | undefined;
  if (!userId) return NextResponse.json({ sessions: [] });

  try {
    const db = getDb();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    let query = `SELECT s.id, s.workspace_id, s.status, s.title, s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM agent_tasks WHERE session_id = s.id) as task_count,
      (SELECT COUNT(*) FROM agent_messages WHERE session_id = s.id) as message_count
      FROM agent_sessions s WHERE s.user_id = $1`;
    const params: unknown[] = [userId];
    let idx = 2;

    if (status) {
      query += ` AND s.status = $${idx++}`;
      params.push(status);
    }
    query += ` ORDER BY s.created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await db.query(query, params);
    return NextResponse.json({ sessions: result.rows });
  } catch (err) {
    console.error("[agent/sessions] GET error:", err);
    return NextResponse.json(
      { sessions: [], error: "Database error" },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string | undefined;
  if (!userId)
    return NextResponse.json(
      { error: "User ID not available" },
      { status: 500 },
    );

  try {
    const db = getDb();

    const resWs = await db.query(
      "SELECT id FROM workspaces WHERE owner_id = $1",
      [userId],
    );
    const ws = resWs.rows[0] as { id: string } | undefined;
    if (!ws)
      return NextResponse.json({ error: "No workspace" }, { status: 404 });

    let body: { context?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();

    await db.query(
      `INSERT INTO agent_sessions (id, workspace_id, user_id, status, context)
       VALUES ($1, $2, $3, 'active', $4)`,
      [id, ws.id, userId, JSON.stringify(body.context || {})],
    );

    return NextResponse.json({ id, status: "active", workspaceId: ws.id });
  } catch (err) {
    console.error("[agent/sessions] POST error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
