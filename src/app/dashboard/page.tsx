"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CalendarPanel } from "@/components/CalendarPanel";
import { GmailPanel } from "@/components/GmailPanel";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { TranscriptionsPanel } from "@/components/TranscriptionsPanel";
import { FileBrowser } from "@/components/FileBrowser";
import { PagesPanel } from "@/components/PagesPanel";
import { AgentPanel } from "@/components/AgentPanel";
import {
  LayoutDashboard,
  Calendar,
  Mail,
  CheckSquare,
  FileText,
  FolderOpen,
  Mic,
  ArrowRight,
  Sparkles,
} from "lucide-react";

function DashboardContent({ user }: { user: Record<string, unknown> }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);
  const [processResult, setProcessResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  const processTranscription = async (emailId: string) => {
    setProcessingEmail(emailId);
    setProcessResult(null);
    try {
      const res = await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json();
      if (res.ok) {
        setProcessResult(data);
      } else {
        setProcessResult({ error: data.error });
      }
    } catch (e) {
      setProcessResult({
        error: e instanceof Error ? e.message : "Processing failed",
      });
    } finally {
      setProcessingEmail(null);
    }
  };

  const renderContent = () => {
    switch (tab) {
      case "agent":
        return <AgentPanel embedded />;
      case "calendar":
        return <CalendarPanel />;
      case "gmail":
        return (
          <div>
            <GmailPanel onProcessTranscription={processTranscription} />
            {processingEmail && (
              <div className="mx-6 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300">
                Processing transcription email...
              </div>
            )}
            {processResult && (
              <div className="mx-6 mt-3 p-4 bg-neutral-800 border border-neutral-700 rounded-lg">
                {(processResult as Record<string, unknown>).error ? (
                  <p className="text-red-400 text-sm">
                    {String((processResult as Record<string, unknown>).error)}
                  </p>
                ) : (
                  <div>
                    <p className="text-green-400 text-sm font-medium mb-2">
                      Transcription processed
                    </p>
                    <p className="text-xs text-neutral-400">
                      Meeting:{" "}
                      {String(
                        (processResult as Record<string, unknown>)
                          .transcription &&
                          (
                            (processResult as Record<string, unknown>)
                              .transcription as Record<string, unknown>
                          ).meetingTitle,
                      )}
                    </p>
                    <p className="text-xs text-neutral-400">
                      Action items extracted:{" "}
                      {Array.isArray(
                        (processResult as Record<string, unknown>).actionItems,
                      )
                        ? (
                            (processResult as Record<string, unknown>)
                              .actionItems as unknown[]
                          ).length
                        : 0}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case "actions":
        return <ActionItemsPanel />;
      case "transcriptions":
        return <TranscriptionsPanel />;
      case "files":
        return <FileBrowser />;
      case "pages":
        return <PagesPanel />;
      default:
        return <DashboardHome user={user} />;
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white">
      <Sidebar
        user={
          user as {
            name?: string | null;
            email?: string | null;
            image?: string | null;
          }
        }
      />
      <main className="flex-1 overflow-y-auto">{renderContent()}</main>
    </div>
  );
}

function DashboardHome({ user }: { user: Record<string, unknown> }) {
  const quickLinks = [
    {
      tab: "agent",
      icon: Sparkles,
      label: "AI Agent",
      desc: "Chat with your AI workspace assistant",
    },
    {
      tab: "pages",
      icon: FileText,
      label: "Pages",
      desc: "Create and manage workspace pages",
    },
    {
      tab: "actions",
      icon: CheckSquare,
      label: "Action Items",
      desc: "Track tasks and follow-ups",
    },
    {
      tab: "gmail",
      icon: Mail,
      label: "Gmail",
      desc: "Browse inbox and detect transcriptions",
    },
    {
      tab: "calendar",
      icon: Calendar,
      label: "Calendar",
      desc: "View upcoming events and meetings",
    },
    {
      tab: "transcriptions",
      icon: Mic,
      label: "Transcriptions",
      desc: "Processed meeting transcriptions",
    },
    {
      tab: "files",
      icon: FolderOpen,
      label: "Files",
      desc: "Browse local project files",
    },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Welcome back{user.name ? `, ${String(user.name)}` : ""}
        </h1>
        <p className="text-neutral-400 mt-1">
          Your personal productivity workspace
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <a
            key={link.tab}
            href={`/dashboard?tab=${link.tab}`}
            className="flex items-start gap-3 p-4 bg-neutral-800/50 border border-neutral-800 rounded-lg hover:border-neutral-700 hover:bg-neutral-800 transition-colors group"
          >
            <link.icon size={20} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-sm text-white group-hover:text-blue-400 transition-colors">
                {link.label}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">{link.desc}</p>
            </div>
            <ArrowRight
              size={14}
              className="text-neutral-600 group-hover:text-neutral-400 mt-1 shrink-0"
            />
          </a>
        ))}
      </div>

      <div className="mt-8 p-4 bg-neutral-900 border border-neutral-800 rounded-lg">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <LayoutDashboard size={16} /> Quick Start
        </h2>
        <ul className="text-xs text-neutral-400 space-y-1">
          <li>
            1. Go to <strong>Gmail</strong> to find and process meeting
            transcription emails
          </li>
          <li>
            2. Check <strong>Action Items</strong> for extracted tasks from
            transcriptions
          </li>
          <li>
            3. Use <strong>Pages</strong> to create notes and organize project
            information
          </li>
          <li>
            4. Browse <strong>Calendar</strong> to see upcoming events and
            meetings
          </li>
          <li>
            5. Open <strong>Files</strong> to navigate your local project
            directories
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user) setUser(s.user);
        else window.location.href = "/login";
        setLoading(false);
      })
      .catch(() => {
        window.location.href = "/login";
        setLoading(false);
      });
  }, []);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-500">
          Loading...
        </div>
      }
    >
      <DashboardContent user={user} />
    </Suspense>
  );
}
