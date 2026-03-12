/**
 * Structured logger for server-side use.
 * Outputs JSON lines in production, colored text in development.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: unknown): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta !== undefined ? { meta } : {}),
  };

  // typeof window check distinguishes server from browser at runtime
  if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
    // Server: structured JSON for log aggregators
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    if (level === "error") {
      console.error(prefix, message, meta ?? "");
    } else if (level === "warn") {
      console.warn(prefix, message, meta ?? "");
    } else {
      console.log(prefix, message, meta ?? "");
    }
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
