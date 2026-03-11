"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  ChevronRight,
  MessageSquare,
  Plus,
  Loader2,
  X,
} from "lucide-react";

interface ChatSession {
  id: string;
  title: string | null;
  status: string;
  message_count: string;
  created_at: string;
  updated_at: string;
}

interface ChatHistoryPanelProps {
  open: boolean;
  onToggle: () => void;
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function ChatHistoryPanel({
  open,
  onToggle,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatHistoryPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/sessions?limit=50");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      setError("Could not load chat history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchSessions();
    }
  }, [open, fetchSessions]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const groupSessionsByDate = (sessions: ChatSession[]) => {
    const groups: { label: string; items: ChatSession[] }[] = [];
    const now = new Date();

    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const thisWeek: ChatSession[] = [];
    const older: ChatSession[] = [];

    for (const s of sessions) {
      const date = new Date(s.created_at);
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 0) today.push(s);
      else if (diffDays === 1) yesterday.push(s);
      else if (diffDays < 7) thisWeek.push(s);
      else older.push(s);
    }

    if (today.length) groups.push({ label: "Today", items: today });
    if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
    if (thisWeek.length) groups.push({ label: "This Week", items: thisWeek });
    if (older.length) groups.push({ label: "Older", items: older });

    return groups;
  };

  // Collapsed tab button
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-1.5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 border-r-0 rounded-l-lg transition-colors text-neutral-400 hover:text-white"
        title="Chat History"
      >
        <History size={16} />
      </button>
    );
  }

  const groups = groupSessionsByDate(sessions);

  return (
    <div className="w-72 shrink-0 bg-neutral-900 border-l border-neutral-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-700 bg-neutral-800/60">
        <div className="flex items-center gap-2">
          <History size={14} className="text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
            Chat History
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onNewChat();
            }}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            title="New Chat"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-neutral-500" />
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-xs text-red-400 text-center">
            {error}
            <button
              onClick={fetchSessions}
              className="block mx-auto mt-2 text-blue-400 hover:text-blue-300"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <MessageSquare size={24} className="mb-2 text-neutral-600" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}

        {!loading &&
          !error &&
          groups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              {group.items.map((s) => {
                const isActive = s.id === activeSessionId;
                const msgCount = parseInt(s.message_count || "0");
                const title = s.title || `Chat ${formatDate(s.created_at)}`;

                return (
                  <button
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors border-b border-neutral-800/50 ${
                      isActive
                        ? "bg-blue-600/15 border-l-2 border-l-blue-500"
                        : "hover:bg-neutral-800/60"
                    }`}
                  >
                    <MessageSquare
                      size={14}
                      className={`mt-0.5 shrink-0 ${isActive ? "text-blue-400" : "text-neutral-500"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-medium truncate ${
                          isActive ? "text-blue-300" : "text-neutral-300"
                        }`}
                      >
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-neutral-500">
                          {formatDate(s.created_at)}
                        </span>
                        {msgCount > 0 && (
                          <span className="text-[10px] text-neutral-600">
                            {msgCount} msg{msgCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={12}
                      className={`mt-1 shrink-0 ${isActive ? "text-blue-400" : "text-neutral-600"}`}
                    />
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
