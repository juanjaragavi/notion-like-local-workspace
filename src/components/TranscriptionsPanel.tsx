"use client";

import { useState } from "react";
import { useFetch } from "@/lib/hooks";
import { Mic, Users, Calendar, ChevronDown, ChevronRight } from "lucide-react";

interface TranscriptionRow {
  id: string;
  email_id: string;
  meeting_title: string;
  meeting_date: string | null;
  participants: string;
  raw_content: string;
  summary: string | null;
  created_at: string;
}

export function TranscriptionsPanel() {
  const {
    data: transcriptions,
    loading,
    error,
  } = useFetch<TranscriptionRow[]>("/api/transcriptions");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading)
    return (
      <div className="p-6 text-neutral-500">Loading transcriptions...</div>
    );
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Mic size={20} /> Meeting Transcriptions
      </h2>
      {!transcriptions?.length ? (
        <p className="text-neutral-500 text-sm">
          No transcriptions processed yet. Go to Gmail and extract transcription
          emails.
        </p>
      ) : (
        <div className="space-y-3">
          {transcriptions.map((t) => {
            const participants = (() => {
              try {
                return JSON.parse(t.participants);
              } catch {
                return [];
              }
            })();
            const isExpanded = expanded === t.id;
            return (
              <div
                key={t.id}
                className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : t.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-750"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-white truncate">
                      {t.meeting_title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                      {t.meeting_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {t.meeting_date}
                        </span>
                      )}
                      {participants.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {participants.length} participants
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-700">
                    {t.summary && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-neutral-400 uppercase mb-1">
                          Summary
                        </h4>
                        <p className="text-sm text-neutral-300">{t.summary}</p>
                      </div>
                    )}
                    {participants.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-neutral-400 uppercase mb-1">
                          Participants
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {participants.map((p: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-neutral-700 rounded text-xs text-neutral-300"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-neutral-400 uppercase mb-1">
                        Raw Content
                      </h4>
                      <pre className="text-xs text-neutral-400 whitespace-pre-wrap max-h-60 overflow-y-auto bg-neutral-900 p-3 rounded">
                        {t.raw_content.slice(0, 3000)}
                        {t.raw_content.length > 3000 && "..."}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
