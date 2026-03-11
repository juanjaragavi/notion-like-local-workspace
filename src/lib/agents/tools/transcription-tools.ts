import type { AgentTool, AgentContext } from "../types";
import { getDb } from "@/lib/db";
import { processTranscriptionEmailForWorkspace } from "@/lib/transcription-processing";

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
    const result = await processTranscriptionEmailForWorkspace({
      accessToken: ctx.accessToken,
      refreshToken: ctx.refreshToken,
      workspaceId: ctx.workspaceId,
      emailId,
    });

    return {
      transcriptionId: result.transcription.id,
      meetingTitle: result.transcription.meetingTitle,
      participantCount: result.transcription.participants.length,
      actionItemsExtracted: result.actionItems.length,
      summary: result.transcription.summary,
      sourceDocumentId: result.source.documentId,
      sourceDocumentTitle: result.source.documentTitle,
      alreadyProcessed: result.alreadyProcessed,
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
