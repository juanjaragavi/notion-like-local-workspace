import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
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

  const status = req.nextUrl.searchParams.get("status");
  const priority = req.nextUrl.searchParams.get("priority");

  let query = "SELECT * FROM action_items WHERE workspace_id = $1";
  const params: unknown[] = [ws.id];
  let pIdx = 2;

  if (status) {
    query += ` AND status = $${pIdx++}`;
    params.push(status);
  }
  if (priority) {
    query += ` AND priority = $${pIdx++}`;
    params.push(priority);
  }
  query += " ORDER BY created_at DESC";

  const resItems = await db.query(query, params);
  return NextResponse.json(resItems.rows);
}

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const id = uuidv4();

  await db.query(
    `INSERT INTO action_items (id, title, description, status, priority, assignee, due_date, source_type, source_id, workspace_id, page_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      body.title || "Untitled",
      body.description || null,
      body.status || "pending",
      body.priority || "medium",
      body.assignee || null,
      body.dueDate || null,
      body.sourceType || "manual",
      body.sourceId || null,
      ws.id,
      body.pageId || null,
    ],
  );

  return NextResponse.json({ id, ...body, workspaceId: ws.id });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let pIdx = 1;

  for (const field of [
    "title",
    "description",
    "status",
    "priority",
    "assignee",
    "due_date",
  ]) {
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (body[camelField] !== undefined || body[field] !== undefined) {
      sets.push(`${field} = $${pIdx++}`);
      params.push(body[camelField] ?? body[field]);
    }
  }
  if (sets.length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  sets.push("updated_at = NOW()");
  params.push(body.id);

  await db.query(
    `UPDATE action_items SET ${sets.join(", ")} WHERE id = $${pIdx}`,
    params,
  );
  return NextResponse.json({ success: true });
}
