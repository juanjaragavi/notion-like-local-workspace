import type { WorkspaceSearchResponse } from "@/lib/google-workspace";

declare global {
  var __notionWorkspaceSearchContext:
    | Map<string, WorkspaceSearchResponse>
    | undefined;
}

const store = globalThis.__notionWorkspaceSearchContext || new Map();

if (!globalThis.__notionWorkspaceSearchContext) {
  globalThis.__notionWorkspaceSearchContext = store;
}

export function setSearchContext(
  key: string,
  response: WorkspaceSearchResponse,
) {
  store.set(key, response);
}

export function getSearchContext(key: string) {
  return store.get(key);
}

export function buildSearchContextKey(userId: string, sessionId?: string) {
  return sessionId ? `${userId}:${sessionId}` : userId;
}
