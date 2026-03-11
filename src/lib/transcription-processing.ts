import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  extractEmailBody,
  extractGoogleDocIds,
  getDriveFileMetadata,
  getGmailMessage,
  getHeader,
  readGoogleDoc,
} from "@/lib/google";
import {
  extractActionItems,
  parseTranscriptionEmail,
} from "@/lib/transcription-parser";

interface ProcessTranscriptionEmailInput {
  accessToken: string;
  refreshToken?: string;
  workspaceId: string;
  emailId: string;
}

interface ResolvedGoogleDoc {
  documentId: string;
  title: string | null;
  text: string;
  webViewLink: string | null;
}

async function resolveTranscriptionDocument(
  accessToken: string,
  refreshToken: string | undefined,
  emailBody: string,
): Promise<ResolvedGoogleDoc | null> {
  const candidateIds = extractGoogleDocIds(emailBody);

  for (const candidateId of candidateIds) {
    try {
      const file = await getDriveFileMetadata(
        accessToken,
        candidateId,
        refreshToken,
      );
      const mimeType = file.mimeType || "";
      if (mimeType !== "application/vnd.google-apps.document") {
        continue;
      }

      const doc = await readGoogleDoc(accessToken, candidateId, refreshToken);
      if (!doc.text.trim()) {
        continue;
      }

      return {
        documentId: candidateId,
        title: doc.title,
        text: doc.text,
        webViewLink: file.webViewLink || null,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function processTranscriptionEmailForWorkspace(
  input: ProcessTranscriptionEmailInput,
) {
  const db = getDb();

  const existing = await db.query(
    "SELECT * FROM transcriptions WHERE email_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 1",
    [input.emailId, input.workspaceId],
  );
  if (existing.rows.length > 0) {
    const transcription = existing.rows[0] as Record<string, unknown>;
    const items = await db.query(
      "SELECT * FROM action_items WHERE source_type = 'transcription' AND source_id = $1 AND workspace_id = $2 ORDER BY created_at DESC",
      [transcription.id, input.workspaceId],
    );
    return {
      transcription: {
        id: transcription.id,
        meetingTitle: transcription.meeting_title,
        meetingDate: transcription.meeting_date,
        participants: JSON.parse(
          (transcription.participants as string) || "[]",
        ),
        summary: transcription.summary,
      },
      actionItems: items.rows,
      source: {
        emailId: input.emailId,
        documentId: null,
        documentTitle: null,
        documentUrl: null,
      },
      alreadyProcessed: true,
    };
  }

  const msg = await getGmailMessage(
    input.accessToken,
    input.emailId,
    input.refreshToken,
  );
  const headers = (msg.payload?.headers || []) as Array<{
    name: string;
    value: string;
  }>;
  const notificationBody = extractEmailBody(
    msg.payload as Record<string, unknown>,
  );
  const subject = getHeader(headers, "Subject");

  const resolvedDoc = await resolveTranscriptionDocument(
    input.accessToken,
    input.refreshToken,
    notificationBody,
  );
  const transcriptionBody = resolvedDoc?.text || notificationBody;
  const parsed = parseTranscriptionEmail(subject, transcriptionBody);
  const transcriptionId = uuidv4();
  const actionItems = extractActionItems(
    transcriptionBody,
    input.workspaceId,
    "transcription",
    transcriptionId,
  );

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO transcriptions (id, email_id, meeting_title, meeting_date, participants, raw_content, summary, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        transcriptionId,
        input.emailId,
        parsed.meetingTitle ||
          resolvedDoc?.title ||
          subject ||
          "Meeting transcription",
        parsed.meetingDate,
        JSON.stringify(parsed.participants),
        transcriptionBody,
        parsed.summary,
        input.workspaceId,
      ],
    );

    for (const item of actionItems) {
      await client.query(
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
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    transcription: {
      id: transcriptionId,
      meetingTitle:
        parsed.meetingTitle ||
        resolvedDoc?.title ||
        subject ||
        "Meeting transcription",
      meetingDate: parsed.meetingDate,
      participants: parsed.participants,
      summary: parsed.summary,
    },
    actionItems,
    source: {
      emailId: input.emailId,
      documentId: resolvedDoc?.documentId || null,
      documentTitle: resolvedDoc?.title || null,
      documentUrl: resolvedDoc?.webViewLink || null,
    },
    alreadyProcessed: false,
  };
}
