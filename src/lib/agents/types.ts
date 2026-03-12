import type { FunctionDeclaration } from "@google/genai";
import type { WorkspaceSearchResponse } from "@/lib/google-workspace";

/** Roles for conversation history */
export type MessageRole = "user" | "agent" | "system" | "tool";

/** A single message in the agent conversation */
export interface AgentMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallResult[];
  timestamp: string;
}

/** Result of a tool execution */
export interface ToolCallResult {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** Context injected into every agent call */
export interface AgentContext {
  userId: string;
  workspaceId: string;
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  workspaceSearch?: WorkspaceSearchResponse;
  longTermMemory?: string;
}

/** A tool that the agent can invoke */
export interface AgentTool {
  declaration: FunctionDeclaration;
  handler: (
    args: Record<string, unknown>,
    ctx: AgentContext,
  ) => Promise<unknown>;
}

/** Registry of named tools for lookup */
export type ToolRegistry = Map<string, AgentTool>;

/** Response from the orchestrator */
export interface AgentResponse {
  message: string;
  toolCalls: ToolCallResult[];
  sessionId?: string;
  tasks?: AgentTaskRecord[];
}

/** Supported sub-agent specializations */
export type SubAgentRole =
  | "email-analyst"
  | "calendar-planner"
  | "task-manager"
  | "transcription-processor"
  | "document-writer"
  | "communication";

/** Configuration for a sub-agent */
export interface SubAgentConfig {
  role: SubAgentRole;
  systemPrompt: string;
  toolNames: string[];
}

// ── Agent Session & Task Tracking ──

export type AgentSessionStatus = "active" | "completed" | "failed";
export type AgentTaskStatus = "pending" | "running" | "completed" | "failed";

export interface AgentSession {
  id: string;
  workspaceId: string;
  userId: string;
  status: AgentSessionStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskRecord {
  id: string;
  sessionId: string;
  parentTaskId: string | null;
  agentRole: SubAgentRole;
  description: string;
  status: AgentTaskStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ── Skill System ──

export type SkillCategory =
  | "document"
  | "communication"
  | "calendar"
  | "workflow";

export interface SkillStep {
  agentRole: SubAgentRole;
  action: string;
  description: string;
  params?: Record<string, unknown>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  agentRole: SubAgentRole;
  steps: SkillStep[];
  config: Record<string, unknown>;
  createdAt: string;
}

// ── MCP Integration ──

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerConfig {
  name: string;
  url: string;
  tools: MCPToolDefinition[];
}

export interface MCPToolCallRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// ── Agent Streaming Events ──

export type AgentStreamEventType =
  | "status"
  | "tool_start"
  | "tool_complete"
  | "thinking"
  | "done"
  | "error";

export interface AgentStreamEvent {
  type: AgentStreamEventType;
  data: {
    phase?: string;
    message?: string;
    tool?: string;
    args?: Record<string, unknown>;
    success?: boolean;
    round?: number;
    maxRounds?: number;
    sessionId?: string;
    content?: string;
    toolCalls?: Array<{
      name: string;
      args: Record<string, unknown>;
      success: boolean;
    }>;
    error?: string;
  };
}

export type AgentEventCallback = (event: AgentStreamEvent) => void;

// ── Orchestrator Task Decomposition ──

export interface DecomposedTask {
  id: string;
  agentRole: SubAgentRole;
  description: string;
  input: Record<string, unknown>;
  dependsOn: string[];
}
