import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json(
      { error: "User session incomplete" },
      { status: 401 },
    );

  const userId = session.userId as string;
  const db = getDb();
  const resWs = await db.query(
    "SELECT id FROM workspaces WHERE owner_id = $1",
    [userId],
  );
  const ws = resWs.rows[0] as { id: string } | undefined;
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const parentId = req.nextUrl.searchParams.get("parentId");
  const pageId = req.nextUrl.searchParams.get("id");

  if (pageId) {
    const resPage = await db.query(
      "SELECT * FROM pages WHERE id = $1 AND workspace_id = $2",
      [pageId, ws.id],
    );
    const page = resPage.rows[0];
    return page
      ? NextResponse.json(page)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resPages = parentId
    ? await db.query(
        "SELECT * FROM pages WHERE workspace_id = $1 AND parent_id = $2 AND archived = 0 ORDER BY updated_at DESC",
        [ws.id, parentId],
      )
    : await db.query(
        "SELECT * FROM pages WHERE workspace_id = $1 AND parent_id IS NULL AND archived = 0 ORDER BY updated_at DESC",
        [ws.id],
      );

  return NextResponse.json(resPages.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json(
      { error: "User session incomplete" },
      { status: 401 },
    );

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
    `INSERT INTO pages (id, title, content, icon, cover_image, parent_id, workspace_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      body.title || "Untitled",
      body.content || "",
      body.icon || "📄",
      body.coverImage || null,
      body.parentId || null,
      ws.id,
      userId,
    ],
  );

  return NextResponse.json({
    id,
    title: body.title || "Untitled",
    workspaceId: ws.id,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let pIdx = 1;

  for (const [key, col] of [
    ["title", "title"],
    ["content", "content"],
    ["contentMarkdown", "content_markdown"],
    ["icon", "icon"],
    ["coverImage", "cover_image"],
    ["parentId", "parent_id"],
    ["archived", "archived"],
  ]) {
    if (body[key] !== undefined) {
      sets.push(`${col} = $${pIdx++}`);
      params.push(body[key]);
    }
  }
  if (sets.length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  sets.push("updated_at = NOW()");
  params.push(body.id);

  await db.query(
    `UPDATE pages SET ${sets.join(", ")} WHERE id = $${pIdx}`,
    params,
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  await db.query(
    "UPDATE pages SET archived = 1, updated_at = NOW() WHERE id = $1",
    [id],
  );
  return NextResponse.json({ success: true });
}
