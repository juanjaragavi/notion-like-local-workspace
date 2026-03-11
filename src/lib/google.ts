import { google } from "googleapis";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3000/api/auth/callback/google",
  );
}

export function getAuthedClient(accessToken: string, refreshToken?: string) {
  const client = getOAuth2Client();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}

export function getGmailClient(accessToken: string, refreshToken?: string) {
  const auth = getAuthedClient(accessToken, refreshToken);
  return google.gmail({ version: "v1", auth });
}

export function getCalendarClient(accessToken: string, refreshToken?: string) {
  const auth = getAuthedClient(accessToken, refreshToken);
  return google.calendar({ version: "v3", auth });
}

export async function listGmailMessages(
  accessToken: string,
  refreshToken?: string,
  query?: string,
  maxResults = 20,
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query || "",
    maxResults,
  });
  return res.data.messages || [];
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
  refreshToken?: string,
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return res.data;
}

function decodeBase64Url(data: string): string {
  const buff = Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  return buff.toString("utf-8");
}

export function extractEmailBody(payload: Record<string, unknown>): string {
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (parts) {
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body) {
        const body = part.body as { data?: string };
        if (body.data) return decodeBase64Url(body.data);
      }
      if (part.parts) {
        const nested = extractEmailBody(part as Record<string, unknown>);
        if (nested) return nested;
      }
    }
  }
  const body = payload.body as { data?: string } | undefined;
  if (body?.data) return decodeBase64Url(body.data);
  return "";
}

export function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

export function isTranscriptionEmail(
  subject: string,
  from: string,
  body: string,
): boolean {
  const transcriptionPatterns = [
    /transcript/i,
    /meeting notes/i,
    /meeting summary/i,
    /google meet/i,
    /read\.ai/i,
    /fireflies\.ai/i,
    /otter\.ai/i,
    /notas.*reuni[oó]n/i,
    /recording ready/i,
    /meeting recording/i,
  ];
  const text = `${subject} ${from} ${body.slice(0, 500)}`;
  return transcriptionPatterns.some((p) => p.test(text));
}

export async function listCalendarEvents(
  accessToken: string,
  refreshToken?: string,
  timeMin?: string,
  timeMax?: string,
  maxResults = 50,
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const now = new Date();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin:
      timeMin ||
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax:
      timeMax ||
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items || [];
}
