export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: "google" | "apple" | "credentials";
  createdAt: string;
}

export interface Account {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface Page {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  coverImage: string | null;
  parentId: string | null;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  createdAt: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  assignee: string | null;
  dueDate: string | null;
  sourceType: "transcription" | "manual" | "email";
  sourceId: string | null;
  workspaceId: string;
  pageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: string;
  end: string;
  meetLink: string | null;
  attendees: string[];
  organizer: string | null;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
  isTranscription: boolean;
}

export interface Transcription {
  id: string;
  emailId: string;
  meetingTitle: string;
  meetingDate: string;
  participants: string[];
  rawContent: string;
  actionItems: ActionItem[];
  summary: string | null;
  workspaceId: string;
  createdAt: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  extension: string | null;
}

// ── Agent Framework Types ──

export interface AgentSession {
  id: string;
  workspaceId: string;
  userId: string;
  status: "active" | "completed" | "failed";
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTask {
  id: string;
  sessionId: string;
  parentTaskId: string | null;
  agentRole: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  agentRole: string;
  steps: Array<{
    agentRole: string;
    action: string;
    description: string;
    params?: Record<string, unknown>;
  }>;
  config: Record<string, unknown>;
  createdAt: string;
}
