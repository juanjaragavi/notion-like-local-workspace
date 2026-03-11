import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSkillRegistry } from "@/lib/agents/skill-registry";
import type { SkillCategory, SubAgentRole } from "@/lib/agents/types";

/**
 * GET  /api/agent/skills — List all skills, optionally filtered by category/role
 * POST /api/agent/skills — Register a new skill
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as SkillCategory | null;
  const agentRole = searchParams.get("agentRole") as SubAgentRole | null;

  const registry = getSkillRegistry();

  // Seed defaults on first access
  try {
    await registry.seedDefaults();
  } catch {
    // May already exist
  }

  const skills = await registry.listSkills({
    category: category || undefined,
    agentRole: agentRole || undefined,
  });

  return NextResponse.json({ skills, count: skills.length });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    description?: string;
    category?: SkillCategory;
    agentRole?: SubAgentRole;
    steps?: Array<{
      agentRole: string;
      action: string;
      description: string;
      params?: Record<string, unknown>;
    }>;
    config?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.description || !body.category || !body.agentRole) {
    return NextResponse.json(
      { error: "name, description, category, and agentRole are required" },
      { status: 400 },
    );
  }

  const registry = getSkillRegistry();
  try {
    const skill = await registry.registerSkill({
      name: body.name,
      description: body.description,
      category: body.category,
      agentRole: body.agentRole,
      steps: (body.steps || []) as Array<{
        agentRole: SubAgentRole;
        action: string;
        description: string;
        params?: Record<string, unknown>;
      }>,
      config: body.config || {},
    });
    return NextResponse.json(skill, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to register skill";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
