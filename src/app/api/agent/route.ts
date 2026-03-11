import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchContextKey,
  setSearchContext,
} from "@/lib/agents/search-context";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getOrchestrator } from "@/lib/agents";
import {
  getSessionHistory,
  saveMessage,
  extractAndStoreMemory,
  getSemanticContext,
} from "@/lib/agents/memory";
import {
  primeDriveMetadataCache,
  searchGoogleWorkspace,
} from "@/lib/google-workspace";
import type {
  AgentContext,
  AgentMessage,
  AgentStreamEvent,
} from "@/lib/agents";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.userId as string;
  const accessToken = session.accessToken as string;
  const refreshToken = session.refreshToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json(
      { error: "No Google access token" },
      { status: 403 },
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const db = getDb();
  const resWs = await db.query(
    "SELECT id FROM workspaces WHERE owner_id = $1",
    [userId],
  );
  const ws = resWs.rows[0] as { id: string } | undefined;
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  let body: {
    message?: string;
    history?: AgentMessage[];
    subAgent?: string;
    sessionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Cap message length to prevent abuse
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (max 4000 chars)" },
      { status: 400 },
    );
  }

  let history: AgentMessage[] = Array.isArray(body.history)
    ? body.history.slice(-20)
    : [];

  if (body.sessionId && history.length <= 1) {
    const dbHistory = await getSessionHistory(body.sessionId);
    if (dbHistory && dbHistory.length > 0) {
      history = dbHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
    }
  }

  // Save the user message to memory
  if (body.sessionId) {
    await saveMessage(body.sessionId, "user", message.trim());
    await extractAndStoreMemory(ws.id, message.trim());
  }

  const orchestrator = getOrchestrator();

  // Check if client accepts SSE streaming
  const acceptsStream = req.headers
    .get("accept")
    ?.includes("text/event-stream");

  if (acceptsStream) {
    // ── SSE Streaming Response ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: AgentStreamEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // Stream may have been closed by client
          }
        };

        try {
          emit({
            type: "status",
            data: { phase: "searching", message: "Searching workspace..." },
          });

          const workspaceSearch = await searchGoogleWorkspace({
            userKey: userId,
            query: message.trim(),
            accessToken,
            refreshToken,
            grantedScopes: session.grantedScopes,
            maxResults: 8,
          });

          emit({
            type: "status",
            data: { phase: "context", message: "Loading context..." },
          });

          const longTermMemory = await getSemanticContext(ws.id);

          const ctx: AgentContext = {
            userId,
            workspaceId: ws.id,
            accessToken,
            refreshToken,
            sessionId: body.sessionId,
            workspaceSearch,
            longTermMemory,
          };

          emit({
            type: "thinking",
            data: {
              phase: "reasoning",
              message: "Reasoning about your request...",
            },
          });

          let result;
          if (body.subAgent) {
            result = await orchestrator.runSubAgent(
              body.subAgent,
              message.trim(),
              ctx,
              history,
            );
          } else {
            result = await orchestrator.processMessage(
              message.trim(),
              ctx,
              history,
              emit,
            );
          }

          setSearchContext(
            buildSearchContextKey(userId, result.sessionId || body.sessionId),
            workspaceSearch,
          );

          // Save messages to memory
          if (result.sessionId || body.sessionId) {
            const activeSession = result.sessionId || body.sessionId;
            if (activeSession) {
              if (!body.sessionId) {
                await saveMessage(activeSession, "user", message.trim());
                await extractAndStoreMemory(ws.id, message.trim());
              }
              await saveMessage(activeSession, "agent", result.message);
              await extractAndStoreMemory(ws.id, result.message);
            }
          }

          // Send final done event (orchestrator also sends one, but this ensures it)
          emit({
            type: "done",
            data: {
              content: result.message,
              sessionId: result.sessionId,
              toolCalls: result.toolCalls.map((tc) => ({
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
        } catch (err) {
          console.error("[Agent] Stream Error:", err);
          emit({
            type: "error",
            data: {
              error:
                err instanceof Error ? err.message : "Agent processing failed",
            },
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ── Standard JSON Response (backwards compatible) ──
  void primeDriveMetadataCache({
    userKey: userId,
    accessToken,
    refreshToken,
  }).catch(() => undefined);

  const workspaceSearch = await searchGoogleWorkspace({
    userKey: userId,
    query: message.trim(),
    accessToken,
    refreshToken,
    grantedScopes: session.grantedScopes,
    maxResults: 8,
  });

  const longTermMemory = await getSemanticContext(ws.id);

  const ctx: AgentContext = {
    userId,
    workspaceId: ws.id,
    accessToken,
    refreshToken,
    sessionId: body.sessionId,
    workspaceSearch,
    longTermMemory,
  };

  try {
    let result;
    if (body.subAgent) {
      result = await orchestrator.runSubAgent(
        body.subAgent,
        message.trim(),
        ctx,
        history,
      );
    } else {
      result = await orchestrator.processMessage(message.trim(), ctx, history);
    }

    setSearchContext(
      buildSearchContextKey(userId, result.sessionId || body.sessionId),
      workspaceSearch,
    );

    if (result.sessionId || body.sessionId) {
      const activeSession = result.sessionId || body.sessionId;
      if (activeSession) {
        if (!body.sessionId) {
          await saveMessage(activeSession, "user", message.trim());
          await extractAndStoreMemory(ws.id, message.trim());
        }
        await saveMessage(activeSession, "agent", result.message);
        await extractAndStoreMemory(ws.id, result.message);
      }
    }

    return NextResponse.json({
      message: result.message,
      sessionId: result.sessionId,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        success: !(
          tc.result &&
          typeof tc.result === "object" &&
          "error" in (tc.result as Record<string, unknown>)
        ),
      })),
    });
  } catch (err) {
    console.error("[Agent] Error:", err);
    const message =
      err instanceof Error ? err.message : "Agent processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
