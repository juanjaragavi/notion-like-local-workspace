import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGmailMessage, extractEmailBody, getHeader } from "@/lib/google";
import {
  extractActionItems,
  parseTranscriptionEmail,
} from "@/lib/transcription-parser";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const session = await auth();
  if (!session)
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
    const msg = await getGmailMessage(accessToken, emailId, refreshToken);
    const headers = (msg.payload?.headers || []) as Array<{
      name: string;
      value: string;
    }>;
    const body = extractEmailBody(msg.payload as Record<string, unknown>);
    const subject = getHeader(headers, "Subject");

    const parsed = parseTranscriptionEmail(subject, body);
    const transcriptionId = uuidv4();

    await db.query(
      `INSERT INTO transcriptions (id, email_id, meeting_title, meeting_date, participants, raw_content, summary, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        transcriptionId,
        emailId,
        parsed.meetingTitle,
        parsed.meetingDate,
        JSON.stringify(parsed.participants),
        body,
        parsed.summary,
        ws.id,
      ],
    );

    const actionItems = extractActionItems(
      body,
      ws.id,
      "transcription",
      transcriptionId,
    );

    for (const item of actionItems) {
      await db.query(
        `INSERT INTO action_items (id, title, description, status, priority, assignee, due_date, source_type, source_id, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          item.id,
          item.title,
          item.description,
          item.status,
          item.priority,
          item.assignee,
          item.dueDate,
          item.sourceType,
          item.sourceId,
          item.workspaceId,
        ],
      );
    }

    return NextResponse.json({
      transcription: {
        id: transcriptionId,
        meetingTitle: parsed.meetingTitle,
        meetingDate: parsed.meetingDate,
        participants: parsed.participants,
        summary: parsed.summary,
      },
      actionItems,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcription processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
