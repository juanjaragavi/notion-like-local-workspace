import { execFile } from "child_process";
import { promisify } from "util";
import type { MCPTool } from "../types";

const execFileAsync = promisify(execFile);
const TIMEOUT = 15000;

export const finderTools: MCPTool[] = [
  {
    name: "mcp_finder_open",
    description:
      "Open a file or folder in macOS Finder, or open a URL in the default browser.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "File path, folder path, or URL to open",
        },
      },
      required: ["target"],
    },
    handler: async (args: Record<string, unknown>) => {
      const target = args.target as string;
      try {
        const { stdout } = await execFileAsync("/usr/bin/open", [target], {
          timeout: TIMEOUT,
        });
        return { success: true, target, output: stdout.trim() || undefined };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Failed to open target",
        };
      }
    },
  },
  {
    name: "mcp_finder_reveal",
    description: "Reveal a file in Finder (highlight it in its parent folder).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to reveal in Finder" },
      },
      required: ["path"],
    },
    handler: async (args: Record<string, unknown>) => {
      const filePath = args.path as string;
      try {
        const { stdout } = await execFileAsync(
          "/usr/bin/open",
          ["-R", filePath],
          {
            timeout: TIMEOUT,
          },
        );
        return {
          success: true,
          path: filePath,
          output: stdout.trim() || undefined,
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Failed to reveal file",
        };
      }
    },
  },
  {
    name: "mcp_applescript",
    description:
      "Execute an AppleScript command via osascript. Use for macOS automation: Finder, Keynote, Pages, Mail, System Preferences, window management, etc.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "AppleScript code to execute" },
      },
      required: ["script"],
    },
    handler: async (args: Record<string, unknown>) => {
      const script = args.script as string;
      // Block dangerous patterns
      if (/do\s+shell\s+script.*rm\s+-rf/i.test(script)) {
        return { error: "Blocked: dangerous shell command inside AppleScript" };
      }
      try {
        const { stdout, stderr } = await execFileAsync(
          "/usr/bin/osascript",
          ["-e", script],
          { timeout: TIMEOUT, maxBuffer: 512 * 1024 },
        );
        return {
          success: true,
          output: stdout.trim(),
          stderr: stderr.trim() || undefined,
        };
      } catch (err) {
        const e = err as { stderr?: string; message?: string };
        return { error: e.stderr || e.message || "AppleScript failed" };
      }
    },
  },
  {
    name: "mcp_app_launch",
    description: "Launch a macOS application by name.",
    inputSchema: {
      type: "object",
      properties: {
        appName: {
          type: "string",
          description:
            "Application name (e.g., 'Safari', 'Keynote', 'Terminal')",
        },
      },
      required: ["appName"],
    },
    handler: async (args: Record<string, unknown>) => {
      const appName = args.appName as string;
      try {
        const { stdout } = await execFileAsync(
          "/usr/bin/open",
          ["-a", appName],
          { timeout: TIMEOUT },
        );
        return {
          success: true,
          app: appName,
          output: stdout.trim() || undefined,
        };
      } catch (err) {
        return {
          error:
            err instanceof Error ? err.message : `Failed to launch ${appName}`,
        };
      }
    },
  },
];
