import type { AgentTool, AgentContext } from "../types";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const listActionItems: AgentTool = {
  declaration: {
    name: "list_action_items",
    description:
      "List action items in the workspace. Can filter by status (pending, in_progress, completed) and/or priority (low, medium, high).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: "Filter by status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Filter by priority",
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    let query = "SELECT * FROM action_items WHERE workspace_id = $1";
    const params: unknown[] = [ctx.workspaceId];
    let idx = 2;

    if (args.status) {
      query += ` AND status = $${idx++}`;
      params.push(args.status);
    }
    if (args.priority) {
      query += ` AND priority = $${idx++}`;
      params.push(args.priority);
    }
    query += " ORDER BY created_at DESC LIMIT 50";

    const res = await db.query(query, params);
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      assignee: r.assignee,
      dueDate: r.due_date,
      sourceType: r.source_type,
      createdAt: r.created_at,
    }));
  },
};

export const createActionItem: AgentTool = {
  declaration: {
    name: "create_action_item",
    description:
      "Create a new action item / task in the workspace. Use this when the user asks to track something, add a to-do, or when extracting tasks from meetings/emails.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the action item",
        },
        description: {
          type: "string",
          description: "Detailed description",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level (default: medium)",
        },
        assignee: {
          type: "string",
          description: "Person responsible",
        },
        dueDate: {
          type: "string",
          description: "Due date in ISO format (YYYY-MM-DD)",
        },
        sourceType: {
          type: "string",
          enum: ["transcription", "manual", "email"],
          description: "Where this action item originated (default: manual)",
        },
        sourceId: {
          type: "string",
          description: "ID of the source (email ID, transcription ID, etc.)",
        },
      },
      required: ["title"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const id = uuidv4();
    await db.query(
      `INSERT INTO action_items (id, title, description, status, priority, assignee, due_date, source_type, source_id, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        args.title as string,
        (args.description as string) || null,
        "pending",
        (args.priority as string) || "medium",
        (args.assignee as string) || null,
        (args.dueDate as string) || null,
        (args.sourceType as string) || "manual",
        (args.sourceId as string) || null,
        ctx.workspaceId,
      ],
    );
    return {
      id,
      title: args.title,
      status: "pending",
      priority: args.priority || "medium",
    };
  },
};

export const updateActionItem: AgentTool = {
  declaration: {
    name: "update_action_item",
    description:
      "Update an existing action item. Can change status, priority, assignee, due date, title, or description.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The action item ID" },
        title: { type: "string", description: "New title" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: "New status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "New priority",
        },
        assignee: { type: "string", description: "New assignee" },
        dueDate: { type: "string", description: "New due date (YYYY-MM-DD)" },
      },
      required: ["id"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const db = getDb();
    const fields: Record<string, string> = {
      title: "title",
      status: "status",
      priority: "priority",
      assignee: "assignee",
      dueDate: "due_date",
      description: "description",
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(fields)) {
      if (args[key] !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(args[key]);
      }
    }
    if (sets.length === 0) return { error: "No fields to update" };

    sets.push("updated_at = NOW()");
    params.push(args.id);
    params.push(ctx.workspaceId);

    await db.query(
      `UPDATE action_items SET ${sets.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`,
      params,
    );
    return { success: true, id: args.id };
  },
};

export const actionItemTools: AgentTool[] = [
  listActionItems,
  createActionItem,
  updateActionItem,
];
