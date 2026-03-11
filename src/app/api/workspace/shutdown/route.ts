import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

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
  });

  // Fire-and-forget: run stop script after a brief delay so the response flushes
  setTimeout(() => {
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
