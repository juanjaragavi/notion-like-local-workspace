import type { MCPServerConfig, MCPToolCallResponse } from "./types";

/**
 * MCP (Model Context Protocol) client for connecting to Dockerized MCP servers.
 * Handles tool discovery and invocation over HTTP JSON-RPC.
 */
export class MCPClient {
  private servers: MCPServerConfig[] = [];
  private initialized = false;

  constructor(private serverUrls: string[] = []) {
    // Default local MCP server
    if (serverUrls.length === 0) {
      const mcpUrl = process.env.MCP_SERVER_URL || "http://localhost:3100";
      this.serverUrls = [mcpUrl];
    }
  }

  /**
   * Discover tools from all configured MCP servers.
   */
  async discoverTools(): Promise<MCPServerConfig[]> {
    if (this.initialized) return this.servers;

    this.servers = [];
    for (const url of this.serverUrls) {
      try {
        const response = await fetch(`${url}/tools`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) continue;
        const data = (await response.json()) as {
          name?: string;
          tools?: Array<{
            name: string;
            description: string;
            inputSchema: Record<string, unknown>;
          }>;
        };
        this.servers.push({
          name: data.name || url,
          url,
          tools: data.tools || [],
        });
      } catch {
        // Server not available — skip
        console.warn(`[MCP] Server at ${url} not reachable`);
      }
    }

    this.initialized = true;
    return this.servers;
  }

  /**
   * Invoke a tool on an MCP server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResponse> {
    await this.discoverTools();

    // Find which server has this tool
    const server = this.servers.find((s) =>
      s.tools.some((t) => t.name === toolName),
    );
    if (!server) {
      return {
        content: [
          {
            type: "text",
            text: `Tool "${toolName}" not found on any MCP server`,
          },
        ],
        isError: true,
      };
    }

    try {
      const response = await fetch(`${server.url}/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: toolName, arguments: args },
          id: Date.now(),
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          content: [{ type: "text", text: `MCP call failed: ${text}` }],
          isError: true,
        };
      }

      const data = (await response.json()) as {
        result?: MCPToolCallResponse;
        error?: { message: string };
      };
      if (data.error) {
        return {
          content: [{ type: "text", text: data.error.message }],
          isError: true,
        };
      }
      return data.result || { content: [{ type: "text", text: "No result" }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text:
              err instanceof Error ? err.message : "MCP tool invocation failed",
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check if MCP servers are available.
   */
  async healthCheck(): Promise<
    Array<{ url: string; available: boolean; toolCount: number }>
  > {
    const results = [];
    for (const url of this.serverUrls) {
      try {
        const response = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        const ok = response.ok;
        const data = ok
          ? ((await response.json()) as { tools?: number })
          : null;
        results.push({
          url,
          available: ok,
          toolCount: data?.tools || 0,
        });
      } catch {
        results.push({ url, available: false, toolCount: 0 });
      }
    }
    return results;
  }
}

/** Singleton MCP client */
let _client: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!_client) {
    const urls = process.env.MCP_SERVER_URLS
      ? process.env.MCP_SERVER_URLS.split(",").map((u) => u.trim())
      : undefined;
    _client = new MCPClient(urls);
  }
  return _client;
}
