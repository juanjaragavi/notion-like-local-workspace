import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthChecks {
  database: string;
  mcp: string;
}

/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe for Vercel uptime monitoring,
 * Cloud Run health-checks, and external SLA monitors.
 *
 * Returns 200 {"status":"healthy"} when all critical services are reachable.
 * Returns 503 {"status":"degraded"} when the database is unreachable.
 * MCP server unavailability is non-fatal (optional service).
 */
export async function GET(_req: NextRequest) {
  const checks: HealthChecks = { database: "unknown", mcp: "unknown" };
  let healthy = true;

  // ── Database ────────────────────────────────────────────────────────────
  try {
    const db = getDb();
    await (db as unknown as { query: (sql: string) => Promise<unknown> }).query(
      "SELECT 1",
    );
    checks.database = "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[health] Database check failed", msg);
    checks.database = `error: ${msg}`;
    healthy = false;
  }

  // ── MCP Server (optional) ───────────────────────────────────────────────
  const mcpUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3100";
  try {
    const res = await fetch(`${mcpUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    checks.mcp = res.ok ? "ok" : `degraded (HTTP ${res.status})`;
  } catch {
    // MCP is optional — degraded uptime but not a hard failure
    checks.mcp = "unavailable (optional)";
  }

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { status: healthy ? 200 : 503 },
  );
}
