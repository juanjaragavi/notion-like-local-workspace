"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; success: boolean }>;
}

export function AgentPanel({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build history from last 20 messages for context
      const history = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();

      if (res.ok) {
        const agentMsg: ChatMessage = {
          role: "agent",
          content: data.message || "Done.",
          timestamp: new Date().toISOString(),
          toolCalls: data.toolCalls,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const errorMsg: ChatMessage = {
          role: "agent",
          content: `Error: ${data.error || "Something went wrong"}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        role: "agent",
        content: "Failed to connect to the agent. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (minimized && !embedded) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Open AI Assistant"
      >
        <Sparkles size={22} className="text-white" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
            {messages.filter((m) => m.role === "agent").length}
          </span>
        )}
      </button>
    );
  }

  const panelClasses = embedded
    ? "flex flex-col h-full w-full"
    : expanded
      ? "fixed inset-4 z-50"
      : "fixed bottom-6 right-6 z-50 w-[420px] h-[600px]";

  return (
    <div
      className={`${panelClasses} flex flex-col ${embedded ? "" : "bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl"} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <p className="text-[10px] text-neutral-400">Powered by Gemini</p>
          </div>
        </div>
        {!embedded && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              title={expanded ? "Minimize" : "Expand"}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              title="Minimize to icon"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500">
            <Bot size={40} className="mb-3 text-neutral-600" />
            <p className="text-sm font-medium">Workspace Assistant</p>
            <p className="text-xs text-neutral-600 mt-1 text-center max-w-70">
              Ask me about your emails, calendar, tasks, or documents. I can
              also process meeting transcriptions.
            </p>
            <div className="mt-4 space-y-2 w-full max-w-75">
              {[
                "What's on my calendar today?",
                "Show my pending action items",
                "Find transcription emails in my inbox",
                "Create a new page with meeting notes",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-xs bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-colors text-neutral-400 hover:text-neutral-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "agent" && (
              <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-200"
              }`}
            >
              <div className="whitespace-pre-wrap wrap-break-words">
                {msg.content}
              </div>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-700/50">
                  <p className="text-[10px] text-neutral-500 mb-1">
                    Tools used:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {msg.toolCalls.map((tc, j) => (
                      <span
                        key={j}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                          tc.success
                            ? "bg-green-900/30 text-green-400"
                            : "bg-red-900/30 text-red-400"
                        }`}
                      >
                        {tc.name.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 bg-neutral-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-neutral-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-400">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-700 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your workspace..."
            rows={1}
            className="flex-1 resize-none bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors max-h-30"
            style={{ minHeight: "38px" }}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
