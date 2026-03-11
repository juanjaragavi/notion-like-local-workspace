import crypto from "node:crypto";

import {
  extractEmailBody,
  getCalendarClient,
  getDriveClient,
  getGmailClient,
  getHeader,
} from "@/lib/google";
import { getNamedCache } from "@/lib/server-cache";

export const REQUIRED_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

type WorkspaceSource = "gmail" | "calendar" | "drive";
type ErrorKind = "auth" | "quota" | "api";

export interface WorkspaceDataError {
  kind: ErrorKind;
  message: string;
  status: number;
}

export interface WorkspaceAuthState {
  ok: boolean;
  missingScopes: string[];
  message?: string;
}

export interface GmailPreviewItem {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  timestamp: string;
  unread: boolean;
  url: string;
}

export interface CalendarPreviewItem {
  id: string;
  title: string;
  start: string;
  end: string;
  attendeeStatus: string;
  url: string | null;
}

export interface TodayEventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  attendeeStatus: "accepted" | "needsAction";
  attendeeLabel: string;
  url: string | null;
}

export interface PreviewCollection<T> {
  items: T[];
  nextPageToken: string | null;
}

export interface DashboardWidgetBundle {
  auth: WorkspaceAuthState;
  unreadCount: number | null;
  todayEvents: TodayEventItem[];
  gmailPreview: PreviewCollection<GmailPreviewItem>;
  calendarPreview: PreviewCollection<CalendarPreviewItem>;
  errors: Partial<Record<WorkspaceSource, WorkspaceDataError>>;
  generatedAt: string;
}

export interface WorkspaceSearchResult {
  source: WorkspaceSource;
  id: string;
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
}

export interface WorkspaceSearchResponse {
  query: string;
  results: WorkspaceSearchResult[];
  cached: boolean;
  errors: Partial<Record<WorkspaceSource, WorkspaceDataError>>;
  generatedAt: string;
}

type ScoredWorkspaceSearchResult = WorkspaceSearchResult & {
  score: number;
};

type DriveMetadataItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  modifiedTime: string;
};

const OVERVIEW_CACHE = getNamedCache<DashboardWidgetBundle>(
  "workspace-overview",
  30_000,
  100,
);
const SEARCH_CACHE = getNamedCache<WorkspaceSearchResponse>(
  "workspace-search",
  60_000,
  200,
);
const DRIVE_METADATA_CACHE = getNamedCache<DriveMetadataItem[]>(
  "workspace-drive-metadata",
  5 * 60_000,
  100,
);

export function getWorkspaceAuthState(
  accessToken?: string,
  grantedScopes?: string[],
): WorkspaceAuthState {
  if (!accessToken) {
    return {
      ok: false,
      missingScopes: [...REQUIRED_GOOGLE_SCOPES],
      message: "Your Google session is missing an access token.",
    };
  }

  if (!Array.isArray(grantedScopes) || grantedScopes.length === 0) {
    return { ok: true, missingScopes: [] };
  }

  const missingScopes = REQUIRED_GOOGLE_SCOPES.filter(
    (scope) => !grantedScopes.includes(scope),
  );

  if (missingScopes.length === 0) {
    return { ok: true, missingScopes: [] };
  }

  return {
    ok: false,
    missingScopes,
    message:
      "Your Google OAuth session is missing one or more read-only Gmail, Calendar, or Drive scopes.",
  };
}

export async function getDashboardWidgetBundle(input: {
  userKey: string;
  accessToken: string;
  refreshToken?: string;
  grantedScopes?: string[];
  bypassCache?: boolean;
}) {
  const auth = getWorkspaceAuthState(input.accessToken, input.grantedScopes);
  if (!auth.ok) {
    return emptyWidgetBundle(auth);
  }

  const cacheKey = hashKey(`${input.userKey}:overview`);
  if (!input.bypassCache) {
    const cached = OVERVIEW_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const [unreadCount, todayEvents, gmailPreview, calendarPreview] =
    await Promise.allSettled([
      getUnreadEmailCount(input.accessToken, input.refreshToken),
      getTodayEvents(input.accessToken, input.refreshToken),
      getGmailInboxPreview({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      }),
      getCalendarPreview({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      }),
    ]);

  const gmailError =
    unreadCount.status === "rejected"
      ? unreadCount.reason
      : gmailPreview.status === "rejected"
        ? gmailPreview.reason
        : null;
  const calendarError =
    todayEvents.status === "rejected"
      ? todayEvents.reason
      : calendarPreview.status === "rejected"
        ? calendarPreview.reason
        : null;

  const bundle: DashboardWidgetBundle = {
    auth,
    unreadCount: unreadCount.status === "fulfilled" ? unreadCount.value : null,
    todayEvents: todayEvents.status === "fulfilled" ? todayEvents.value : [],
    gmailPreview:
      gmailPreview.status === "fulfilled"
        ? gmailPreview.value
        : { items: [], nextPageToken: null },
    calendarPreview:
      calendarPreview.status === "fulfilled"
        ? calendarPreview.value
        : { items: [], nextPageToken: null },
    errors: {
      ...(gmailError
        ? {
            gmail: toWorkspaceError(
              gmailError,
              "Gmail data could not be loaded.",
            ),
          }
        : {}),
      ...(calendarError
        ? {
            calendar: toWorkspaceError(
              calendarError,
              "Calendar data could not be loaded.",
            ),
          }
        : {}),
    },
    generatedAt: new Date().toISOString(),
  };

  OVERVIEW_CACHE.set(cacheKey, bundle);
  return bundle;
}

export async function getUnreadEmailCount(
  accessToken: string,
  refreshToken?: string,
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 1,
  });

  return response.data.resultSizeEstimate || 0;
}

export async function getTodayEvents(
  accessToken: string,
  refreshToken?: string,
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 20,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (response.data.items || [])
    .map((event) => {
      const attendeeStatus = getCalendarEventResponseStatus(event);
      if (
        !attendeeStatus ||
        !["accepted", "needsAction"].includes(attendeeStatus)
      ) {
        return null;
      }

      return {
        id: event.id || crypto.randomUUID(),
        title: event.summary || "Untitled event",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        attendeeStatus: attendeeStatus as "accepted" | "needsAction",
        attendeeLabel: formatAttendeeStatus(attendeeStatus),
        url: event.htmlLink || null,
      } satisfies TodayEventItem;
    })
    .filter((event): event is TodayEventItem => Boolean(event));
}

export async function getGmailInboxPreview(input: {
  accessToken: string;
  refreshToken?: string;
  pageToken?: string;
  maxResults?: number;
}) {
  const gmail = getGmailClient(input.accessToken, input.refreshToken);
  const response = await gmail.users.threads.list({
    userId: "me",
    q: "in:inbox",
    maxResults: input.maxResults || 15,
    pageToken: input.pageToken,
  });

  const threadIds = (response.data.threads || [])
    .map((thread) => thread.id)
    .filter((threadId): threadId is string => Boolean(threadId));

  const threadDetails = await Promise.allSettled(
    threadIds.map((threadId) =>
      gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      }),
    ),
  );

  const items = threadDetails
    .map((result) => {
      if (result.status !== "fulfilled") {
        return null;
      }

      const thread = result.value.data;
      const lastMessage = thread.messages?.[thread.messages.length - 1];
      const headers = (lastMessage?.payload?.headers || []) as Array<{
        name: string;
        value: string;
      }>;
      const timestamp = lastMessage?.internalDate
        ? new Date(Number(lastMessage.internalDate)).toISOString()
        : new Date().toISOString();

      return {
        id: thread.id || crypto.randomUUID(),
        threadId: thread.id || crypto.randomUUID(),
        sender: getHeader(headers, "From") || "Unknown sender",
        subject: getHeader(headers, "Subject") || "No subject",
        snippet: normalizeSnippet(lastMessage?.snippet || ""),
        timestamp,
        unread: Boolean(
          thread.messages?.some((message) =>
            message.labelIds?.includes("UNREAD"),
          ),
        ),
        url: `https://mail.google.com/mail/u/0/#inbox/${thread.id}`,
      } satisfies GmailPreviewItem;
    })
    .filter((item): item is GmailPreviewItem => Boolean(item));

  return {
    items,
    nextPageToken: response.data.nextPageToken || null,
  } satisfies PreviewCollection<GmailPreviewItem>;
}

export async function getCalendarPreview(input: {
  accessToken: string;
  refreshToken?: string;
  pageToken?: string;
  maxResults?: number;
}) {
  const calendar = getCalendarClient(input.accessToken, input.refreshToken);
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString(),
    maxResults: input.maxResults || 15,
    singleEvents: true,
    orderBy: "startTime",
    pageToken: input.pageToken,
  });

  return {
    items: (response.data.items || []).map((event) => ({
      id: event.id || crypto.randomUUID(),
      title: event.summary || "Untitled event",
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      attendeeStatus: formatAttendeeStatus(
        getCalendarEventResponseStatus(event) || "accepted",
      ),
      url: event.htmlLink || null,
    })),
    nextPageToken: response.data.nextPageToken || null,
  } satisfies PreviewCollection<CalendarPreviewItem>;
}

export async function searchGoogleWorkspace(input: {
  userKey: string;
  query: string;
  accessToken: string;
  refreshToken?: string;
  grantedScopes?: string[];
  maxResults?: number;
  bypassCache?: boolean;
}) {
  const normalizedQuery = input.query.trim();
  const auth = getWorkspaceAuthState(input.accessToken, input.grantedScopes);

  if (!auth.ok) {
    return {
      query: normalizedQuery,
      results: [],
      cached: false,
      errors: {
        gmail: {
          kind: "auth",
          message: auth.message || "Missing scopes",
          status: 403,
        },
        calendar: {
          kind: "auth",
          message: auth.message || "Missing scopes",
          status: 403,
        },
        drive: {
          kind: "auth",
          message: auth.message || "Missing scopes",
          status: 403,
        },
      },
      generatedAt: new Date().toISOString(),
    } satisfies WorkspaceSearchResponse;
  }

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      results: [],
      cached: false,
      errors: {},
      generatedAt: new Date().toISOString(),
    } satisfies WorkspaceSearchResponse;
  }

  const maxResults = input.maxResults || 12;
  const cacheKey = hashKey(`${input.userKey}:${normalizedQuery.toLowerCase()}`);
  if (!input.bypassCache) {
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const [gmail, calendar, drive] = await Promise.allSettled([
    searchGmail(
      normalizedQuery,
      input.accessToken,
      input.refreshToken,
      maxResults,
    ),
    searchCalendar(
      normalizedQuery,
      input.accessToken,
      input.refreshToken,
      maxResults,
    ),
    searchDrive(
      input.userKey,
      normalizedQuery,
      input.accessToken,
      input.refreshToken,
      maxResults,
    ),
  ]);

  const allResults = [
    ...(gmail.status === "fulfilled" ? gmail.value : []),
    ...(calendar.status === "fulfilled" ? calendar.value : []),
    ...(drive.status === "fulfilled" ? drive.value : []),
  ].filter((result): result is ScoredWorkspaceSearchResult => result !== null);

  const ranked = rankAndDedupeResults(normalizedQuery, allResults).slice(
    0,
    maxResults,
  );
  const response: WorkspaceSearchResponse = {
    query: normalizedQuery,
    results: ranked.map(stripScore),
    cached: false,
    errors: {
      ...(gmail.status === "rejected"
        ? { gmail: toWorkspaceError(gmail.reason, "Gmail search failed.") }
        : {}),
      ...(calendar.status === "rejected"
        ? {
            calendar: toWorkspaceError(
              calendar.reason,
              "Calendar search failed.",
            ),
          }
        : {}),
      ...(drive.status === "rejected"
        ? { drive: toWorkspaceError(drive.reason, "Drive search failed.") }
        : {}),
    },
    generatedAt: new Date().toISOString(),
  };

  SEARCH_CACHE.set(cacheKey, response);
  return response;
}

export async function primeDriveMetadataCache(input: {
  userKey: string;
  accessToken: string;
  refreshToken?: string;
}) {
  const cacheKey = hashKey(`${input.userKey}:drive-metadata`);
  if (DRIVE_METADATA_CACHE.has(cacheKey)) {
    return DRIVE_METADATA_CACHE.get(cacheKey) || [];
  }

  const drive = getDriveClient(input.accessToken, input.refreshToken);
  const items: DriveMetadataItem[] = [];
  let pageToken: string | undefined;

  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const response = await drive.files.list({
      q: "trashed = false",
      pageToken,
      pageSize: 100,
      orderBy: "modifiedTime desc",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
    });

    for (const file of response.data.files || []) {
      if (!file.id || !file.name) {
        continue;
      }
      items.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType || "application/octet-stream",
        webViewLink:
          file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        modifiedTime: file.modifiedTime || new Date().toISOString(),
      });
    }

    pageToken = response.data.nextPageToken || undefined;
    if (!pageToken) {
      break;
    }
  }

  DRIVE_METADATA_CACHE.set(cacheKey, items);
  return items;
}

function emptyWidgetBundle(auth: WorkspaceAuthState): DashboardWidgetBundle {
  return {
    auth,
    unreadCount: null,
    todayEvents: [],
    gmailPreview: { items: [], nextPageToken: null },
    calendarPreview: { items: [], nextPageToken: null },
    errors: {},
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Convert a natural language query into Gmail search syntax.
 * Extracts keywords, detects time references, and adds Gmail-specific operators.
 */
function buildGmailQuery(naturalQuery: string): string {
  const lower = naturalQuery.toLowerCase();

  // If already looks like Gmail syntax, pass through
  if (
    /(?:from:|to:|subject:|has:|is:|newer_than:|older_than:|after:|before:|in:)/i.test(
      naturalQuery,
    )
  ) {
    return naturalQuery;
  }

  const parts: string[] = [];

  // Detect time references
  if (
    /today|this morning|just now|a few minutes|minutes ago|recently|just sent|just received/i.test(
      lower,
    )
  ) {
    parts.push("newer_than:1d");
  } else if (/yesterday/i.test(lower)) {
    parts.push("newer_than:2d");
  } else if (/this week|past few days|last few days/i.test(lower)) {
    parts.push("newer_than:7d");
  }

  // Detect attachment references
  if (
    /attach|document|file|pdf|doc|spreadsheet|slide|google doc|shared/i.test(
      lower,
    )
  ) {
    parts.push("has:attachment");
  }

  // Detect unread references
  if (/unread|new email|haven't read/i.test(lower)) {
    parts.push("is:unread");
  }

  // Extract meaningful keywords — strip common filler words
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "about",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "and",
    "but",
    "or",
    "nor",
    "not",
    "so",
    "yet",
    "both",
    "either",
    "neither",
    "each",
    "every",
    "all",
    "any",
    "few",
    "more",
    "most",
    "some",
    "such",
    "no",
    "only",
    "own",
    "same",
    "than",
    "too",
    "very",
    "just",
    "because",
    "as",
    "until",
    "while",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "my",
    "me",
    "i",
    "we",
    "you",
    "your",
    "he",
    "she",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "how",
    "when",
    "where",
    "why",
    "find",
    "search",
    "show",
    "get",
    "look",
    "check",
    "give",
    "sent",
    "received",
    "email",
    "emails",
    "inbox",
    "mail",
    "please",
    "help",
    "tell",
    "want",
    "need",
    "recently",
    "ago",
    "minutes",
    "today",
    "yesterday",
    "morning",
    "afternoon",
    "transcribe",
    "attached",
    "attachment",
    "attachments",
  ]);

  const keywords = naturalQuery
    .replace(/[^a-zA-Z0-9\s@.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  if (keywords.length > 0) {
    // Use at most 5 keywords
    parts.push(keywords.slice(0, 5).join(" "));
  }

  return parts.join(" ").trim() || naturalQuery;
}

/**
 * Extract attachment info from a Gmail message payload.
 */
function extractAttachments(
  payload: Record<string, unknown>,
): Array<{ filename: string; mimeType: string }> {
  const attachments: Array<{ filename: string; mimeType: string }> = [];
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return attachments;
  for (const part of parts) {
    const filename = part.filename as string | undefined;
    const mimeType = part.mimeType as string | undefined;
    if (filename && filename.length > 0) {
      attachments.push({ filename, mimeType: mimeType || "unknown" });
    }
    // Check nested parts (multipart messages)
    if (part.parts) {
      attachments.push(...extractAttachments(part as Record<string, unknown>));
    }
  }
  return attachments;
}

async function searchGmail(
  query: string,
  accessToken: string,
  refreshToken: string | undefined,
  maxResults: number,
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const gmailQuery = buildGmailQuery(query);

  // Run the converted query and also fetch recent emails in parallel
  const [queryResponse, recentResponse] = await Promise.all([
    gmail.users.messages.list({
      userId: "me",
      q: gmailQuery,
      maxResults,
    }),
    gmail.users.messages.list({
      userId: "me",
      q: "newer_than:1d",
      maxResults: Math.min(maxResults, 5),
    }),
  ]);

  // Merge and deduplicate message IDs
  const seen = new Set<string>();
  const allMessageRefs = [
    ...(queryResponse.data.messages || []),
    ...(recentResponse.data.messages || []),
  ];
  const messageIds = allMessageRefs
    .map((message) => message.id)
    .filter((messageId): messageId is string => {
      if (!messageId || seen.has(messageId)) return false;
      seen.add(messageId);
      return true;
    })
    .slice(0, maxResults);

  const messages = await Promise.allSettled(
    messageIds.map((messageId) =>
      gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      }),
    ),
  );

  return messages
    .map((result): ScoredWorkspaceSearchResult | null => {
      if (result.status !== "fulfilled") {
        return null;
      }

      const message = result.value.data;
      const headers = (message.payload?.headers || []) as Array<{
        name: string;
        value: string;
      }>;
      const body = extractEmailBody(
        (message.payload || {}) as Record<string, unknown>,
      );
      const attachments = extractAttachments(
        (message.payload || {}) as Record<string, unknown>,
      );
      const timestamp = message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString();

      const attachmentInfo =
        attachments.length > 0
          ? ` [Attachments: ${attachments.map((a) => a.filename).join(", ")}]`
          : "";

      return {
        source: "gmail" as const,
        id: message.id || crypto.randomUUID(),
        title: (getHeader(headers, "Subject") || "No subject") + attachmentInfo,
        snippet: normalizeSnippet(message.snippet || body),
        url: `https://mail.google.com/mail/u/0/#inbox/${message.threadId || message.id}`,
        timestamp,
        score: 0,
      } satisfies ScoredWorkspaceSearchResult;
    })
    .filter((result): result is ScoredWorkspaceSearchResult => result !== null);
}

async function searchCalendar(
  query: string,
  accessToken: string,
  refreshToken: string | undefined,
  maxResults: number,
) {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const start = new Date();
  start.setDate(start.getDate() - 90);
  const end = new Date();
  end.setDate(end.getDate() + 365);

  const response = await calendar.events.list({
    calendarId: "primary",
    q: query,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (response.data.items || []).map((event) => ({
    source: "calendar" as const,
    id: event.id || crypto.randomUUID(),
    title: event.summary || "Untitled event",
    snippet: normalizeSnippet(
      event.description || event.location || "Calendar event",
    ),
    url:
      event.htmlLink ||
      `https://calendar.google.com/calendar/u/0/r/eventedit/${event.id}`,
    timestamp:
      event.updated ||
      event.start?.dateTime ||
      event.start?.date ||
      new Date().toISOString(),
    score: 0,
  })) satisfies ScoredWorkspaceSearchResult[];
}

async function searchDrive(
  userKey: string,
  query: string,
  accessToken: string,
  refreshToken: string | undefined,
  maxResults: number,
) {
  const drive = getDriveClient(accessToken, refreshToken);
  const cacheKey = hashKey(`${userKey}:drive-metadata`);
  const cachedMetadata = DRIVE_METADATA_CACHE.get(cacheKey) || [];
  const localMatches = cachedMetadata
    .filter((file) => includesNormalized(file.name, query))
    .slice(0, maxResults)
    .map(
      (file) =>
        ({
          source: "drive" as const,
          id: file.id,
          title: file.name,
          snippet: normalizeSnippet(file.mimeType),
          url: file.webViewLink,
          timestamp: file.modifiedTime,
          score: 0,
        }) satisfies ScoredWorkspaceSearchResult,
    );

  const escapedQuery = escapeGoogleQuery(query);
  const remoteResponse = await drive.files.list({
    q: `trashed = false and (name contains '${escapedQuery}' or fullText contains '${escapedQuery}')`,
    pageSize: maxResults,
    orderBy: "modifiedTime desc",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id, name, mimeType, modifiedTime, webViewLink, description)",
  });

  const remoteMatches = (remoteResponse.data.files || []).map(
    (file) =>
      ({
        source: "drive" as const,
        id: file.id || crypto.randomUUID(),
        title: file.name || "Untitled file",
        snippet: normalizeSnippet(
          file.description || file.mimeType || "Drive file",
        ),
        url:
          file.webViewLink ||
          `https://drive.google.com/file/d/${file.id || ""}/view`,
        timestamp: file.modifiedTime || new Date().toISOString(),
        score: 0,
      }) satisfies ScoredWorkspaceSearchResult,
  );

  return rankAndDedupeResults(query, [...localMatches, ...remoteMatches]);
}

function rankAndDedupeResults(
  query: string,
  results: ScoredWorkspaceSearchResult[],
) {
  const deduped = new Map<string, ScoredWorkspaceSearchResult>();

  for (const result of results) {
    const matchScore = getMatchScore(
      query,
      `${result.title} ${result.snippet}`,
    );
    const recencyScore = getRecencyScore(result.timestamp);
    const scored = {
      ...result,
      score: matchScore * 0.7 + recencyScore * 0.3,
    };
    const key = `${scored.source}:${scored.id}`;
    const existing = deduped.get(key);
    if (!existing || scored.score > existing.score) {
      deduped.set(key, scored);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.timestamp.localeCompare(left.timestamp);
  });
}

function stripScore(
  result: ScoredWorkspaceSearchResult,
): WorkspaceSearchResult {
  return {
    source: result.source,
    id: result.id,
    title: result.title,
    snippet: result.snippet,
    url: result.url,
    timestamp: result.timestamp,
  };
}

function getMatchScore(query: string, text: string) {
  const normalizedQuery = normalizeText(query);
  const normalizedText = normalizeText(text);
  if (!normalizedQuery || !normalizedText) {
    return 0;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  let score = normalizedText.includes(normalizedQuery) ? 1 : 0;

  for (const token of tokens) {
    if (normalizedText.includes(token)) {
      score += 0.25;
    }
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    score += 0.5;
  }

  return score;
}

function getRecencyScore(timestamp: string) {
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return 0;
  }

  const days = Math.max(0, (Date.now() - value) / 86_400_000);
  return Math.max(0, 1 - days / 30);
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesNormalized(value: string, query: string) {
  return normalizeText(value).includes(normalizeText(query));
}

function getCalendarEventResponseStatus(event: {
  attendees?: Array<{
    self?: boolean | null;
    responseStatus?: string | null;
  }> | null;
}) {
  const attendees = event.attendees || [];
  const selfAttendee = attendees.find((attendee) => attendee.self);
  return (
    selfAttendee?.responseStatus || (attendees.length === 0 ? "accepted" : null)
  );
}

function formatAttendeeStatus(status: string) {
  if (status === "needsAction") {
    return "Pending response";
  }
  if (status === "tentative") {
    return "Tentative";
  }
  if (status === "declined") {
    return "Declined";
  }
  return "Accepted";
}

function escapeGoogleQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function hashKey(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function toWorkspaceError(
  error: unknown,
  fallbackMessage: string,
): WorkspaceDataError {
  const candidate = error as {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string }>;
    response?: { data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  const reasons = [
    ...(candidate.errors || []).map((entry) => entry.reason || ""),
    ...((candidate.response?.data?.error?.errors || []).map(
      (entry) => entry.reason || "",
    ) || []),
  ];

  if (
    candidate.code === 401 ||
    reasons.includes("authError") ||
    reasons.includes("insufficientPermissions")
  ) {
    return {
      kind: "auth",
      status: candidate.code || 401,
      message: candidate.message || fallbackMessage,
    };
  }

  if (
    reasons.some((reason) =>
      [
        "quotaExceeded",
        "dailyLimitExceeded",
        "rateLimitExceeded",
        "userRateLimitExceeded",
      ].includes(reason),
    )
  ) {
    return {
      kind: "quota",
      status: candidate.code || 429,
      message: candidate.message || fallbackMessage,
    };
  }

  return {
    kind: "api",
    status: candidate.code || 500,
    message: candidate.message || fallbackMessage,
  };
}
