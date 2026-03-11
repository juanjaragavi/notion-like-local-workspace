import type { Skill, SkillCategory, SubAgentRole, SkillStep } from "./types";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * Default skills derived from the system prompt's operational guidelines.
 * These encode structured multi-step workflows that agents can discover and execute.
 */
const DEFAULT_SKILLS: Omit<Skill, "id" | "createdAt">[] = [
  {
    name: "create-technical-proposal",
    description:
      "Generate a technical proposal document. Opens with value proposition, details technical approach with methodologies/tools/frameworks, quantifies outcomes, includes implementation timeline, deliverables, and success criteria.",
    category: "document",
    agentRole: "document-writer",
    steps: [
      {
        agentRole: "document-writer",
        action: "create_page",
        description: "Create the proposal document with structured sections",
        params: {
          template: "proposal",
          sections: [
            "Executive Summary & Value Proposition",
            "Technical Approach",
            "Implementation Timeline",
            "Deliverables & Success Criteria",
            "Investment & ROI",
          ],
        },
      },
    ],
    config: {
      tone: "professional",
      includeUserCredentials: true,
    },
  },
  {
    name: "create-presentation",
    description:
      "Create a presentation deck with executive-level clarity and technical depth. Clean professional design with data visualization and process flows where applicable.",
    category: "document",
    agentRole: "document-writer",
    steps: [
      {
        agentRole: "document-writer",
        action: "create_page",
        description: "Create presentation outline as a document",
      },
      {
        agentRole: "system-control",
        action: "run_applescript",
        description: "Open Keynote with the presentation content",
      },
    ],
    config: {
      format: "keynote",
      style: "executive-technical",
    },
  },
  {
    name: "draft-professional-email",
    description:
      "Compose a professional email with formal structure for clients/executives. Includes clear subject line, context, action items, and signature with contact information.",
    category: "communication",
    agentRole: "communication",
    steps: [
      {
        agentRole: "communication",
        action: "compose_email",
        description: "Draft email with professional tone and structure",
        params: {
          includeSignature: true,
          tone: "professional",
        },
      },
    ],
    config: {
      toneAdaptation: {
        client: "formal, value-focused",
        technical: "precise, data-driven",
        executive: "concise, strategic",
        internal: "direct, collaborative",
      },
    },
  },
  {
    name: "draft-technical-email",
    description:
      "Compose a technical email for engineering stakeholders. Precise terminology, data-driven, with code references or technical specifications as needed.",
    category: "communication",
    agentRole: "communication",
    steps: [
      {
        agentRole: "communication",
        action: "compose_email",
        description: "Draft email with technical precision",
        params: {
          includeSignature: true,
          tone: "technical",
        },
      },
    ],
    config: { tone: "technical" },
  },
  {
    name: "organize-directory",
    description:
      "Organize files in a directory by creating a structured folder hierarchy and moving files into appropriate locations based on type, date, or project.",
    category: "file-management",
    agentRole: "file-operations",
    steps: [
      {
        agentRole: "file-operations",
        action: "list_directory",
        description: "Scan directory contents to understand current state",
      },
      {
        agentRole: "file-operations",
        action: "create_directory",
        description: "Create organized subdirectory structure",
      },
      {
        agentRole: "file-operations",
        action: "move_file",
        description: "Move files into appropriate subdirectories",
      },
    ],
    config: {
      defaultStructure: ["Documents", "Images", "Archives", "Other"],
    },
  },
  {
    name: "daily-briefing",
    description:
      "Generate a daily briefing combining calendar events, pending action items, and recent important emails into a single summary.",
    category: "workflow",
    agentRole: "calendar-planner",
    steps: [
      {
        agentRole: "calendar-planner",
        action: "get_today_schedule",
        description: "Get today's calendar events",
      },
      {
        agentRole: "task-manager",
        action: "list_action_items",
        description: "Get pending and high priority action items",
      },
      {
        agentRole: "email-analyst",
        action: "search_emails",
        description: "Check for important or unread emails",
      },
    ],
    config: {
      aggregateResults: true,
      format: "briefing",
    },
  },
  {
    name: "process-meeting-transcription",
    description:
      "Find, process, and extract action items from a meeting transcription email. Creates tasks with inferred priorities and assigns them.",
    category: "workflow",
    agentRole: "transcription-processor",
    steps: [
      {
        agentRole: "email-analyst",
        action: "search_emails",
        description: "Find transcription emails in inbox",
      },
      {
        agentRole: "transcription-processor",
        action: "process_transcription_email",
        description: "Extract meeting details, summary, and action items",
      },
      {
        agentRole: "task-manager",
        action: "create_action_item",
        description: "Create action items from extracted data",
      },
    ],
    config: { autoCreateTasks: true },
  },
  {
    name: "save-and-share-document",
    description:
      "Create a document in the workspace, save it to a local directory, and optionally email it to recipients.",
    category: "workflow",
    agentRole: "document-writer",
    steps: [
      {
        agentRole: "document-writer",
        action: "create_page",
        description: "Create the document content in the workspace",
      },
      {
        agentRole: "file-operations",
        action: "write_local_file",
        description: "Save a copy to the local file system",
      },
      {
        agentRole: "communication",
        action: "compose_email",
        description: "Draft an email with the document attached or linked",
      },
    ],
    config: { exportFormat: "text" },
  },
  {
    name: "system-health-check",
    description:
      "Run a system health check: disk space, memory usage, running processes, and network status.",
    category: "system",
    agentRole: "system-control",
    steps: [
      {
        agentRole: "system-control",
        action: "get_system_info",
        description: "Get overview of system resources",
        params: { category: "overview" },
      },
      {
        agentRole: "system-control",
        action: "get_system_info",
        description: "Check disk usage",
        params: { category: "disk" },
      },
      {
        agentRole: "system-control",
        action: "get_system_info",
        description: "Check memory status",
        params: { category: "memory" },
      },
    ],
    config: {},
  },
  {
    name: "schedule-meeting",
    description:
      "Check availability on the calendar, find a free slot, and create a calendar event. Optionally draft an invitation email.",
    category: "calendar",
    agentRole: "calendar-planner",
    steps: [
      {
        agentRole: "calendar-planner",
        action: "get_upcoming_events",
        description: "Check calendar for availability",
      },
      {
        agentRole: "communication",
        action: "compose_email",
        description: "Draft meeting invitation email",
      },
    ],
    config: {
      defaultDuration: 30,
      preferredTimes: ["09:00", "14:00", "16:00"],
    },
  },
];

/**
 * Skill Registry — manages skill discovery, storage, and execution.
 */
export class SkillRegistry {
  /**
   * Seed the database with default skills if they don't already exist.
   */
  async seedDefaults(): Promise<number> {
    const db = getDb();
    let seeded = 0;
    for (const skill of DEFAULT_SKILLS) {
      const existing = await db.query("SELECT id FROM skills WHERE name = $1", [
        skill.name,
      ]);
      if (existing.rows.length === 0) {
        await db.query(
          `INSERT INTO skills (id, name, description, category, agent_role, steps, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            skill.name,
            skill.description,
            skill.category,
            skill.agentRole,
            JSON.stringify(skill.steps),
            JSON.stringify(skill.config),
          ],
        );
        seeded++;
      }
    }
    return seeded;
  }

  /**
   * List all available skills, optionally filtered by category or agent role.
   */
  async listSkills(filters?: {
    category?: SkillCategory;
    agentRole?: SubAgentRole;
  }): Promise<Skill[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }
    if (filters?.agentRole) {
      conditions.push(`agent_role = $${idx++}`);
      params.push(filters.agentRole);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.query(
      `SELECT id, name, description, category, agent_role, steps, config, created_at
       FROM skills ${where} ORDER BY category, name`,
      params,
    );

    return result.rows.map(mapSkillRow);
  }

  /**
   * Get a specific skill by name.
   */
  async getSkill(name: string): Promise<Skill | null> {
    const db = getDb();
    const result = await db.query(
      "SELECT id, name, description, category, agent_role, steps, config, created_at FROM skills WHERE name = $1",
      [name],
    );
    if (result.rows.length === 0) return null;
    return mapSkillRow(result.rows[0]);
  }

  /**
   * Register a new custom skill.
   */
  async registerSkill(skill: Omit<Skill, "id" | "createdAt">): Promise<Skill> {
    const db = getDb();
    const id = uuidv4();
    await db.query(
      `INSERT INTO skills (id, name, description, category, agent_role, steps, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        skill.name,
        skill.description,
        skill.category,
        skill.agentRole,
        JSON.stringify(skill.steps),
        JSON.stringify(skill.config),
      ],
    );
    return {
      id,
      ...skill,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Delete a skill by name.
   */
  async deleteSkill(name: string): Promise<boolean> {
    const db = getDb();
    const result = await db.query("DELETE FROM skills WHERE name = $1", [name]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Build a tool declaration for skill discovery that the orchestrator can invoke.
   */
  buildSkillDiscoveryTool() {
    return {
      declaration: {
        name: "discover_skills",
        description:
          "Search the skill registry for predefined workflows and routines. Returns matching skills with their step definitions. Use this to find existing skills before building a workflow from scratch.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Search query to match against skill names and descriptions.",
            },
            category: {
              type: "string",
              enum: [
                "document",
                "communication",
                "file-management",
                "system",
                "calendar",
                "workflow",
              ],
              description: "Filter by skill category.",
            },
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const skills = await this.listSkills({
          category: args.category as SkillCategory | undefined,
        });
        const query = ((args.query as string) || "").toLowerCase();
        const filtered = query
          ? skills.filter(
              (s) =>
                s.name.includes(query) ||
                s.description.toLowerCase().includes(query),
            )
          : skills;
        return {
          skills: filtered.map((s) => ({
            name: s.name,
            description: s.description,
            category: s.category,
            agentRole: s.agentRole,
            stepCount: s.steps.length,
          })),
          count: filtered.length,
        };
      },
    };
  }
}

function mapSkillRow(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as SkillCategory,
    agentRole: row.agent_role as SubAgentRole,
    steps:
      typeof row.steps === "string"
        ? JSON.parse(row.steps)
        : (row.steps as SkillStep[]),
    config:
      typeof row.config === "string"
        ? JSON.parse(row.config)
        : (row.config as Record<string, unknown>),
    createdAt:
      (row.created_at as Date)?.toISOString?.() ?? (row.created_at as string),
  };
}

/** Singleton registry */
let _registry: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!_registry) {
    _registry = new SkillRegistry();
  }
  return _registry;
}
