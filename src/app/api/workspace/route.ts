import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!session.userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string;
  const db = getDb();

  const resWs = await db.query("SELECT * FROM workspaces WHERE owner_id = $1", [
    userId,
  ]);
  const workspace = resWs.rows[0];
  if (!workspace)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  return NextResponse.json(workspace);
}
