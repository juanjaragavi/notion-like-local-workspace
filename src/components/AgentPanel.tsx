"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  History,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { logger } from "@/lib/logger";

import { GlobalWorkspaceSearch } from "@/components/GlobalWorkspaceSearch";
import {
  AgentStreamingIndicator,
  type StreamingStep,
} from "@/components/AgentStreamingIndicator";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; success: boolean }>;
}

interface StreamEvent {
  type: string;
  data: {
    phase?: string;
    message?: string;
    tool?: string;
    args?: Record<string, unknown>;
    success?: boolean;
    round?: number;
    maxRounds?: number;
    sessionId?: string;
    content?: string;
    toolCalls?: Array<{
      name: string;
      args: Record<string, unknown>;
      success: boolean;
    }>;
    error?: string;
  };
}

export function AgentPanel({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState<StreamingStep[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Keep ref in sync for use in event listeners
  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (sessionId) {
      try {
        sessionStorage.setItem("agent-active-session", sessionId);
      } catch {
        // sessionStorage unavailable
      }
    }
  }, [sessionId]);

  // Auto-restore last active session on mount
  useEffect(() => {
    const stored = (() => {
      try {
        return sessionStorage.getItem("agent-active-session");
      } catch {
        // sessionStorage unavailable
        return null;
      }
    })();
    if (stored) {
      (async () => {
        setLoadingSession(true);
        try {
          const res = await fetch(
            `/api/agent/sessions/${encodeURIComponent(stored)}/messages`,
          );
          if (!res.ok) throw new Error("Failed to load session");
          const data = await res.json();
          const loaded: ChatMessage[] = (data.messages || []).map(
            (m: { role: string; content: string; timestamp: string }) => ({
              role: m.role as "user" | "agent",
              content: m.content,
              timestamp: m.timestamp,
            }),
          );
          if (loaded.length > 0) {
            setMessages(loaded);
            setSessionId(stored);
          }
        } catch (err) {
          // Session no longer valid — start fresh
          logger.warn("[AgentPanel] Could not restore session", err);
          try {
            sessionStorage.removeItem("agent-active-session");
          } catch {
            // sessionStorage unavailable
          }
        } finally {
          setLoadingSession(false);
        }
      })();
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingSteps, scrollToBottom]);

  const loadSession = useCallback(
    async (targetSessionId: string) => {
      if (targetSessionId === sessionId) return;
      setLoadingSession(true);
      try {
        const res = await fetch(
          `/api/agent/sessions/${encodeURIComponent(targetSessionId)}/messages`,
        );
        if (!res.ok) throw new Error("Failed to load session");
        const data = await res.json();
        const loaded: ChatMessage[] = (data.messages || []).map(
          (m: { role: string; content: string; timestamp: string }) => ({
            role: m.role as "user" | "agent",
            content: m.content,
            timestamp: m.timestamp,
          }),
        );
        setMessages(loaded);
        setSessionId(targetSessionId);
        setStreamingSteps([]);
        setHistoryOpen(false);
      } catch {
        // silently fail — user can retry
      } finally {
        setLoadingSession(false);
      }
    },
    [sessionId],
  );

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setStreamingSteps([]);
    setHistoryOpen(false);
    try {
      sessionStorage.removeItem("agent-active-session");
    } catch {
      // sessionStorage unavailable
    }
    inputRef.current?.focus();
  }, []);

  const processSSEStream = async (
    response: Response,
  ): Promise<{
    message: string;
    sessionId?: string;
    toolCalls?: Array<{ name: string; success: boolean }>;
  }> => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalMessage = "";
    let finalSessionId: string | undefined;
    let finalToolCalls: Array<{ name: string; success: boolean }> = [];
    let stepCounter = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          const stepId = `step-${++stepCounter}`;

          switch (event.type) {
            case "status":
              setStreamingSteps((prev) => [
                ...prev,
                {
                  id: stepId,
                  type: "status",
                  message: event.data.message || "Processing...",
                  timestamp: Date.now(),
                },
              ]);
              break;

            case "thinking":
              setStreamingSteps((prev) => [
                ...prev,
                {
                  id: stepId,
                  type: "thinking",
                  message: event.data.message || "Thinking...",
                  timestamp: Date.now(),
                },
              ]);
              break;

            case "tool_start":
              setStreamingSteps((prev) => [
                ...prev,
                {
                  id: stepId,
                  type: "tool_start",
                  message: event.data.message || `Running ${event.data.tool}`,
                  tool: event.data.tool,
                  timestamp: Date.now(),
                },
              ]);
              break;

            case "tool_complete":
              setStreamingSteps((prev) => [
                ...prev,
                {
                  id: stepId,
                  type: "tool_complete",
                  message: event.data.message || "Completed",
                  tool: event.data.tool,
                  success: event.data.success,
                  timestamp: Date.now(),
                },
              ]);
              break;

            case "done":
              finalMessage = event.data.content || "";
              finalSessionId = event.data.sessionId;
              finalToolCalls =
                event.data.toolCalls?.map((tc) => ({
                  name: tc.name,
                  success: tc.success,
                })) || [];
              break;

            case "error":
              finalMessage = `Error: ${event.data.error || "Something went wrong"}`;
              break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      message: finalMessage || "Done.",
      sessionId: finalSessionId,
      toolCalls: finalToolCalls,
    };
  };

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
    setStreamingSteps([]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const history = messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message: text, history, sessionId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMsg: ChatMessage = {
          role: "agent",
          content: `Error: ${data.error || "Something went wrong"}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        // SSE streaming path
        const result = await processSSEStream(res);

        if (result.sessionId) setSessionId(result.sessionId);

        const agentMsg: ChatMessage = {
          role: "agent",
          content: result.message,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        // Fallback JSON path
        const data = await res.json();
        if (data.sessionId) setSessionId(data.sessionId);

        const agentMsg: ChatMessage = {
          role: "agent",
          content: data.message || "Done.",
          timestamp: new Date().toISOString(),
          toolCalls: data.toolCalls,
        };
        setMessages((prev) => [...prev, agentMsg]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorMsg: ChatMessage = {
        role: "agent",
        content: "Failed to connect to the agent. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setStreamingSteps([]);
      abortRef.current = null;
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
      : historyOpen
        ? "fixed bottom-6 right-6 z-50 w-[700px] h-[600px]"
        : "fixed bottom-6 right-6 z-50 w-[420px] h-[600px]";

  return (
    <div
      className={`${panelClasses} flex flex-row ${embedded ? "" : "bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl"} overflow-hidden`}
    >
      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0 relative">
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={`p-1.5 rounded hover:bg-neutral-700 transition-colors ${historyOpen ? "text-blue-400 bg-neutral-700" : "text-neutral-400 hover:text-white"}`}
              title="Chat History"
            >
              <History size={14} />
            </button>
            {!embedded && (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="border-b border-neutral-700 bg-neutral-900/80 px-4 py-3">
          <GlobalWorkspaceSearch
            contextSource="agent"
            placeholder="Search Gmail, Calendar, and Drive inside chat"
          />
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
                {msg.role === "agent" ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-neutral-900 wrap-break-word">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap wrap-break-word">
                    {msg.content}
                  </div>
                )}
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
            <AgentStreamingIndicator
              steps={streamingSteps}
              isActive={loading}
            />
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
              disabled={loading || loadingSession}
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
      {/* end main chat column */}

      {/* Chat History Sidebar */}
      {historyOpen && (
        <ChatHistoryPanel
          open={historyOpen}
          onToggle={() => setHistoryOpen(false)}
          activeSessionId={sessionId}
          onSelectSession={loadSession}
          onNewChat={startNewChat}
        />
      )}
    </div>
  );
}
