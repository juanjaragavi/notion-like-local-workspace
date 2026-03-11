import type { AgentTool, AgentContext } from "../types";
import {
  listGmailMessages,
  getGmailMessage,
  extractEmailBody,
  getHeader,
  isTranscriptionEmail,
} from "@/lib/google";

export const searchEmails: AgentTool = {
  declaration: {
    name: "search_emails",
    description:
      "Search the user's Gmail inbox. Returns a list of email summaries matching the query. Use Gmail search syntax (e.g. 'from:alice subject:meeting', 'is:unread', 'newer_than:2d').",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query string",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const query = args.query as string;
    const max = (args.maxResults as number) || 10;
    const messageRefs = await listGmailMessages(
      ctx.accessToken,
      ctx.refreshToken,
      query,
      max,
    );
    const results = [];
    for (const ref of messageRefs.slice(0, max)) {
      const msg = await getGmailMessage(
        ctx.accessToken,
        ref.id!,
        ctx.refreshToken,
      );
      const headers = (msg.payload?.headers || []) as Array<{
        name: string;
        value: string;
      }>;
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");
      const date = getHeader(headers, "Date");
      const snippet = msg.snippet || "";
      results.push({
        id: msg.id,
        threadId: msg.threadId,
        subject,
        from,
        date,
        snippet,
        isTranscription: isTranscriptionEmail(subject, from, snippet),
      });
    }
    return results;
  },
};

export const readEmail: AgentTool = {
  declaration: {
    name: "read_email",
    description:
      "Read the full body of a specific email by its message ID. Returns subject, from, date, and full text body.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The Gmail message ID to read",
        },
      },
      required: ["messageId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const messageId = args.messageId as string;
    const msg = await getGmailMessage(
      ctx.accessToken,
      messageId,
      ctx.refreshToken,
    );
    const headers = (msg.payload?.headers || []) as Array<{
      name: string;
      value: string;
    }>;
    const body = extractEmailBody(msg.payload as Record<string, unknown>);
    return {
      id: msg.id,
      subject: getHeader(headers, "Subject"),
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      date: getHeader(headers, "Date"),
      body: body.slice(0, 8000), // Cap body to stay within context limits
      isTranscription: isTranscriptionEmail(
        getHeader(headers, "Subject"),
        getHeader(headers, "From"),
        body,
      ),
    };
  },
};

export const gmailTools: AgentTool[] = [searchEmails, readEmail];
