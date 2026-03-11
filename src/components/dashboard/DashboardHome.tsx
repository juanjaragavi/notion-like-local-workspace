import { CheckSquare, FileText, FolderOpen, Mic, Sparkles } from "lucide-react";

import { DashboardWidgets } from "@/components/dashboard/DashboardWidgets";
import {
  getDashboardWidgetBundle,
  primeDriveMetadataCache,
} from "@/lib/google-workspace";
import { getDb } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Server-side data loading for module preview widgets                */
/* ------------------------------------------------------------------ */

interface ModuleSummary {
  pages: {
    total: number;
    recent: { id: string; title: string; updatedAt: string }[];
  };
  actionItems: {
    total: number;
    pending: number;
    overdue: number;
    recent: {
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
    }[];
  };
  transcriptions: {
    total: number;
    recent: { id: string; meetingTitle: string; meetingDate: string | null }[];
  };
}

async function getModuleSummaries(userId: string): Promise<ModuleSummary> {
  const db = getDb();
  const wsRes = await db.query(
    "SELECT id FROM workspaces WHERE owner_id = $1",
    [userId],
  );
  const ws = wsRes.rows[0] as { id: string } | undefined;

  if (!ws) {
    return {
      pages: { total: 0, recent: [] },
      actionItems: { total: 0, pending: 0, overdue: 0, recent: [] },
      transcriptions: { total: 0, recent: [] },
    };
  }

  const [
    pagesCount,
    pagesRecent,
    aiTotal,
    aiPending,
    aiOverdue,
    aiRecent,
    txCount,
    txRecent,
  ] = await Promise.all([
    db.query(
      "SELECT COUNT(*)::int AS cnt FROM pages WHERE workspace_id = $1 AND archived = 0",
      [ws.id],
    ),
    db.query(
      "SELECT id, title, updated_at FROM pages WHERE workspace_id = $1 AND archived = 0 ORDER BY updated_at DESC LIMIT 4",
      [ws.id],
    ),
    db.query(
      "SELECT COUNT(*)::int AS cnt FROM action_items WHERE workspace_id = $1",
      [ws.id],
    ),
    db.query(
      "SELECT COUNT(*)::int AS cnt FROM action_items WHERE workspace_id = $1 AND status = 'pending'",
      [ws.id],
    ),
    db.query(
      "SELECT COUNT(*)::int AS cnt FROM action_items WHERE workspace_id = $1 AND status = 'pending' AND due_date IS NOT NULL AND due_date < $2",
      [ws.id, new Date().toISOString().slice(0, 10)],
    ),
    db.query(
      "SELECT id, title, status, priority, due_date FROM action_items WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 4",
      [ws.id],
    ),
    db.query(
      "SELECT COUNT(*)::int AS cnt FROM transcriptions WHERE workspace_id = $1",
      [ws.id],
    ),
    db.query(
      "SELECT id, meeting_title, meeting_date FROM transcriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 3",
      [ws.id],
    ),
  ]);

  return {
    pages: {
      total: (pagesCount.rows[0] as { cnt: number }).cnt,
      recent: pagesRecent.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        updatedAt: String(r.updated_at),
      })),
    },
    actionItems: {
      total: (aiTotal.rows[0] as { cnt: number }).cnt,
      pending: (aiPending.rows[0] as { cnt: number }).cnt,
      overdue: (aiOverdue.rows[0] as { cnt: number }).cnt,
      recent: aiRecent.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        status: r.status as string,
        priority: r.priority as string,
        dueDate: (r.due_date as string) || null,
      })),
    },
    transcriptions: {
      total: (txCount.rows[0] as { cnt: number }).cnt,
      recent: txRecent.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        meetingTitle: r.meeting_title as string,
        meetingDate: (r.meeting_date as string) || null,
      })),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export async function DashboardHome({
  user,
  userKey,
  accessToken,
  refreshToken,
  grantedScopes,
}: {
  user: { name?: string | null };
  userKey: string;
  accessToken: string;
  refreshToken?: string;
  grantedScopes?: string[];
}) {
  const [initialData, modules] = await Promise.all([
    getDashboardWidgetBundle({
      userKey,
      accessToken,
      refreshToken,
      grantedScopes,
    }),
    getModuleSummaries(userKey),
  ]);

  void primeDriveMetadataCache({
    userKey,
    accessToken,
    refreshToken,
  }).catch(() => undefined);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-5 space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-400">
          Welcome back{user.name ? `, ${String(user.name)}` : ""}
        </p>
      </div>

      {/* Live Google Workspace widgets (Gmail + Calendar KPI + previews) */}
      <DashboardWidgets initialData={initialData} />

      {/* Module preview widgets — masonry grid */}
      <div className="columns-1 gap-4 md:columns-2 lg:columns-3 *:mb-4 *:break-inside-avoid">
        {/* Pages widget */}
        <a
          href="/dashboard?tab=pages"
          className="group block overflow-hidden rounded-2xl border border-neutral-800 border-l-4 border-l-violet-400/80 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10 text-violet-200">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">
                Pages
              </h3>
              <p className="text-[11px] uppercase tracking-[0.22em] text-violet-200/75">
                {modules.pages.total} document
                {modules.pages.total !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {modules.pages.recent.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {modules.pages.recent.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-neutral-950/60 px-3 py-2"
                >
                  <FileText size={12} className="shrink-0 text-violet-400/60" />
                  <span className="truncate text-xs text-neutral-300">
                    {p.title || "Untitled"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-neutral-500">
              No pages yet. Create your first document.
            </p>
          )}
        </a>

        {/* Action Items widget */}
        <a
          href="/dashboard?tab=actions"
          className="group block overflow-hidden rounded-2xl border border-neutral-800 border-l-4 border-l-rose-400/80 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-200">
              <CheckSquare size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-rose-300 transition-colors">
                Action Items
              </h3>
              <p className="text-[11px] uppercase tracking-[0.22em] text-rose-200/75">
                {modules.actionItems.pending} pending
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-xl bg-neutral-950/60 px-3 py-2 text-center">
              <p className="text-2xl font-bold text-white">
                {modules.actionItems.total}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                Total
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-neutral-950/60 px-3 py-2 text-center">
              <p className="text-2xl font-bold text-amber-300">
                {modules.actionItems.pending}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                Pending
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-neutral-950/60 px-3 py-2 text-center">
              <p
                className={`text-2xl font-bold ${modules.actionItems.overdue > 0 ? "text-red-400" : "text-neutral-500"}`}
              >
                {modules.actionItems.overdue}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                Overdue
              </p>
            </div>
          </div>
          {modules.actionItems.recent.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {modules.actionItems.recent.map((ai) => (
                <li
                  key={ai.id}
                  className="flex items-center gap-2 rounded-lg bg-neutral-950/60 px-3 py-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      ai.status === "pending"
                        ? "bg-amber-400"
                        : ai.status === "completed"
                          ? "bg-emerald-400"
                          : "bg-neutral-600"
                    }`}
                  />
                  <span className="truncate text-xs text-neutral-300">
                    {ai.title}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full border border-neutral-700 px-1.5 py-0.5 text-[9px] uppercase text-neutral-500">
                    {ai.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </a>

        {/* AI Agent widget */}
        <a
          href="/dashboard?tab=agent"
          className="group block overflow-hidden rounded-2xl border border-neutral-800 border-l-4 border-l-amber-400/80 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-200">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors">
                AI Agent
              </h3>
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/75">
                Orchestrator
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            Chat with the workspace agent using live context from Gmail,
            Calendar, Drive, and your pages.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200">
            <Sparkles size={10} />
            Start a conversation
          </div>
        </a>

        {/* Transcriptions widget */}
        <a
          href="/dashboard?tab=transcriptions"
          className="group block overflow-hidden rounded-2xl border border-neutral-800 border-l-4 border-l-fuchsia-400/80 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200">
              <Mic size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-fuchsia-300 transition-colors">
                Transcriptions
              </h3>
              <p className="text-[11px] uppercase tracking-[0.22em] text-fuchsia-200/75">
                {modules.transcriptions.total} recording
                {modules.transcriptions.total !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {modules.transcriptions.recent.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {modules.transcriptions.recent.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center gap-2 rounded-lg bg-neutral-950/60 px-3 py-2"
                >
                  <Mic size={12} className="shrink-0 text-fuchsia-400/60" />
                  <span className="truncate text-xs text-neutral-300">
                    {tx.meetingTitle}
                  </span>
                  {tx.meetingDate && (
                    <span className="ml-auto shrink-0 text-[10px] text-neutral-500">
                      {tx.meetingDate}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-neutral-500">
              No transcriptions yet. Process a meeting email to get started.
            </p>
          )}
        </a>

        {/* Files widget */}
        <a
          href="/dashboard?tab=files"
          className="group block overflow-hidden rounded-2xl border border-neutral-800 border-l-4 border-l-cyan-400/80 bg-neutral-900/70 p-5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-200">
              <FolderOpen size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">
                Files
              </h3>
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">
                Local browser
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            Browse local project directories and Google Drive files without
            leaving the workspace.
          </p>
        </a>
      </div>
    </div>
  );
}
