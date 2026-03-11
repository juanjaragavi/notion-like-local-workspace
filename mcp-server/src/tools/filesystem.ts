import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { MCPTool } from "../types";

const HOME = os.homedir();
const ALLOWED_ROOTS = [
  HOME,
  path.join(HOME, "Documents"),
  path.join(HOME, "Desktop"),
  path.join(HOME, "Downloads"),
  path.join(HOME, "GitHub"),
];

function isAllowed(p: string): boolean {
  const resolved = path.resolve(p);
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
}

function resolve(p: string): string {
  return p.startsWith("~/") ? path.resolve(HOME, p.slice(2)) : path.resolve(p);
}

export const filesystemTools: MCPTool[] = [
  {
    name: "mcp_fs_list",
    description:
      "List directory contents with file metadata (name, type, size, modified).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (supports ~)" },
      },
      required: ["path"],
    },
    handler: async (args: Record<string, unknown>) => {
      const dirPath = resolve(args.path as string);
      if (!isAllowed(dirPath)) return { error: "Access denied" };
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const items = await Promise.all(
          entries
            .filter((e) => !e.name.startsWith("."))
            .slice(0, 200)
            .map(async (entry) => {
              const full = path.join(dirPath, entry.name);
              try {
                const stat = await fs.stat(full);
                return {
                  name: entry.name,
                  type: entry.isDirectory() ? "directory" : "file",
                  size: stat.size,
                  modified: stat.mtime.toISOString(),
                };
              } catch {
                return {
                  name: entry.name,
                  type: "unknown",
                  size: 0,
                  modified: null,
                };
              }
            }),
        );
        return { path: dirPath, entries: items, count: items.length };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "List failed" };
      }
    },
  },
  {
    name: "mcp_fs_read",
    description: "Read a text file's contents (up to 100KB).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
    handler: async (args: Record<string, unknown>) => {
      const filePath = resolve(args.path as string);
      if (!isAllowed(filePath)) return { error: "Access denied" };
      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) return { error: "Target is a directory" };
        if (stat.size > 10 * 1024 * 1024)
          return { error: "File too large (>10MB)" };
        const content = await fs.readFile(filePath, "utf-8");
        return {
          path: filePath,
          size: stat.size,
          content: content.slice(0, 100000),
          truncated: content.length > 100000,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Read failed" };
      }
    },
  },
  {
    name: "mcp_fs_write",
    description:
      "Write content to a file. Creates parent directories as needed. Requires overwrite=true for existing files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "File contents" },
        overwrite: {
          type: "boolean",
          description: "Allow overwriting (default: false)",
        },
      },
      required: ["path", "content"],
    },
    handler: async (args: Record<string, unknown>) => {
      const filePath = resolve(args.path as string);
      if (!isAllowed(filePath)) return { error: "Access denied" };
      const overwrite = args.overwrite === true;
      try {
        try {
          await fs.access(filePath);
          if (!overwrite) {
            return {
              error: "File exists. Set overwrite=true to replace.",
              requiresConfirmation: true,
            };
          }
        } catch {
          /* doesn't exist — good */
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, args.content as string, "utf-8");
        const stat = await fs.stat(filePath);
        return { success: true, path: filePath, size: stat.size };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Write failed" };
      }
    },
  },
  {
    name: "mcp_fs_mkdir",
    description: "Create a directory (including parent directories).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to create" },
      },
      required: ["path"],
    },
    handler: async (args: Record<string, unknown>) => {
      const dirPath = resolve(args.path as string);
      if (!isAllowed(dirPath)) return { error: "Access denied" };
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true, path: dirPath };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "mkdir failed" };
      }
    },
  },
  {
    name: "mcp_fs_move",
    description: "Move or rename a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
      },
      required: ["source", "destination"],
    },
    handler: async (args: Record<string, unknown>) => {
      const src = resolve(args.source as string);
      const dst = resolve(args.destination as string);
      if (!isAllowed(src) || !isAllowed(dst)) return { error: "Access denied" };
      try {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.rename(src, dst);
        return { success: true, from: src, to: dst };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Move failed" };
      }
    },
  },
  {
    name: "mcp_fs_delete",
    description: "Delete a file or empty directory. Requires confirmed=true.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to delete" },
        confirmed: { type: "boolean", description: "Must be true to proceed" },
      },
      required: ["path", "confirmed"],
    },
    handler: async (args: Record<string, unknown>) => {
      const targetPath = resolve(args.path as string);
      if (!isAllowed(targetPath)) return { error: "Access denied" };
      if (args.confirmed !== true) {
        return {
          error: "Deletion requires confirmed=true",
          requiresConfirmation: true,
        };
      }
      try {
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          await fs.rmdir(targetPath);
        } else {
          await fs.unlink(targetPath);
        }
        return { success: true, deleted: targetPath };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Delete failed" };
      }
    },
  },
  {
    name: "mcp_fs_stat",
    description:
      "Get file or directory metadata (size, type, permissions, dates).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to stat" },
      },
      required: ["path"],
    },
    handler: async (args: Record<string, unknown>) => {
      const targetPath = resolve(args.path as string);
      if (!isAllowed(targetPath)) return { error: "Access denied" };
      try {
        const stat = await fs.stat(targetPath);
        return {
          path: targetPath,
          type: stat.isDirectory() ? "directory" : "file",
          size: stat.size,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          mode: stat.mode.toString(8),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Stat failed" };
      }
    },
  },
];
