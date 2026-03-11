import type { ActionItem } from "@/types";
import { v4 as uuidv4 } from "uuid";

const ACTION_PATTERNS = [
  /(?:action item|action|task|todo|to-do|to do|follow[- ]?up|next step|deliverable|asignaci[oó]n|tarea|pendiente|seguimiento)[\s:]+(.+)/gi,
  /(?:^|\n)\s*[-•*]\s*\[[ x]?\]\s*(.+)/gm,
  /(?:^|\n)\s*\d+[.)]\s*(.+(?:should|must|need|will|action|assign|follow|complete|deliver|review|prepare|send|create|update|schedule|set up|implement).+)/gim,
  /(?:@\w+)\s+(?:to|should|will|needs?\s+to)\s+(.+)/gi,
];

const PRIORITY_KEYWORDS: Record<string, "high" | "medium" | "low"> = {
  urgent: "high",
  asap: "high",
  critical: "high",
  important: "high",
  "high priority": "high",
  prioritario: "high",
  urgente: "high",
  blocker: "high",
  optional: "low",
  "nice to have": "low",
  "low priority": "low",
  eventual: "low",
  "when possible": "low",
};

const ASSIGNEE_PATTERN =
  /(?:@(\w+)|assigned?\s+to\s+(\w[\w\s]*?)(?:[,.\n]|$))/gi;

const DATE_PATTERN =
  /(?:by|before|due|deadline|para|antes de)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)/gi;

export function extractActionItems(
  content: string,
  workspaceId: string,
  sourceType: "transcription" | "email" | "manual" = "transcription",
  sourceId?: string,
): ActionItem[] {
  const items: ActionItem[] = [];
  const seen = new Set<string>();

  for (const pattern of ACTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const raw = (match[1] || match[0]).trim();
      const normalized = raw.toLowerCase().replace(/\s+/g, " ");
      if (
        normalized.length < 5 ||
        normalized.length > 500 ||
        seen.has(normalized)
      )
        continue;
      seen.add(normalized);

      let priority: "low" | "medium" | "high" = "medium";
      for (const [keyword, p] of Object.entries(PRIORITY_KEYWORDS)) {
        if (normalized.includes(keyword)) {
          priority = p;
          break;
        }
      }

      let assignee: string | null = null;
      ASSIGNEE_PATTERN.lastIndex = 0;
      const assigneeMatch = ASSIGNEE_PATTERN.exec(raw);
      if (assigneeMatch)
        assignee = (assigneeMatch[1] || assigneeMatch[2]).trim();

      let dueDate: string | null = null;
      DATE_PATTERN.lastIndex = 0;
      const dateMatch = DATE_PATTERN.exec(raw);
      if (dateMatch) dueDate = dateMatch[1].trim();

      items.push({
        id: uuidv4(),
        title: raw.replace(/^[-•*\[\]x\s]+/, "").slice(0, 200),
        description: null,
        status: "pending",
        priority,
        assignee,
        dueDate,
        sourceType,
        sourceId: sourceId || null,
        workspaceId,
        pageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return items;
}

export function parseTranscriptionEmail(subject: string, body: string) {
  const titleMatch = subject.match(
    /(?:transcript(?:ion)?|notes|summary|recording)[\s:]*(?:for|of|from|-)?\s*(.+)/i,
  );
  const meetingTitle = titleMatch ? titleMatch[1].trim() : subject;

  const dateMatch = body.match(
    /(?:date|fecha|when|held on)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/i,
  );
  const meetingDate = dateMatch ? dateMatch[1] : null;

  const participantPatterns = [
    /(?:participants?|attendees?|asistentes?|present)[\s:]+([^\n]+)/gi,
    /(?:^|\n)(?:[-•*]\s*)(\S+@\S+)/gm,
  ];
  const participants: string[] = [];
  for (const p of participantPatterns) {
    p.lastIndex = 0;
    let m;
    while ((m = p.exec(body)) !== null) {
      const names = m[1]
        .split(/[,;]/)
        .map((n: string) => n.trim())
        .filter(Boolean);
      participants.push(...names);
    }
  }

  const summaryMatch = body.match(
    /(?:summary|resumen|overview|key points|highlights)[\s:]+([^\n](?:[\s\S]*?)(?=\n\n|\n(?:action|task|todo|next step)|$))/i,
  );
  const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 2000) : null;

  return {
    meetingTitle,
    meetingDate,
    participants: [...new Set(participants)],
    summary,
  };
}
