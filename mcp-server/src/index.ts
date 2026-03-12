import express, { type Request, type Response } from "express";
import { shellTools } from "./tools/shell";
import { finderTools } from "./tools/finder";
import { filesystemTools } from "./tools/filesystem";
import type { MCPTool } from "./types";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Cloud Run injects PORT; MCP_PORT is the local/custom fallback.
const PORT = parseInt(process.env.PORT || process.env.MCP_PORT || "3100", 10);
const SERVER_NAME = "notion-workspace-mcp";

// Aggregate all tool definitions
const tools: MCPTool[] = [...shellTools, ...finderTools, ...filesystemTools];
const toolMap = new Map(tools.map((t) => [t.name, t]));

// ── Health Check ──
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: SERVER_NAME,
    tools: tools.length,
    uptime: process.uptime(),
  });
});

// ── Tool Discovery ──
app.get("/tools", (_req: Request, res: Response) => {
  res.json({
    name: SERVER_NAME,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
});

// ── Tool Invocation (JSON-RPC style) ──
interface ToolCallBody {
  jsonrpc?: string;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
  id?: number | string;
}

app.post(
  "/tools/call",
  async (req: Request<object, unknown, ToolCallBody>, res: Response) => {
    const body = req.body;

    const toolName = body.params?.name;
    const toolArgs = body.params?.arguments || {};
    const requestId = body.id || Date.now();

    if (!toolName) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Missing params.name" },
        id: requestId,
      });
      return;
    }

    const tool = toolMap.get(toolName);
    if (!tool) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32601, message: `Tool not found: ${toolName}` },
        id: requestId,
      });
      return;
    }

    try {
      const result = await tool.handler(toolArgs);
      res.json({
        jsonrpc: "2.0",
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
        id: requestId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tool execution failed";
      res.status(500).json({
        jsonrpc: "2.0",
        result: {
          content: [{ type: "text", text: message }],
          isError: true,
        },
        id: requestId,
      });
    }
  },
);

// ── Start ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[MCP] ${SERVER_NAME} listening on port ${PORT}`);
  console.log(`[MCP] ${tools.length} tools registered:`);
  tools.forEach((t) => console.log(`  - ${t.name}: ${t.description}`));
});
