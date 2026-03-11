import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import { processRegistry } from "@/lib/process-registry";

export async function POST() {
  // Safety: only allow shutdown in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Shutdown is disabled in production" },
      { status: 403 },
    );
  }

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
