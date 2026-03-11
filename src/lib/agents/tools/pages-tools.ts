import type { AgentTool, AgentContext } from "../types";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const listPages: AgentTool = {
  declaration: {
    name: "list_pages",
    description:
      "List pages/documents in the workspace. Can filter to root-level pages or children of a specific parent page.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        parentId: {
          type: "string",
          description:
            "Parent page ID to list children of. Omit for root-level pages.",
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const parentId = args.parentId as string | undefined;
    let query: string;
    let params: unknown[];

    if (parentId) {
      query =
        "SELECT id, title, icon, parent_id, created_at, updated_at FROM pages WHERE workspace_id = $1 AND parent_id = $2 AND archived = false ORDER BY updated_at DESC";
      params = [ctx.workspaceId, parentId];
    } else {
      query =
        "SELECT id, title, icon, parent_id, created_at, updated_at FROM pages WHERE workspace_id = $1 AND parent_id IS NULL AND archived = false ORDER BY updated_at DESC";
      params = [ctx.workspaceId];
    }
    const res = await db.query(query, params);
    return res.rows;
  },
};

export const readPage: AgentTool = {
  declaration: {
    name: "read_page",
    description: "Read the full content of a specific page by its ID.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The page ID to read" },
      },
      required: ["pageId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const res = await db.query(
      "SELECT id, title, content, icon, parent_id, created_at, updated_at FROM pages WHERE id = $1 AND workspace_id = $2 AND archived = false",
      [args.pageId, ctx.workspaceId],
    );
    if (res.rows.length === 0) return { error: "Page not found" };
    const page = res.rows[0] as Record<string, unknown>;
    // Truncate very long content to stay within context limits
    if (typeof page.content === "string" && page.content.length > 10000) {
      page.content = page.content.slice(0, 10000) + "\n...[truncated]";
    }
    return page;
  },
};

export const createPage: AgentTool = {
  declaration: {
    name: "create_page",
    description:
      "Create a new page/document in the workspace. Use this when the user asks to draft a document, create meeting notes, or write content.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Page title" },
        content: {
          type: "string",
          description: "Page body content (plain text or HTML)",
        },
        icon: { type: "string", description: "Emoji icon for the page" },
        parentId: { type: "string", description: "Parent page ID for nesting" },
      },
      required: ["title"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const id = uuidv4();
    await db.query(
      `INSERT INTO pages (id, title, content, icon, parent_id, workspace_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        args.title as string,
        (args.content as string) || "",
        (args.icon as string) || "📄",
        (args.parentId as string) || null,
        ctx.workspaceId,
        ctx.userId,
      ],
    );
    return { id, title: args.title, icon: args.icon || "📄" };
  },
};

export const updatePage: AgentTool = {
  declaration: {
    name: "update_page",
    description: "Update an existing page's title or content.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The page ID to update" },
        title: { type: "string", description: "New title" },
        content: { type: "string", description: "New content" },
      },
      required: ["pageId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (args.title !== undefined) {
      sets.push(`title = $${idx++}`);
      params.push(args.title);
    }
    if (args.content !== undefined) {
      sets.push(`content = $${idx++}`);
      params.push(args.content);
    }
    if (sets.length === 0) return { error: "No fields to update" };

    sets.push("updated_at = NOW()");
    params.push(args.pageId);
    params.push(ctx.workspaceId);

    await db.query(
      `UPDATE pages SET ${sets.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`,
      params,
    );
    return { success: true, pageId: args.pageId };
  },
};

export const pageTools: AgentTool[] = [
  listPages,
  readPage,
  createPage,
  updatePage,
];
