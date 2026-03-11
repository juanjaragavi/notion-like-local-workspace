import type { AgentTool, AgentContext } from "../types";
import { listCalendarEvents } from "@/lib/google";

export const getUpcomingEvents: AgentTool = {
  declaration: {
    name: "get_upcoming_events",
    description:
      "List upcoming calendar events. Returns events within the specified time range, including title, start/end times, meet links, and attendees.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        timeMin: {
          type: "string",
          description:
            "Start of time range in ISO 8601 format (defaults to now)",
        },
        timeMax: {
          type: "string",
          description:
            "End of time range in ISO 8601 format (defaults to 7 days from now)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of events to return (default 20)",
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const now = new Date();
    const timeMin = (args.timeMin as string) || now.toISOString();
    const timeMax =
      (args.timeMax as string) ||
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const max = (args.maxResults as number) || 20;

    const events = await listCalendarEvents(
      ctx.accessToken,
      ctx.refreshToken,
      timeMin,
      timeMax,
      max,
    );
    return events.map((e) => ({
      id: e.id,
      summary: e.summary || "No title",
      description: e.description?.slice(0, 500) || null,
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      meetLink: e.hangoutLink || null,
      attendees: (e.attendees || []).map((a) => a.email || "").filter(Boolean),
      organizer: e.organizer?.email || null,
    }));
  },
};

export const getTodaySchedule: AgentTool = {
  declaration: {
    name: "get_today_schedule",
    description:
      "Get all calendar events for today. Returns a structured schedule for the current day.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: async (_args: Record<string, unknown>, ctx: AgentContext) => {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const events = await listCalendarEvents(
      ctx.accessToken,
      ctx.refreshToken,
      startOfDay.toISOString(),
      endOfDay.toISOString(),
      50,
    );
    return {
      date: startOfDay.toISOString().split("T")[0],
      eventCount: events.length,
      events: events.map((e) => ({
        summary: e.summary || "No title",
        start: e.start?.dateTime || e.start?.date || "",
        end: e.end?.dateTime || e.end?.date || "",
        meetLink: e.hangoutLink || null,
        attendeeCount: e.attendees?.length || 0,
      })),
    };
  },
};

export const calendarTools: AgentTool[] = [getUpcomingEvents, getTodaySchedule];
