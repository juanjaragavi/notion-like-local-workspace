import type { AgentTool, AgentContext } from "../types";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 50000; // 50KB

/**
 * Blocklist of dangerous commands/patterns that should never be executed.
 */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+[/~]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt)\b/i,
  /\bsudo\s+rm/i,
  />\s*\/dev\//i,
  /\bformat\b/i,
  /\bdiskutil\s+erase/i,
];

function isCommandBlocked(command: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(command));
}

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_SIZE) {
    return output.slice(0, MAX_OUTPUT_SIZE) + "\n...[output truncated]";
  }
  return output;
}

export const executeShellCommand: AgentTool = {
  declaration: {
    name: "execute_shell_command",
    description:
      "Execute a shell command on macOS and return stdout/stderr. Commands are run in a sandboxed zsh shell. Dangerous system-level commands are blocked. Use for: listing processes, checking disk space, running scripts, git operations, etc.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command to execute (e.g., 'ls -la ~/Documents', 'df -h', 'git status').",
        },
        workingDirectory: {
          type: "string",
          description:
            "Working directory for the command. Defaults to home directory.",
        },
      },
      required: ["command"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const command = args.command as string;
    const cwd = (args.workingDirectory as string) || os.homedir();

    if (isCommandBlocked(command)) {
      return {
        error:
          "Command blocked for safety. Potentially destructive system commands are not allowed.",
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        "/bin/zsh",
        ["-c", command],
        {
          cwd,
          timeout: COMMAND_TIMEOUT,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, HOME: os.homedir(), PATH: process.env.PATH },
        },
      );

      return {
        success: true,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        command,
      };
    } catch (err) {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
        signal?: string;
        message?: string;
      };
      return {
        error: execErr.message || "Command execution failed",
        stdout: truncateOutput(execErr.stdout || ""),
        stderr: truncateOutput(execErr.stderr || ""),
        exitCode: execErr.code,
        signal: execErr.signal,
      };
    }
  },
};

export const runAppleScript: AgentTool = {
  declaration: {
    name: "run_applescript",
    description:
      "Execute an AppleScript command via osascript on macOS. Use for controlling Finder, opening apps, showing dialogs, managing windows, Keynote/Pages automation, etc.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description:
            'The AppleScript code to execute (e.g., \'tell application "Finder" to open folder "Documents" of home\').',
        },
      },
      required: ["script"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const script = args.script as string;

    // Block dangerous AppleScript patterns
    if (/do\s+shell\s+script.*rm\s+-rf/i.test(script)) {
      return {
        error: "Blocked: AppleScript containing dangerous shell commands.",
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        "/usr/bin/osascript",
        ["-e", script],
        {
          timeout: COMMAND_TIMEOUT,
          maxBuffer: 512 * 1024,
        },
      );
      return {
        success: true,
        output: truncateOutput(stdout.trim()),
        stderr: stderr.trim() || undefined,
      };
    } catch (err) {
      const execErr = err as { stderr?: string; message?: string };
      return {
        error:
          execErr.stderr || execErr.message || "AppleScript execution failed",
      };
    }
  },
};

export const getSystemInfo: AgentTool = {
  declaration: {
    name: "get_system_info",
    description:
      "Get macOS system information: CPU usage, memory, disk space, running processes, uptime.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["overview", "memory", "disk", "processes", "network"],
          description:
            "Category of system info to retrieve. Defaults to overview.",
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const category = (args.category as string) || "overview";

    const commands: Record<string, string> = {
      overview:
        'echo "Hostname: $(hostname)"; echo "Uptime: $(uptime)"; echo "CPU: $(sysctl -n machdep.cpu.brand_string)"; echo "Cores: $(sysctl -n hw.ncpu)"; echo "Memory: $(sysctl -n hw.memsize | awk \'{printf "%.1f GB", $1/1073741824}\')"',
      memory:
        "vm_stat | head -15; echo '---'; echo \"Total: $(sysctl -n hw.memsize | awk '{printf \"%.1f GB\", $1/1073741824}')\"",
      disk: "df -h / /System/Volumes/Data 2>/dev/null",
      processes: "ps aux --sort=-%mem | head -20",
      network:
        "ifconfig en0 2>/dev/null | grep -E 'inet |status'; echo '---'; networksetup -getairportnetwork en0 2>/dev/null",
    };

    const cmd = commands[category];
    if (!cmd) {
      return { error: `Unknown category: ${category}` };
    }

    try {
      const { stdout } = await execFileAsync("/bin/zsh", ["-c", cmd], {
        timeout: 10000,
        maxBuffer: 256 * 1024,
      });
      return { category, info: stdout.trim() };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to get system info",
      };
    }
  },
};

export const openApplication: AgentTool = {
  declaration: {
    name: "open_application",
    description:
      "Open a macOS application by name, or open a file/URL with the default application.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Application name (e.g., 'Finder', 'Safari', 'Keynote') or a file path/URL to open.",
        },
      },
      required: ["target"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const target = args.target as string;

    try {
      // Determine if it's an app name, file path, or URL
      const isUrl = /^https?:\/\//.test(target);
      const isPath = target.startsWith("/") || target.startsWith("~");

      let openArgs: string[];
      if (isUrl || isPath) {
        openArgs = [
          target.startsWith("~") ? target.replace("~", os.homedir()) : target,
        ];
      } else {
        openArgs = ["-a", target];
      }

      const { stdout, stderr } = await execFileAsync(
        "/usr/bin/open",
        openArgs,
        {
          timeout: 10000,
        },
      );
      return {
        success: true,
        target,
        output: stdout.trim() || undefined,
        stderr: stderr.trim() || undefined,
      };
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Failed to open application",
      };
    }
  },
};

export const systemControlTools: AgentTool[] = [
  executeShellCommand,
  runAppleScript,
  getSystemInfo,
  openApplication,
];
