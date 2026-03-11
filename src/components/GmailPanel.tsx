"use client";

import { useState } from "react";
import { useFetch } from "@/lib/hooks";
import { Mail, Search, Mic, ArrowRight, RefreshCw } from "lucide-react";

interface GmailItem {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isTranscription: boolean;
}

export function GmailPanel({
  onProcessTranscription,
}: {
  onProcessTranscription?: (emailId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const {
    data: messages,
    loading,
    error,
    refetch,
  } = useFetch<GmailItem[]>(
    `/api/gmail${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`,
    [searchQuery],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(query);
  };

  if (loading)
    return <div className="p-6 text-neutral-500">Loading inbox...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail size={20} /> Gmail Inbox
        </h2>
        <button
          onClick={refetch}
          className="p-2 rounded hover:bg-neutral-800 text-neutral-400"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-9 pr-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
          >
            Search
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {messages?.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-lg border transition-colors ${
              msg.isTranscription
                ? "bg-purple-900/20 border-purple-700/50"
                : "bg-neutral-800 border-neutral-700"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm text-white truncate">
                    {msg.subject || "(no subject)"}
                  </h3>
                  {msg.isTranscription && (
                    <span className="shrink-0 px-2 py-0.5 text-[10px] bg-purple-600 rounded-full text-white">
                      <Mic size={10} className="inline mr-1" />
                      Transcription
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">{msg.from}</p>
                <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                  {msg.snippet}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-neutral-500">{msg.date}</span>
                {msg.isTranscription && onProcessTranscription && (
                  <button
                    onClick={() => onProcessTranscription(msg.id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-600 hover:bg-purple-700 rounded text-white"
                  >
                    Extract <ArrowRight size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {messages?.length === 0 && (
          <p className="text-neutral-500 text-sm py-4 text-center">
            No messages found
          </p>
        )}
      </div>
    </div>
  );
}
