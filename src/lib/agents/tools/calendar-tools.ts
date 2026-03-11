import type { AgentTool, AgentContext } from "../types";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google";

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

export const createEvent: AgentTool = {
  declaration: {
    name: "create_calendar_event",
    description:
      "Create a new event on the user's Google Calendar. Returns the created event details including its ID and meet link if generated.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Title of the event",
        },
        startDateTime: {
          type: "string",
          description:
            "Start date and time in ISO 8601 format (e.g. 2026-03-11T10:00:00-05:00)",
        },
        endDateTime: {
          type: "string",
          description:
            "End date and time in ISO 8601 format (e.g. 2026-03-11T11:00:00-05:00). If not provided, defaults to 1 hour after start.",
        },
        description: {
          type: "string",
          description: "Description or notes for the event",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "List of attendee email addresses",
        },
        location: {
          type: "string",
          description: "Location of the event",
        },
        timeZone: {
          type: "string",
          description:
            "IANA time zone (e.g. America/Bogota). Defaults to system time zone.",
        },
      },
      required: ["summary", "startDateTime"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const startDateTime = args.startDateTime as string;
    let endDateTime = args.endDateTime as string | undefined;
    if (!endDateTime) {
      const start = new Date(startDateTime);
      endDateTime = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
    }
    const result = await createCalendarEvent(
      ctx.accessToken,
      ctx.refreshToken,
      {
        summary: args.summary as string,
        description: args.description as string | undefined,
        startDateTime,
        endDateTime,
        attendees: args.attendees as string[] | undefined,
        location: args.location as string | undefined,
        timeZone: args.timeZone as string | undefined,
      },
    );
    return {
      id: result.id,
      summary: result.summary,
      start: result.start?.dateTime || result.start?.date,
      end: result.end?.dateTime || result.end?.date,
      meetLink: result.hangoutLink || null,
      htmlLink: result.htmlLink,
      status: "created",
    };
  },
};

export const updateEvent: AgentTool = {
  declaration: {
    name: "update_calendar_event",
    description:
      "Update an existing Google Calendar event. Use get_upcoming_events first to find the event ID.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "The ID of the event to update",
        },
        summary: {
          type: "string",
          description: "New title for the event",
        },
        startDateTime: {
          type: "string",
          description: "New start date/time in ISO 8601 format",
        },
        endDateTime: {
          type: "string",
          description: "New end date/time in ISO 8601 format",
        },
        description: {
          type: "string",
          description: "New description for the event",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Updated list of attendee email addresses",
        },
        location: {
          type: "string",
          description: "New location for the event",
        },
        timeZone: {
          type: "string",
          description: "IANA time zone",
        },
      },
      required: ["eventId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const eventId = args.eventId as string;
    const result = await updateCalendarEvent(
      ctx.accessToken,
      ctx.refreshToken,
      eventId,
      {
        summary: args.summary as string | undefined,
        description: args.description as string | undefined,
        startDateTime: args.startDateTime as string | undefined,
        endDateTime: args.endDateTime as string | undefined,
        attendees: args.attendees as string[] | undefined,
        location: args.location as string | undefined,
        timeZone: args.timeZone as string | undefined,
      },
    );
    return {
      id: result.id,
      summary: result.summary,
      start: result.start?.dateTime || result.start?.date,
      end: result.end?.dateTime || result.end?.date,
      meetLink: result.hangoutLink || null,
      status: "updated",
    };
  },
};

export const deleteEvent: AgentTool = {
  declaration: {
    name: "delete_calendar_event",
    description:
      "Delete a Google Calendar event. Use get_upcoming_events first to find the event ID. This action is irreversible.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "The ID of the event to delete",
        },
      },
      required: ["eventId"],
    },
  },
  handler: async (args: Record<string, unknown>, ctx: AgentContext) => {
    const eventId = args.eventId as string;
    await deleteCalendarEvent(ctx.accessToken, ctx.refreshToken, eventId);
    return { eventId, status: "deleted" };
  },
};

export const calendarTools: AgentTool[] = [
  getUpcomingEvents,
  getTodaySchedule,
  createEvent,
  updateEvent,
  deleteEvent,
];
