import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMCPClient } from "@/lib/agents/mcp-client";

/**
 * GET /api/agent/mcp — Check MCP server health and list available tools
 */
export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = getMCPClient();
  const health = await client.healthCheck();
  const servers = await client.discoverTools();

  return NextResponse.json({
    servers: health,
    tools: servers.flatMap((s) =>
      s.tools.map((t) => ({
        server: s.name,
        name: t.name,
        description: t.description,
      })),
    ),
  });
}
