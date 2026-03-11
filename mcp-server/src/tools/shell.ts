import { execFile } from "child_process";
import { promisify } from "util";
import type { MCPTool } from "../types";

const execFileAsync = promisify(execFile);
const TIMEOUT = 30000;
const MAX_OUTPUT = 50000;

const BLOCKED = [
  /\brm\s+-rf\s+[/~]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt)\b/i,
  /\bsudo\s+rm/i,
  />\s*\/dev\//i,
  /\bdiskutil\s+erase/i,
];

function truncate(s: string): string {
  return s.length > MAX_OUTPUT
    ? s.slice(0, MAX_OUTPUT) + "\n...[truncated]"
    : s;
}

export const shellTools: MCPTool[] = [
  {
    name: "mcp_shell_exec",
    description:
      "Execute a shell command on the host macOS system. Returns stdout and stderr. Dangerous commands are blocked.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: {
          type: "string",
          description: "Working directory (default: home)",
        },
      },
      required: ["command"],
    },
    handler: async (args: Record<string, unknown>) => {
      const command = args.command as string;
      const cwd = (args.cwd as string) || process.env.HOME || "/";

      if (BLOCKED.some((p) => p.test(command))) {
        return { error: "Command blocked: potentially destructive" };
      }

      try {
        const { stdout, stderr } = await execFileAsync(
          "/bin/zsh",
          ["-c", command],
          { cwd, timeout: TIMEOUT, maxBuffer: 1024 * 1024 },
        );
        return {
          success: true,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
        };
      } catch (err) {
        const e = err as {
          stdout?: string;
          stderr?: string;
          code?: number;
          message?: string;
        };
        return {
          error: e.message || "Execution failed",
          stdout: truncate(e.stdout || ""),
          stderr: truncate(e.stderr || ""),
          exitCode: e.code,
        };
      }
    },
  },
  {
    name: "mcp_shell_which",
    description:
      "Check if a command is available on the system (like `which`).",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command name to look up" },
      },
      required: ["command"],
    },
    handler: async (args: Record<string, unknown>) => {
      const cmd = args.command as string;
      // Validate: only allow simple command names (no spaces, pipes, etc.)
      if (!/^[a-zA-Z0-9_.-]+$/.test(cmd)) {
        return { error: "Invalid command name" };
      }
      try {
        const { stdout } = await execFileAsync("/usr/bin/which", [cmd], {
          timeout: 5000,
        });
        return { found: true, path: stdout.trim() };
      } catch {
        return { found: false, path: null };
      }
    },
  },
];
