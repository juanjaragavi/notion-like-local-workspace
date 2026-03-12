import type { MCPServerConfig, MCPToolCallResponse } from "./types";
import { logger } from "@/lib/logger";

// ── Cloud Run identity-token cache ──────────────────────────────────────────
// Tokens are valid for ~1 hour; cache with a 5-minute safety margin.
interface TokenEntry {
  token: string;
  expiresAt: number; // epoch ms
}
const _tokenCache = new Map<string, TokenEntry>();

/**
 * Fetch a GCP OIDC identity token for the given audience URL.
 *
 * Used to authenticate requests to Cloud Run services deployed with
 * --no-allow-unauthenticated.  Falls back to an optional
 * MCP_SERVER_TOKEN env var so local curl testing still works without
 * the google-auth-library metadata-server flow.
 *
 * Returns null for plain http:// URLs (local dev — no auth needed).
 */
async function getIdentityToken(audience: string): Promise<string | null> {
  // Local dev: no auth header required
  if (audience.startsWith("http://")) return null;

  // Static override for testing / manual CI
  if (process.env.MCP_SERVER_TOKEN) return process.env.MCP_SERVER_TOKEN;

  const now = Date.now();
  const cached = _tokenCache.get(audience);
  if (cached && cached.expiresAt > now) return cached.token;

  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(audience);
    // getRequestHeaders() is typed as returning the Fetch API Headers class,
    // but the google-auth-library runtime value is a plain Record<string,string>.
    // Cast through unknown to satisfy the compiler without a suppression comment.
    const rawHeaders = (await client.getRequestHeaders()) as unknown as Record<
      string,
      string
    >;
    const authHeader =
      rawHeaders["Authorization"] ?? rawHeaders["authorization"];
    if (!authHeader)
      throw new Error("No Authorization header from IdTokenClient");
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // Cache for 55 minutes
    _tokenCache.set(audience, { token, expiresAt: now + 55 * 60 * 1000 });
    return token;
  } catch (err) {
    logger.warn(
      "[MCP] Could not fetch identity token",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Build headers for an MCP request, injecting an Authorization header when
 * the target is a Cloud Run (https) endpoint.
 */
async function authHeaders(
  url: string,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  // Derive the audience as the scheme+host (Cloud Run requires this)
  const { origin } = new URL(url);
  const token = await getIdentityToken(origin);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/**
 * MCP (Model Context Protocol) client for connecting to MCP servers.
 * Handles tool discovery and invocation over HTTP JSON-RPC.
 * Supports both local (unauthenticated) and Cloud Run (IAM identity token)
 * deployments transparently.
 */
export class MCPClient {
  private servers: MCPServerConfig[] = [];
  private initialized = false;

  constructor(private serverUrls: string[] = []) {
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
          headers: await authHeaders(url),
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
        logger.warn(`[MCP] Server at ${url} not reachable`);
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
        headers: await authHeaders(server.url),
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
          headers: await authHeaders(url),
          signal: AbortSignal.timeout(3000),
        });
        const ok = response.ok;
        const data = ok
          ? ((await response.json()) as { tools?: number })
          : null;
        results.push({ url, available: ok, toolCount: data?.tools || 0 });
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
