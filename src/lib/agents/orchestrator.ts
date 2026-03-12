import { getGeminiClient, AGENT_MODEL } from "./gemini";
import { allTools, buildToolRegistry, getToolsByNames } from "./tools";
import { subAgentConfigs } from "./sub-agents";
import { buildOrchestratorPrompt } from "./system-prompt";
import { getSkillRegistry } from "./skill-registry";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentContext,
  AgentMessage,
  AgentResponse,
  AgentTool,
  AgentTaskRecord,
  ToolCallResult,
  ToolRegistry,
  SubAgentRole,
  DecomposedTask,
  AgentEventCallback,
} from "./types";
import type { Content, FunctionDeclaration, Part } from "@google/genai";

const MAX_TOOL_ROUNDS = 8;

/**
 * Main agent orchestrator that handles multi-turn conversations with
 * function calling via Gemini API. Supports task decomposition, session
 * tracking, sub-agent delegation, and skill execution.
 */
export class AgentOrchestrator {
  private toolRegistry: ToolRegistry;
  private tools: AgentTool[];
  private systemPrompt: string;

  constructor(tools?: AgentTool[], systemPrompt?: string) {
    this.tools = tools || allTools;
    this.toolRegistry = buildToolRegistry(this.tools);
    this.systemPrompt = systemPrompt || buildOrchestratorPrompt();
  }

  /**
   * Process a user message with optional conversation history.
   * Handles the full function-calling loop: send → tool calls → execute → respond.
   * Tracks sessions and tasks in the database.
   */
  async processMessage(
    userMessage: string,
    ctx: AgentContext,
    history: AgentMessage[] = [],
    onEvent?: AgentEventCallback,
  ): Promise<AgentResponse> {
    // Create or reuse session
    const sessionId = ctx.sessionId || (await this.createSession(ctx));
    const tasks: AgentTaskRecord[] = [];

    // Seed skills on first use (idempotent)
    try {
      await getSkillRegistry().seedDefaults();
    } catch {
      // Non-critical — skills may already exist
    }

    // Add skill discovery tool dynamically
    const skillTool = getSkillRegistry().buildSkillDiscoveryTool();
    const allToolsWithSkills: AgentTool[] = [
      ...this.tools,
      skillTool as unknown as AgentTool,
    ];
    const registry = buildToolRegistry(allToolsWithSkills);

    const client = getGeminiClient();
    const functionDeclarations: FunctionDeclaration[] = allToolsWithSkills.map(
      (t) => t.declaration,
    );

    // Build conversation contents from history
    const contents: Content[] = this.buildContents(history, userMessage, ctx);
    const allToolCalls: ToolCallResult[] = [];

    // Record the main task
    const mainTaskId = await this.recordTask(sessionId, {
      agentRole: "orchestrator" as SubAgentRole,
      description: userMessage,
      input: { message: userMessage },
    });

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      onEvent?.({
        type: "thinking",
        data: {
          round: rounds,
          maxRounds: MAX_TOOL_ROUNDS,
          phase: "reasoning",
          message:
            rounds === 1
              ? "Analyzing your request..."
              : `Processing round ${rounds}...`,
        },
      });

      const dynamicSystemPrompt = ctx.longTermMemory
        ? `${this.systemPrompt}\n\nProject Status & Context (Semantic Memory):\n${ctx.longTermMemory}`
        : this.systemPrompt;

      const response = await client.models.generateContent({
        model: AGENT_MODEL,
        contents,
        config: {
          systemInstruction: dynamicSystemPrompt,
          tools: [{ functionDeclarations }],
          temperature: 0.7,
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        await this.completeTask(
          mainTaskId,
          { error: "No response generated" },
          "failed",
        );
        return {
          message: "I wasn't able to generate a response. Please try again.",
          toolCalls: allToolCalls,
          sessionId,
          tasks,
        };
      }

      const parts = candidate.content.parts;

      // Check for function calls
      const functionCalls = parts.filter((p) => p.functionCall);
      if (functionCalls.length === 0) {
        // No more tool calls — extract final text
        const text = parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("");
        await this.completeTask(mainTaskId, { message: text }, "completed");

        onEvent?.({
          type: "done",
          data: {
            content: text || "Done.",
            sessionId,
            toolCalls: allToolCalls.map((tc) => ({
              name: tc.name,
              args: tc.args,
              success: !(
                tc.result &&
                typeof tc.result === "object" &&
                "error" in (tc.result as Record<string, unknown>)
              ),
            })),
          },
        });

        return {
          message: text || "Done.",
          toolCalls: allToolCalls,
          sessionId,
          tasks,
        };
      }

      // Append model response to contents (preserving thought signatures)
      contents.push({ role: "model", parts: candidate.content.parts });

      // Execute all function calls (parallel)
      const functionResponseParts: Part[] = await Promise.all(
        functionCalls.map(async (part) => {
          const fc = part.functionCall!;
          const toolName = fc.name!;
          const toolArgs = (fc.args || {}) as Record<string, unknown>;
          const tool = registry.get(toolName);

          onEvent?.({
            type: "tool_start",
            data: {
              tool: toolName,
              args: toolArgs,
              message: this.describeToolAction(toolName, toolArgs),
            },
          });

          // Record sub-task
          const taskId = await this.recordTask(sessionId, {
            agentRole: this.inferAgentRole(toolName),
            description: `Tool call: ${toolName}`,
            input: toolArgs,
            parentTaskId: mainTaskId,
          });

          let result: unknown;
          if (!tool) {
            result = { error: `Unknown tool: ${toolName}` };
            await this.completeTask(
              taskId,
              result as Record<string, unknown>,
              "failed",
            );
            onEvent?.({
              type: "tool_complete",
              data: {
                tool: toolName,
                success: false,
                message: `Unknown tool: ${toolName}`,
              },
            });
          } else {
            try {
              result = await tool.handler(toolArgs, ctx);
              await this.completeTask(
                taskId,
                typeof result === "object"
                  ? (result as Record<string, unknown>)
                  : { value: result },
                "completed",
              );
              onEvent?.({
                type: "tool_complete",
                data: {
                  tool: toolName,
                  success: true,
                  message: this.describeToolResult(toolName, result),
                },
              });
            } catch (err) {
              result = {
                error:
                  err instanceof Error ? err.message : "Tool execution failed",
              };
              await this.completeTask(
                taskId,
                result as Record<string, unknown>,
                "failed",
              );
              onEvent?.({
                type: "tool_complete",
                data: {
                  tool: toolName,
                  success: false,
                  message:
                    err instanceof Error
                      ? err.message
                      : "Tool execution failed",
                },
              });
            }
          }

          allToolCalls.push({ name: toolName, args: toolArgs, result });

          return {
            functionResponse: {
              name: toolName,
              response: { result },
            },
          } as Part;
        }),
      );

      // Append function responses as user turn
      contents.push({ role: "user", parts: functionResponseParts });
    }

    await this.completeTask(
      mainTaskId,
      { message: "Max tool rounds reached" },
      "completed",
    );

    const maxRoundsMsg =
      "I reached the maximum number of tool calls for this request. Here's what I found so far.";

    onEvent?.({
      type: "done",
      data: {
        content: maxRoundsMsg,
        sessionId,
        toolCalls: allToolCalls.map((tc) => ({
          name: tc.name,
          args: tc.args,
          success: !(
            tc.result &&
            typeof tc.result === "object" &&
            "error" in (tc.result as Record<string, unknown>)
          ),
        })),
      },
    });

    return {
      message: maxRoundsMsg,
      toolCalls: allToolCalls,
      sessionId,
      tasks,
    };
  }

  /**
   * Run a specialized sub-agent for a specific domain.
   */
  async runSubAgent(
    role: string,
    userMessage: string,
    ctx: AgentContext,
    history: AgentMessage[] = [],
  ): Promise<AgentResponse> {
    const config = subAgentConfigs.find((c) => c.role === role);
    if (!config) {
      return { message: `Unknown sub-agent role: ${role}`, toolCalls: [] };
    }

    const subTools = getToolsByNames(config.toolNames);
    const subOrchestrator = new AgentOrchestrator(
      subTools,
      config.systemPrompt,
    );
    return subOrchestrator.processMessage(userMessage, ctx, history);
  }

  /**
   * Decompose a complex request into sub-tasks and execute them.
   * Used when the orchestrator detects a multi-step workflow.
   */
  async executeDecomposed(
    tasks: DecomposedTask[],
    ctx: AgentContext,
  ): Promise<AgentResponse> {
    const allToolCalls: ToolCallResult[] = [];
    const results: Array<{ task: string; result: string }> = [];

    // Group tasks by dependency level
    const executed = new Set<string>();
    const remaining = [...tasks];

    while (remaining.length > 0) {
      // Find tasks whose dependencies are all met
      const ready = remaining.filter((t) =>
        t.dependsOn.every((dep) => executed.has(dep)),
      );
      if (ready.length === 0) {
        results.push({
          task: "dependency-resolution",
          result: "Could not resolve remaining task dependencies",
        });
        break;
      }

      // Execute ready tasks (in parallel if independent)
      const batchResults = await Promise.all(
        ready.map(async (task) => {
          const response = await this.runSubAgent(
            task.agentRole,
            task.description,
            ctx,
          );
          allToolCalls.push(...response.toolCalls);
          executed.add(task.id);
          // Remove from remaining
          const idx = remaining.findIndex((t) => t.id === task.id);
          if (idx >= 0) remaining.splice(idx, 1);
          return { task: task.description, result: response.message };
        }),
      );
      results.push(...batchResults);
    }

    const summary = results
      .map((r, i) => `${i + 1}. ${r.task}\n   → ${r.result}`)
      .join("\n\n");

    return {
      message: `Completed ${results.length} task(s):\n\n${summary}`,
      toolCalls: allToolCalls,
    };
  }

  // ── Session & Task Tracking ──

  private async createSession(ctx: AgentContext): Promise<string> {
    const db = getDb();
    const id = uuidv4();
    try {
      await db.query(
        `INSERT INTO agent_sessions (id, workspace_id, user_id, status, context)
         VALUES ($1, $2, $3, 'active', $4)`,
        [
          id,
          ctx.workspaceId,
          ctx.userId,
          JSON.stringify({ accessToken: "***", workspaceId: ctx.workspaceId }),
        ],
      );
    } catch {
      // Non-critical — session tracking is best-effort
    }
    return id;
  }

  private async recordTask(
    sessionId: string,
    task: {
      agentRole: SubAgentRole | string;
      description: string;
      input: Record<string, unknown>;
      parentTaskId?: string;
    },
  ): Promise<string> {
    const db = getDb();
    const id = uuidv4();
    try {
      await db.query(
        `INSERT INTO agent_tasks (id, session_id, parent_task_id, agent_role, description, status, input)
         VALUES ($1, $2, $3, $4, $5, 'running', $6)`,
        [
          id,
          sessionId,
          task.parentTaskId || null,
          task.agentRole,
          task.description,
          JSON.stringify(task.input),
        ],
      );
    } catch {
      // Non-critical
    }
    return id;
  }

  private async completeTask(
    taskId: string,
    output: Record<string, unknown>,
    status: "completed" | "failed",
  ): Promise<void> {
    const db = getDb();
    try {
      await db.query(
        `UPDATE agent_tasks SET status = $1, output = $2, completed_at = NOW()
         WHERE id = $3`,
        [status, JSON.stringify(output), taskId],
      );
    } catch {
      // Non-critical
    }
  }

  /**
   * Generate a human-readable description of what a tool is doing.
   */
  private describeToolAction(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    const descriptions: Record<string, (a: Record<string, unknown>) => string> =
      {
        search_emails: (a) =>
          `Searching emails${a.query ? ` for "${a.query}"` : ""}`,
        read_email: () => "Reading email content",
        send_email: (a) => `Sending email${a.to ? ` to ${a.to}` : ""}`,
        get_upcoming_events: () => "Fetching upcoming calendar events",
        get_today_schedule: () => "Getting today's schedule",
        create_calendar_event: (a) =>
          `Creating event${a.summary ? `: ${a.summary}` : ""}`,
        update_calendar_event: () => "Updating calendar event",
        delete_calendar_event: () => "Deleting calendar event",
        list_action_items: () => "Loading action items",
        create_action_item: (a) =>
          `Creating task${a.title ? `: ${a.title}` : ""}`,
        update_action_item: () => "Updating action item",
        list_pages: () => "Listing workspace pages",
        read_page: (a) => `Reading page${a.title ? `: ${a.title}` : ""}`,
        create_page: (a) => `Creating page${a.title ? `: ${a.title}` : ""}`,
        update_page: () => "Updating page content",
        list_transcriptions: () => "Loading transcriptions",
        process_transcription_email: () => "Processing transcription email",
        read_transcription: () => "Reading transcription",
        discover_skills: () => "Discovering available skills",
      };
    const fn = descriptions[toolName];
    return fn ? fn(args) : `Executing ${toolName.replace(/_/g, " ")}`;
  }

  /**
   * Generate a human-readable summary of a tool's result.
   */
  private describeToolResult(toolName: string, result: unknown): string {
    if (!result || typeof result !== "object") return "Completed";
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.emails)) return `Found ${r.emails.length} email(s)`;
    if (Array.isArray(r.events)) return `Found ${r.events.length} event(s)`;
    if (Array.isArray(r.items)) return `Found ${r.items.length} item(s)`;
    if (Array.isArray(r.pages)) return `Found ${r.pages.length} page(s)`;
    if (Array.isArray(r.skills)) return `Found ${r.skills.length} skill(s)`;
    if (r.id) return "Created successfully";
    if (r.success) return "Completed successfully";
    return "Completed";
  }

  /**
   * Infer which sub-agent role a tool belongs to.
   */
  private inferAgentRole(toolName: string): SubAgentRole {
    const roleMap: Record<string, SubAgentRole> = {
      search_emails: "email-analyst",
      read_email: "email-analyst",
      get_upcoming_events: "calendar-planner",
      get_today_schedule: "calendar-planner",
      list_action_items: "task-manager",
      create_action_item: "task-manager",
      update_action_item: "task-manager",
      list_pages: "document-writer",
      read_page: "document-writer",
      create_page: "document-writer",
      update_page: "document-writer",
      list_transcriptions: "transcription-processor",
      process_transcription_email: "transcription-processor",
      read_transcription: "transcription-processor",
    };
    return roleMap[toolName] || "document-writer";
  }

  /**
   * Convert AgentMessage history + new user message into Gemini Content array.
   */
  private buildContents(
    history: AgentMessage[],
    userMessage: string,
    ctx: AgentContext,
  ): Content[] {
    const contents: Content[] = [];

    if (ctx.workspaceSearch && ctx.workspaceSearch.results.length > 0) {
      contents.push({
        role: "user",
        parts: [
          {
            text: this.buildWorkspaceSearchContext(ctx.workspaceSearch),
          },
        ],
      });
    }

    for (const msg of history) {
      if (msg.role === "user") {
        contents.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (msg.role === "agent") {
        contents.push({ role: "model", parts: [{ text: msg.content }] });
      }
      // tool messages are handled inline during processing
    }

    contents.push({ role: "user", parts: [{ text: userMessage }] });
    return contents;
  }

  private buildWorkspaceSearchContext(
    search: NonNullable<AgentContext["workspaceSearch"]>,
  ) {
    const lines = search.results
      .slice(0, 8)
      .map(
        (result, index) =>
          `${index + 1}. [${result.source}] ${result.title} | ${result.timestamp} | ${result.snippet} | ${result.url}`,
      )
      .join("\n");

    return [
      `Workspace search context for the current user query: ${search.query}`,
      "Use these results as live Gmail, Calendar, and Drive evidence when answering.",
      lines,
    ].join("\n");
  }
}

/** Singleton orchestrator instance */
let _orchestrator: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new AgentOrchestrator();
  }
  return _orchestrator;
}
