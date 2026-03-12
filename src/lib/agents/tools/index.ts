import type { AgentTool, ToolRegistry } from "../types";
import { gmailTools } from "./gmail-tools";
import { calendarTools } from "./calendar-tools";
import { actionItemTools } from "./action-items-tools";
import { pageTools } from "./pages-tools";
import { transcriptionTools } from "./transcription-tools";

/** All available tools across all domains */
export const allTools: AgentTool[] = [
  ...gmailTools,
  ...calendarTools,
  ...actionItemTools,
  ...pageTools,
  ...transcriptionTools,
];

/** Build a name→tool lookup registry */
export function buildToolRegistry(tools: AgentTool[]): ToolRegistry {
  const registry: ToolRegistry = new Map();
  for (const tool of tools) {
    registry.set(
      tool.declaration.name!,
      registry.get(tool.declaration.name!) || tool,
    );
  }
  return registry;
}

/** Get tools filtered by name list */
export function getToolsByNames(names: string[]): AgentTool[] {
  const nameSet = new Set(names);
  return allTools.filter((t) => nameSet.has(t.declaration.name!));
}
