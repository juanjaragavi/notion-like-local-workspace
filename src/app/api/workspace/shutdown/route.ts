import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { processRegistry } from "@/lib/process-registry";
import { getDb } from "@/lib/db";

const SESSION_DIR = path.join(homedir(), ".notion-workspace");
const SESSION_STATE_FILE = path.join(SESSION_DIR, "session-state.json");

/**
 * Persist non-sensitive session metadata to local storage before shutdown.
 * Actual tokens remain exclusively in the database; this file records which
 * accounts have active sessions so subsequent launches can verify persistence
 * without requiring a database round-trip.
 */
async function persistSessionState(): Promise<void> {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT a.provider, a.provider_account_id, a.scope, a.token_type,
              a.expires_at, u.email, u.name
       FROM accounts a
       JOIN users u ON a.user_id = u.id
       ORDER BY a.expires_at DESC NULLS LAST`,
    );

    await mkdir(SESSION_DIR, { recursive: true });
    await writeFile(
      SESSION_STATE_FILE,
      JSON.stringify(
        {
          persistedAt: new Date().toISOString(),
          accounts: result.rows.map((row: Record<string, unknown>) => ({
            provider: row.provider,
            providerAccountId: row.provider_account_id,
            email: row.email,
            name: row.name,
            scope: row.scope,
            tokenType: row.token_type,
            expiresAt: row.expires_at,
            hasActiveSession: true,
          })),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );

    console.log("[shutdown] Session state persisted to", SESSION_STATE_FILE);
  } catch (err) {
    console.error("[shutdown] Failed to persist session state:", err);
  }
}

export async function POST() {
  // Safety: only allow shutdown in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Shutdown is disabled in production" },
      { status: 403 },
    );
  }

  // Persist session state before any teardown
  await persistSessionState();

  const scriptPath = path.resolve(process.cwd(), "workspace-stop.sh");

  // Send response first, then trigger async shutdown
  const response = NextResponse.json({
    status: "shutting_down",
    message: "Workspace is shutting down. This page will become unreachable.",
    terminatedProcesses: processRegistry.list(),
  });

  // Fire-and-forget: tear down registered child processes, then run stop script
  setTimeout(async () => {
    // Phase 1 — terminate all registered child processes
    await processRegistry.teardown();

    // Phase 2 — run the OS-level stop script for remaining services
    exec(`bash "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error("[shutdown] Error:", error.message);
      }
      if (stdout) console.log("[shutdown]", stdout);
      if (stderr) console.error("[shutdown]", stderr);
    });
  }, 500);

  return response;
}

/** GET /api/workspace/shutdown — returns currently registered child processes */
export async function GET() {
  return NextResponse.json({
    registeredProcesses: processRegistry.list(),
    count: processRegistry.size,
  });
}
