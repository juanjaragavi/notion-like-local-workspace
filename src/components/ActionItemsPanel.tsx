"use client";

import { useState } from "react";
import { useFetch } from "@/lib/hooks";
import {
  CheckSquare,
  Circle,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface ActionItemRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  due_date: string | null;
  source_type: string;
  created_at: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Circle size={14} className="text-neutral-400" />,
  in_progress: <Clock size={14} className="text-yellow-400" />,
  completed: <CheckCircle2 size={14} className="text-green-400" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-900/30",
  medium: "text-yellow-400 bg-yellow-900/30",
  low: "text-blue-400 bg-blue-900/30",
};

export function ActionItemsPanel() {
  const {
    data: items,
    loading,
    error,
    refetch,
  } = useFetch<ActionItemRow[]>("/api/action-items");

  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateStatus = async (id: string, status: string) => {
    setUpdateError(null);
    try {
      const res = await fetch("/api/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(
          (data as { error?: string }).error ??
            `Failed to update status (${res.status})`,
        );
        return;
      }
      refetch();
    } catch {
      setUpdateError("Network error — could not update action item");
    }
  };

  if (loading)
    return <div className="p-6 text-neutral-500">Loading action items...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CheckSquare size={20} /> Action Items
      </h2>
      {updateError && (
        <div className="mb-3 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
          {updateError}
        </div>
      )}
      {!items?.length ? (
        <p className="text-neutral-500 text-sm">
          No action items yet. Process a transcription or create one manually.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 bg-neutral-800 rounded-lg border border-neutral-700"
            >
              <button
                onClick={() =>
                  updateStatus(
                    item.id,
                    item.status === "completed"
                      ? "pending"
                      : item.status === "pending"
                        ? "in_progress"
                        : "completed",
                  )
                }
                className="mt-0.5 shrink-0"
              >
                {STATUS_ICONS[item.status] || <Circle size={14} />}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${item.status === "completed" ? "line-through text-neutral-500" : "text-white"}`}
                >
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-neutral-500 mt-1">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[item.priority] || ""}`}
                  >
                    {item.priority}
                  </span>
                  {item.assignee && (
                    <span className="text-[10px] text-neutral-500">
                      @{item.assignee}
                    </span>
                  )}
                  {item.due_date && (
                    <span className="text-[10px] text-neutral-500">
                      {item.due_date}
                    </span>
                  )}
                  {item.source_type === "transcription" && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900/30 text-purple-400">
                      from transcription
                    </span>
                  )}
                </div>
              </div>
              {item.priority === "high" && (
                <AlertTriangle
                  size={14}
                  className="text-red-400 shrink-0 mt-1"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
