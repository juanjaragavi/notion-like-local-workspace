import type { GaxiosOptions } from "gaxios";
import { google } from "googleapis";

import { getDb } from "@/lib/db";
import { getNamedCache } from "@/lib/server-cache";

type RefreshedToken = {
  accessToken: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
};

const tokenCache = getNamedCache<RefreshedToken>(
  "google-oauth-tokens",
  55 * 60_000,
  100,
);

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
  const cachedToken = refreshToken ? tokenCache.get(refreshToken) : undefined;
  client.setCredentials({
    access_token: cachedToken?.accessToken || accessToken,
    refresh_token: refreshToken,
    expiry_date: cachedToken?.expiresAt,
  });

  if (refreshToken) {
    const originalRequest = client.request.bind(client);
    client.request = async <T>(opts: GaxiosOptions) => {
      try {
        return await originalRequest<T>(opts);
      } catch (error) {
        if (!shouldRefreshToken(error)) {
          throw error;
        }

        const refreshedToken = await refreshGoogleAccessToken(refreshToken);
        client.setCredentials({
          access_token: refreshedToken.accessToken,
          refresh_token: refreshToken,
          expiry_date: refreshedToken.expiresAt,
        });
        return originalRequest<T>(opts);
      }
    };
  }

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

export function getDriveClient(accessToken: string, refreshToken?: string) {
  const auth = getAuthedClient(accessToken, refreshToken);
  return google.drive({ version: "v3", auth });
}

export function getDocsClient(accessToken: string, refreshToken?: string) {
  const auth = getAuthedClient(accessToken, refreshToken);
  return google.docs({ version: "v1", auth });
}

export async function listDriveFiles(
  accessToken: string,
  refreshToken?: string,
  input?: {
    query?: string;
    pageToken?: string;
    pageSize?: number;
  },
) {
  const drive = getDriveClient(accessToken, refreshToken);
  const res = await drive.files.list({
    q: input?.query || undefined,
    pageToken: input?.pageToken,
    pageSize: input?.pageSize || 20,
    orderBy: "modifiedTime desc",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,description)",
  });
  return res.data;
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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, label: string) => `${label} ${href}`,
      )
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

export function extractEmailBody(payload: Record<string, unknown>): string {
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (parts) {
    let htmlFallback = "";
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body) {
        const body = part.body as { data?: string };
        if (body.data) return decodeBase64Url(body.data);
      }
      if (part.mimeType === "text/html" && part.body && !htmlFallback) {
        const body = part.body as { data?: string };
        if (body.data) htmlFallback = htmlToText(decodeBase64Url(body.data));
      }
      if (part.parts) {
        const nested = extractEmailBody(part as Record<string, unknown>);
        if (nested) return nested;
      }
    }
    if (htmlFallback) return htmlFallback;
  }
  const body = payload.body as { data?: string } | undefined;
  if (body?.data) {
    const mimeType = payload.mimeType;
    const decoded = decodeBase64Url(body.data);
    return mimeType === "text/html" ? htmlToText(decoded) : decoded;
  }
  return "";
}

export function extractGoogleDocIds(content: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/gi,
    /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/gi,
    /https?:\/\/drive\.google\.com\/open\?[^\s]*id=([a-zA-Z0-9_-]+)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) ids.add(match[1]);
    }
  }

  return [...ids];
}

export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string,
  refreshToken?: string,
) {
  const drive = getDriveClient(accessToken, refreshToken);
  const res = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,webContentLink,iconLink",
    supportsAllDrives: true,
  });
  return res.data;
}

function extractTextFromDocElements(elements: Array<Record<string, unknown>>) {
  let text = "";

  for (const element of elements) {
    const textRun = element.textRun as { content?: string } | undefined;
    if (textRun?.content) {
      text += textRun.content;
    }

    const inlineObjectElement = element.inlineObjectElement as
      | { inlineObjectId?: string }
      | undefined;
    if (inlineObjectElement?.inlineObjectId) {
      text += "\n";
    }
  }

  return text;
}

function extractGoogleDocText(document: Record<string, unknown>): string {
  const body = document.body as { content?: Array<Record<string, unknown>> };
  const content = body?.content || [];
  let text = "";

  for (const block of content) {
    const paragraph = block.paragraph as
      | { elements?: Array<Record<string, unknown>> }
      | undefined;
    if (paragraph?.elements) {
      text += extractTextFromDocElements(paragraph.elements);
      text += "\n";
    }

    const table = block.table as
      | { tableRows?: Array<Record<string, unknown>> }
      | undefined;
    if (table?.tableRows) {
      for (const row of table.tableRows) {
        const cells = (row.tableCells || []) as Array<Record<string, unknown>>;
        for (const cell of cells) {
          const cellContent = (cell.content || []) as Array<
            Record<string, unknown>
          >;
          for (const nestedBlock of cellContent) {
            const nestedParagraph = nestedBlock.paragraph as
              | { elements?: Array<Record<string, unknown>> }
              | undefined;
            if (nestedParagraph?.elements) {
              text += extractTextFromDocElements(nestedParagraph.elements);
            }
          }
          text += "\t";
        }
        text += "\n";
      }
    }

    const toc = block.tableOfContents as
      | { content?: Array<Record<string, unknown>> }
      | undefined;
    if (toc?.content) {
      for (const tocBlock of toc.content) {
        const tocParagraph = tocBlock.paragraph as
          | { elements?: Array<Record<string, unknown>> }
          | undefined;
        if (tocParagraph?.elements) {
          text += extractTextFromDocElements(tocParagraph.elements);
          text += "\n";
        }
      }
    }
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export async function readGoogleDoc(
  accessToken: string,
  documentId: string,
  refreshToken?: string,
) {
  const docs = getDocsClient(accessToken, refreshToken);
  const res = await docs.documents.get({ documentId });
  const data = (res.data || {}) as Record<string, unknown>;
  return {
    id: data.documentId as string,
    title: (data.title as string) || null,
    text: extractGoogleDocText(data),
  };
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
    /gemini/i,
    /docs\.google\.com\/document/i,
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

export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string | undefined,
  event: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    attendees?: string[];
    location?: string;
    timeZone?: string;
  },
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const tz = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startDateTime, timeZone: tz },
      end: { dateTime: event.endDateTime, timeZone: tz },
      attendees: event.attendees?.map((email) => ({ email })),
    },
  });
  return res.data;
}

export async function updateCalendarEvent(
  accessToken: string,
  refreshToken: string | undefined,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
    attendees?: string[];
    location?: string;
    timeZone?: string;
  },
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const tz =
    updates.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const requestBody: Record<string, unknown> = {};
  if (updates.summary) requestBody.summary = updates.summary;
  if (updates.description !== undefined)
    requestBody.description = updates.description;
  if (updates.location !== undefined) requestBody.location = updates.location;
  if (updates.startDateTime)
    requestBody.start = { dateTime: updates.startDateTime, timeZone: tz };
  if (updates.endDateTime)
    requestBody.end = { dateTime: updates.endDateTime, timeZone: tz };
  if (updates.attendees)
    requestBody.attendees = updates.attendees.map((email) => ({ email }));
  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
    requestBody,
  });
  return res.data;
}

export async function deleteCalendarEvent(
  accessToken: string,
  refreshToken: string | undefined,
  eventId: string,
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
  });
}

export async function sendGmailMessage(
  accessToken: string,
  refreshToken: string | undefined,
  email: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    replyToMessageId?: string;
    threadId?: string;
  },
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const headers = [
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];
  if (email.cc) headers.push(`Cc: ${email.cc}`);
  if (email.bcc) headers.push(`Bcc: ${email.bcc}`);
  if (email.replyToMessageId)
    headers.push(`In-Reply-To: ${email.replyToMessageId}`);
  const raw = Buffer.from(
    headers.join("\r\n") + "\r\n\r\n" + email.body,
  ).toString("base64url");
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: email.threadId,
    },
  });
  return res.data;
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const cached = tokenCache.get(refreshToken);
  if (cached?.accessToken) {
    return cached;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "Google token refresh failed",
    );
  }

  const refreshedToken: RefreshedToken = {
    accessToken: payload.access_token,
    expiresAt: payload.expires_in
      ? Date.now() + payload.expires_in * 1000 - 60_000
      : undefined,
    scope: payload.scope,
    tokenType: payload.token_type,
  };

  tokenCache.set(refreshToken, refreshedToken);

  try {
    const db = getDb();
    await db.query(
      "UPDATE accounts SET access_token = $1, scope = COALESCE($2, scope), token_type = COALESCE($3, token_type), expires_at = $4 WHERE refresh_token = $5 AND provider = 'google'",
      [
        refreshedToken.accessToken,
        refreshedToken.scope || null,
        refreshedToken.tokenType || null,
        refreshedToken.expiresAt
          ? Math.floor(refreshedToken.expiresAt / 1000)
          : null,
        refreshToken,
      ],
    );
  } catch {
    // Best effort only.
  }

  return refreshedToken;
}

function shouldRefreshToken(error: unknown) {
  const candidate = error as {
    code?: number;
    status?: number;
    response?: { status?: number; data?: { error?: { status?: string } } };
    message?: string;
  };
  const status =
    candidate.code || candidate.status || candidate.response?.status;
  return (
    status === 401 ||
    status === 403 ||
    candidate.response?.data?.error?.status === "UNAUTHENTICATED" ||
    /invalid credentials|invalid_grant|auth/i.test(candidate.message || "")
  );
}
