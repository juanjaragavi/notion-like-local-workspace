import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getOrchestrator } from "@/lib/agents";
import type { AgentContext, AgentMessage } from "@/lib/agents";

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

  const history: AgentMessage[] = Array.isArray(body.history)
    ? body.history.slice(-20)
    : [];

  const ctx: AgentContext = {
    userId,
    workspaceId: ws.id,
    accessToken,
    refreshToken,
    sessionId: body.sessionId,
  };

  const orchestrator = getOrchestrator();

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

    return NextResponse.json({
      message: result.message,
      sessionId: result.sessionId,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        // Don't expose raw tool results to client — just metadata
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
