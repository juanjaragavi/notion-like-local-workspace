"use client";

import { useFetch } from "@/lib/hooks";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { Calendar, Video, Users, Clock } from "lucide-react";
import type { CalendarEvent } from "@/types";

function formatEventTime(start: string, end: string) {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    const prefix = isToday(s)
      ? "Today"
      : isTomorrow(s)
        ? "Tomorrow"
        : format(s, "MMM d");
    return `${prefix}, ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`;
  } catch {
    return start;
  }
}

export function CalendarPanel() {
  const {
    data: events,
    loading,
    error,
  } = useFetch<CalendarEvent[]>("/api/calendar");

  if (loading)
    return (
      <div className="p-6 text-neutral-500">Loading calendar events...</div>
    );
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;
  if (!events?.length)
    return <div className="p-6 text-neutral-500">No upcoming events</div>;

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Calendar size={20} /> Calendar Events
      </h2>
      <div className="space-y-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-neutral-800 rounded-lg p-4 border border-neutral-700"
          >
            <h3 className="font-medium text-white">{event.summary}</h3>
            <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400">
              <Clock size={14} />
              <span>{formatEventTime(event.start, event.end)}</span>
            </div>
            {event.meetLink && (
              <div className="flex items-center gap-2 mt-1 text-sm">
                <Video size={14} className="text-green-400" />
                <a
                  href={event.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Join Google Meet
                </a>
              </div>
            )}
            {event.attendees.length > 0 && (
              <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                <Users size={14} />
                <span>
                  {event.attendees.slice(0, 3).join(", ")}
                  {event.attendees.length > 3
                    ? ` +${event.attendees.length - 3}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
