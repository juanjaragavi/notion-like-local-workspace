import type { AgentTool, AgentContext } from "../types";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getGmailMessage, extractEmailBody, getHeader } from "@/lib/google";
import {
  parseTranscriptionEmail,
  extractActionItems,
} from "@/lib/transcription-parser";

export const listTranscriptions: AgentTool = {
  declaration: {
    name: "list_transcriptions",
    description: "List all stored meeting transcriptions in the workspace.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: async (_args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const res = await db.query(
      "SELECT id, email_id, meeting_title, meeting_date, participants, summary, created_at FROM transcriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 30",
      [ctx.workspaceId],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      meetingTitle: r.meeting_title,
      meetingDate: r.meeting_date,
      participants: r.participants,
      summary: r.summary,
      createdAt: r.created_at,
    }));
  },
};

export const processTranscriptionEmail: AgentTool = {
  declaration: {
    name: "process_transcription_email",
    description:
      "Process a transcription email: fetch it, parse meeting info, extract action items, and store everything. Use when the user wants to process a meeting transcript from their email.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "The Gmail message ID of the transcription email",
        },
      },
      required: ["emailId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const emailId = args.emailId as string;
    const db = getDb();

    // Check if already processed
    const existing = await db.query(
      "SELECT id FROM transcriptions WHERE email_id = $1",
      [emailId],
    );
    if (existing.rows.length > 0) {
      return {
        alreadyProcessed: true,
        transcriptionId: (existing.rows[0] as { id: string }).id,
      };
    }

    // Fetch the email
    const msg = await getGmailMessage(
      ctx.accessToken,
      emailId,
      ctx.refreshToken,
    );
    const headers = (msg.payload?.headers || []) as Array<{
      name: string;
      value: string;
    }>;
    const subject = getHeader(headers, "Subject");
    const body = extractEmailBody(msg.payload as Record<string, unknown>);

    // Parse transcription content
    const parsed = parseTranscriptionEmail(subject, body);
    const transcriptionId = uuidv4();

    // Store transcription
    await db.query(
      `INSERT INTO transcriptions (id, email_id, meeting_title, meeting_date, participants, raw_content, summary, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        transcriptionId,
        emailId,
        parsed.meetingTitle || subject,
        parsed.meetingDate || new Date().toISOString(),
        JSON.stringify(parsed.participants || []),
        body.slice(0, 50000),
        parsed.summary || null,
        ctx.workspaceId,
      ],
    );

    // Extract and store action items
    const actionItems = extractActionItems(
      body,
      ctx.workspaceId,
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
          item.description || null,
          item.status,
          item.priority,
          item.assignee || null,
          item.dueDate || null,
          item.sourceType,
          item.sourceId || null,
          ctx.workspaceId,
        ],
      );
    }

    return {
      transcriptionId,
      meetingTitle: parsed.meetingTitle || subject,
      participantCount: parsed.participants?.length || 0,
      actionItemsExtracted: actionItems.length,
      summary: parsed.summary,
    };
  },
};

export const readTranscription: AgentTool = {
  declaration: {
    name: "read_transcription",
    description:
      "Read the full content of a stored meeting transcription by ID.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        transcriptionId: {
          type: "string",
          description: "The transcription ID to read",
        },
      },
      required: ["transcriptionId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const res = await db.query(
      "SELECT * FROM transcriptions WHERE id = $1 AND workspace_id = $2",
      [args.transcriptionId, ctx.workspaceId],
    );
    if (res.rows.length === 0) return { error: "Transcription not found" };
    const t = res.rows[0] as Record<string, unknown>;
    const rawContent =
      typeof t.raw_content === "string" ? t.raw_content.slice(0, 10000) : "";
    return {
      id: t.id,
      meetingTitle: t.meeting_title,
      meetingDate: t.meeting_date,
      participants: t.participants,
      summary: t.summary,
      rawContent,
    };
  },
};

export const transcriptionTools: AgentTool[] = [
  listTranscriptions,
  processTranscriptionEmail,
  readTranscription,
];
