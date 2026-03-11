"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Search,
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";

export interface StreamingStep {
  id: string;
  type: "status" | "thinking" | "tool_start" | "tool_complete";
  message: string;
  tool?: string;
  success?: boolean;
  timestamp: number;
}

interface AgentStreamingIndicatorProps {
  steps: StreamingStep[];
  isActive: boolean;
}

function StepIcon({ step }: { step: StreamingStep }) {
  switch (step.type) {
    case "status":
      return <Search size={12} className="text-blue-400" />;
    case "thinking":
      return <Brain size={12} className="text-purple-400" />;
    case "tool_start":
      return <Wrench size={12} className="text-amber-400 animate-pulse" />;
    case "tool_complete":
      return step.success !== false ? (
        <CheckCircle2 size={12} className="text-green-400" />
      ) : (
        <XCircle size={12} className="text-red-400" />
      );
    default:
      return <Loader2 size={12} className="text-neutral-400 animate-spin" />;
  }
}

export function AgentStreamingIndicator({
  steps,
  isActive,
}: AgentStreamingIndicatorProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, [isActive]);

  if (steps.length === 0 && !isActive) return null;

  const currentStep = steps[steps.length - 1];
  const completedTools = steps.filter(
    (s) => s.type === "tool_complete" && s.success !== false,
  );
  const failedTools = steps.filter(
    (s) => s.type === "tool_complete" && s.success === false,
  );
  const activeTools = steps.filter(
    (s) =>
      s.type === "tool_start" &&
      !steps.some(
        (c) =>
          c.type === "tool_complete" &&
          c.tool === s.tool &&
          c.timestamp > s.timestamp,
      ),
  );

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
        <Bot size={14} className="text-white" />
      </div>
      <div className="bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-300 min-w-48 max-w-[85%]">
        {/* Current status line */}
        {isActive && currentStep && (
          <div className="flex items-center gap-2 mb-1">
            {currentStep.type === "tool_start" ? (
              <Loader2
                size={13}
                className="animate-spin text-blue-400 shrink-0"
              />
            ) : currentStep.type === "thinking" ? (
              <Sparkles
                size={13}
                className="text-purple-400 animate-pulse shrink-0"
              />
            ) : (
              <Loader2
                size={13}
                className="animate-spin text-blue-400 shrink-0"
              />
            )}
            <span className="text-neutral-200 text-[13px]">
              {currentStep.message}
              {currentStep.type !== "tool_complete" && dots}
            </span>
          </div>
        )}

        {/* Active tool executions */}
        {activeTools.length > 0 && (
          <div className="space-y-0.5">
            {activeTools.map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-1.5 text-[11px] text-amber-400/80"
              >
                <Wrench size={10} className="animate-pulse shrink-0" />
                <span className="truncate">{step.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Completed steps timeline (collapsed) */}
        {(completedTools.length > 0 || failedTools.length > 0) && (
          <div className="mt-1.5 pt-1.5 border-t border-neutral-700/50">
            <div className="flex flex-wrap gap-1">
              {steps
                .filter((s) => s.type === "tool_complete")
                .map((step) => (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                      step.success !== false
                        ? "bg-green-900/30 text-green-400"
                        : "bg-red-900/30 text-red-400"
                    }`}
                  >
                    <StepIcon step={step} />
                    {step.tool?.replace(/_/g, " ") || step.message}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* No steps yet — initial loading */}
        {steps.length === 0 && isActive && (
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            <span className="text-neutral-400">Connecting{dots}</span>
          </div>
        )}
      </div>
    </div>
  );
}
