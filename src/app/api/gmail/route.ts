import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listGmailMessages,
  getGmailMessage,
  extractEmailBody,
  getHeader,
  isTranscriptionEmail,
} from "@/lib/google";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = session.accessToken as string;
  const refreshToken = session.refreshToken as string | undefined;
  if (!accessToken)
    return NextResponse.json(
      { error: "No Google access token" },
      { status: 403 },
    );

  const query = req.nextUrl.searchParams.get("q") || "";
  const maxResults = parseInt(req.nextUrl.searchParams.get("max") || "20");
  const messageId = req.nextUrl.searchParams.get("id");

  try {
    if (messageId) {
      const msg = await getGmailMessage(accessToken, messageId, refreshToken);
      const headers = (msg.payload?.headers || []) as Array<{
        name: string;
        value: string;
      }>;
      const body = extractEmailBody(msg.payload as Record<string, unknown>);
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");

      return NextResponse.json({
        id: msg.id,
        threadId: msg.threadId,
        subject,
        from,
        to: getHeader(headers, "To"),
        date: getHeader(headers, "Date"),
        snippet: msg.snippet,
        body,
        labels: msg.labelIds || [],
        isTranscription: isTranscriptionEmail(subject, from, body),
      });
    }

    const messages = await listGmailMessages(
      accessToken,
      refreshToken,
      query,
      maxResults,
    );
    const detailed = await Promise.all(
      messages.slice(0, maxResults).map(async (m: { id?: string | null }) => {
        if (!m.id) return null;
        const msg = await getGmailMessage(accessToken, m.id, refreshToken);
        const headers = (msg.payload?.headers || []) as Array<{
          name: string;
          value: string;
        }>;
        const subject = getHeader(headers, "Subject");
        const from = getHeader(headers, "From");
        const body = extractEmailBody(msg.payload as Record<string, unknown>);
        return {
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          date: getHeader(headers, "Date"),
          snippet: msg.snippet,
          isTranscription: isTranscriptionEmail(subject, from, body),
        };
      }),
    );

    return NextResponse.json(detailed.filter(Boolean));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
