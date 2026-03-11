import type { AgentTool, AgentContext } from "../types";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const HOME = os.homedir();

/**
 * Allowed root directories for file operations.
 * Prevents agents from accessing arbitrary paths.
 */
const ALLOWED_ROOTS = [
  HOME,
  path.join(HOME, "Documents"),
  path.join(HOME, "Desktop"),
  path.join(HOME, "Downloads"),
  path.join(HOME, "GitHub"),
  path.join(HOME, "Library", "CloudStorage"),
];

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
}

function sanitizePath(inputPath: string): string {
  // Resolve ~ to home directory
  if (inputPath.startsWith("~/")) {
    return path.resolve(HOME, inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

export const listDirectory: AgentTool = {
  declaration: {
    name: "list_directory",
    description:
      "List contents of a directory on the local file system. Returns file names, types, sizes, and modification dates.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to list. Supports ~ for home directory (e.g., ~/Documents).",
        },
      },
      required: ["path"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const dirPath = sanitizePath(args.path as string);
    if (!isPathAllowed(dirPath)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const results = await Promise.all(
        entries
          .filter((e) => !e.name.startsWith("."))
          .slice(0, 100)
          .map(async (entry) => {
            const fullPath = path.join(dirPath, entry.name);
            try {
              const stat = await fs.stat(fullPath);
              return {
                name: entry.name,
                path: fullPath,
                type: entry.isDirectory() ? "directory" : "file",
                size: stat.size,
                modified: stat.mtime.toISOString(),
                extension: entry.isDirectory()
                  ? null
                  : path.extname(entry.name) || null,
              };
            } catch {
              return {
                name: entry.name,
                path: fullPath,
                type: entry.isDirectory() ? "directory" : "file",
                size: 0,
                modified: null,
                extension: null,
              };
            }
          }),
      );
      return { path: dirPath, entries: results, count: results.length };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to list directory",
      };
    }
  },
};

export const readLocalFile: AgentTool = {
  declaration: {
    name: "read_local_file",
    description:
      "Read the contents of a text file from the local file system. Returns the first 100KB of content.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to the file to read. Supports ~ for home directory.",
        },
      },
      required: ["path"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const filePath = sanitizePath(args.path as string);
    if (!isPathAllowed(filePath)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return { error: "Path is a directory, not a file" };
      }
      if (stat.size > 10 * 1024 * 1024) {
        return { error: "File too large (>10MB)" };
      }
      const content = await fs.readFile(filePath, "utf-8");
      return {
        path: filePath,
        size: stat.size,
        content: content.slice(0, 100000),
        truncated: content.length > 100000,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to read file",
      };
    }
  },
};

export const writeLocalFile: AgentTool = {
  declaration: {
    name: "write_local_file",
    description:
      "Write content to a file on the local file system. Creates the file if it doesn't exist. Creates parent directories as needed.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to write the file to. Supports ~ for home directory.",
        },
        content: {
          type: "string",
          description: "Content to write to the file.",
        },
        overwrite: {
          type: "boolean",
          description:
            "Set to true to overwrite an existing file. Defaults to false for safety.",
        },
      },
      required: ["path", "content"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const filePath = sanitizePath(args.path as string);
    if (!isPathAllowed(filePath)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    const overwrite = args.overwrite === true;

    try {
      // Check if file exists
      try {
        await fs.access(filePath);
        if (!overwrite) {
          return {
            error: `File already exists at ${filePath}. Set overwrite=true to replace it.`,
            requiresConfirmation: true,
          };
        }
      } catch {
        // File doesn't exist — that's fine, we'll create it
      }

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");
      const stat = await fs.stat(filePath);
      return {
        success: true,
        path: filePath,
        size: stat.size,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to write file",
      };
    }
  },
};

export const createDirectory: AgentTool = {
  declaration: {
    name: "create_directory",
    description:
      "Create a directory (and any missing parent directories) on the local file system.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to create. Supports ~ for home directory.",
        },
      },
      required: ["path"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const dirPath = sanitizePath(args.path as string);
    if (!isPathAllowed(dirPath)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true, path: dirPath };
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Failed to create directory",
      };
    }
  },
};

export const moveFile: AgentTool = {
  declaration: {
    name: "move_file",
    description: "Move or rename a file or directory on the local file system.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "Current path of the file/directory.",
        },
        destinationPath: {
          type: "string",
          description: "New path for the file/directory.",
        },
      },
      required: ["sourcePath", "destinationPath"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const src = sanitizePath(args.sourcePath as string);
    const dst = sanitizePath(args.destinationPath as string);
    if (!isPathAllowed(src) || !isPathAllowed(dst)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return { success: true, from: src, to: dst };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to move file",
      };
    }
  },
};

export const deleteFile: AgentTool = {
  declaration: {
    name: "delete_file",
    description:
      "Delete a file or empty directory. This is a DESTRUCTIVE operation. The agent should always confirm with the user before invoking this tool.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path of the file or directory to delete.",
        },
        confirmed: {
          type: "boolean",
          description:
            "Must be set to true to confirm deletion. Without confirmation, the operation is rejected.",
        },
      },
      required: ["path", "confirmed"],
    },
  },
  handler: async (args: Record<string, unknown>, _ctx: AgentContext) => {
    const targetPath = sanitizePath(args.path as string);
    if (!isPathAllowed(targetPath)) {
      return { error: "Access denied: path outside allowed directories" };
    }
    if (args.confirmed !== true) {
      return {
        error:
          "Deletion requires explicit confirmation. Set confirmed=true after verifying with the user.",
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
      return {
        error: err instanceof Error ? err.message : "Failed to delete",
      };
    }
  },
};

export const fileOperationsTools: AgentTool[] = [
  listDirectory,
  readLocalFile,
  writeLocalFile,
  createDirectory,
  moveFile,
  deleteFile,
];
