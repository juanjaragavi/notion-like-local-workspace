import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const ALLOWED_ROOTS = [
  process.env.HOME || "/Users/macbookpro",
  path.join(process.env.HOME || "/Users/macbookpro", "GitHub"),
  path.join(process.env.HOME || "/Users/macbookpro", "Documents"),
  path.join(process.env.HOME || "/Users/macbookpro", "Desktop"),
  path.join(process.env.HOME || "/Users/macbookpro", "Downloads"),
];

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const gdriveBase = path.join(process.env.HOME || "", "Library/CloudStorage");
  if (resolved.startsWith(gdriveBase)) return true;
  const myDriveBase = path.join(process.env.HOME || "", "My Drive");
  if (resolved.startsWith(myDriveBase)) return true;
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(path.resolve(root)));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dirPath =
    req.nextUrl.searchParams.get("path") ||
    process.env.HOME ||
    "/Users/macbookpro";

  if (!isPathAllowed(dirPath)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const resolved = path.resolve(dirPath);
    const stat = fs.statSync(resolved);

    if (stat.isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      const textExts = [
        ".txt",
        ".md",
        ".json",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".css",
        ".html",
        ".yml",
        ".yaml",
        ".toml",
        ".env",
        ".sh",
        ".py",
        ".rb",
        ".go",
        ".rs",
        ".csv",
        ".xml",
        ".svg",
      ];
      if (textExts.includes(ext)) {
        const content = fs.readFileSync(resolved, "utf-8");
        return NextResponse.json({
          type: "file",
          path: resolved,
          content: content.slice(0, 100000),
          size: stat.size,
        });
      }
      return NextResponse.json({
        type: "file",
        path: resolved,
        size: stat.size,
        binary: true,
      });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const files = entries
      .filter((e) => !e.name.startsWith("."))
      .map((entry) => {
        const fullPath = path.join(resolved, entry.name);
        try {
          const s = fs.statSync(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? "directory" : "file",
            size: s.size,
            modified: s.mtime.toISOString(),
            extension: entry.isDirectory()
              ? null
              : path.extname(entry.name).toLowerCase() || null,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({
      type: "directory",
      path: resolved,
      entries: files,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "File system error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
