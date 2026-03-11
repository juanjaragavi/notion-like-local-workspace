"use client";

import type { ReactNode } from "react";

import { GlobalWorkspaceSearch } from "@/components/GlobalWorkspaceSearch";
import { Sidebar } from "@/components/Sidebar";

const TAB_COPY: Record<string, { title: string; description: string }> = {
  overview: {
    title: "Dashboard",
    description: "Live workspace signals from Gmail, Calendar, and Drive.",
  },
  agent: {
    title: "AI Agent",
    description:
      "Chat with the workspace agent and search across Google Workspace.",
  },
  pages: {
    title: "Pages",
    description: "Create, browse, and organize knowledge pages.",
  },
  actions: {
    title: "Action Items",
    description:
      "Track tasks and follow-ups extracted from workspace activity.",
  },
  gmail: {
    title: "Gmail",
    description: "Inspect inbox threads and transcription-related messages.",
  },
  calendar: {
    title: "Calendar",
    description: "Review upcoming events and schedule context.",
  },
  transcriptions: {
    title: "Transcriptions",
    description: "Review processed meeting notes and extracted tasks.",
  },
  files: {
    title: "Files",
    description: "Navigate local files alongside Google Workspace context.",
  },
};

export function DashboardShell({
  user,
  currentTab,
  children,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  currentTab?: string;
  children: ReactNode;
}) {
  const copy = TAB_COPY[currentTab || "overview"] || TAB_COPY.overview;

  return (
    <div className="flex h-screen bg-neutral-950 text-white">
      <Sidebar user={user} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-neutral-800 bg-neutral-950 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
                Notion Workspace
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white">
                {copy.title}
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                {copy.description}
              </p>
            </div>
            <div className="w-full max-w-2xl">
              <GlobalWorkspaceSearch
                contextSource="dashboard"
                placeholder="Search Gmail, Calendar, and Drive"
              />
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto will-change-transform">
          {children}
        </div>
      </main>
    </div>
  );
}
