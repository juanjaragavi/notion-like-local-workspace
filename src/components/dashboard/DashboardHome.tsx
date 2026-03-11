import {
  Calendar,
  CheckSquare,
  FileText,
  FolderOpen,
  Mail,
  Mic,
  Sparkles,
} from "lucide-react";

import { DashboardWidgets } from "@/components/dashboard/DashboardWidgets";
import {
  getDashboardWidgetBundle,
  primeDriveMetadataCache,
} from "@/lib/google-workspace";

const QUICK_LINKS = [
  {
    tab: "agent",
    icon: Sparkles,
    label: "AI Agent",
    desc: "Chat with the orchestrator using live Workspace context.",
    accent: {
      chip: "border-amber-500/25 bg-amber-500/10 text-amber-200",
      border: "border-l-amber-400/80",
      hover: "group-hover:text-amber-300",
    },
  },
  {
    tab: "pages",
    icon: FileText,
    label: "Pages",
    desc: "Create and manage structured workspace documents.",
    accent: {
      chip: "border-violet-500/25 bg-violet-500/10 text-violet-200",
      border: "border-l-violet-400/80",
      hover: "group-hover:text-violet-300",
    },
  },
  {
    tab: "actions",
    icon: CheckSquare,
    label: "Action Items",
    desc: "Track extracted tasks and follow-ups.",
    accent: {
      chip: "border-rose-500/25 bg-rose-500/10 text-rose-200",
      border: "border-l-rose-400/80",
      hover: "group-hover:text-rose-300",
    },
  },
  {
    tab: "gmail",
    icon: Mail,
    label: "Gmail",
    desc: "Inspect inbox threads and process transcripts.",
    accent: {
      chip: "border-sky-500/25 bg-sky-500/10 text-sky-200",
      border: "border-l-sky-400/80",
      hover: "group-hover:text-sky-300",
    },
  },
  {
    tab: "calendar",
    icon: Calendar,
    label: "Calendar",
    desc: "Review upcoming events and scheduling context.",
    accent: {
      chip: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
      border: "border-l-emerald-400/80",
      hover: "group-hover:text-emerald-300",
    },
  },
  {
    tab: "transcriptions",
    icon: Mic,
    label: "Transcriptions",
    desc: "Review processed meeting notes and extracted actions.",
    accent: {
      chip: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200",
      border: "border-l-fuchsia-400/80",
      hover: "group-hover:text-fuchsia-300",
    },
  },
  {
    tab: "files",
    icon: FolderOpen,
    label: "Files",
    desc: "Browse local project directories without leaving the workspace.",
    accent: {
      chip: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200",
      border: "border-l-cyan-400/80",
      hover: "group-hover:text-cyan-300",
    },
  },
];

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
  const initialData = await getDashboardWidgetBundle({
    userKey,
    accessToken,
    refreshToken,
    grantedScopes,
  });

  void primeDriveMetadataCache({
    userKey,
    accessToken,
    refreshToken,
  }).catch(() => undefined);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-400">
          Welcome back{user.name ? `, ${String(user.name)}` : ""}
        </p>
      </div>

      <DashboardWidgets initialData={initialData} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.tab}
            href={`/dashboard?tab=${link.tab}`}
            className={`group cursor-pointer overflow-hidden rounded-xl border border-neutral-800 border-l-[3px] bg-neutral-900/65 px-3 py-3 transition-all hover:border-neutral-700 hover:bg-neutral-900 ${link.accent.border}`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${link.accent.chip}`}
              >
                <link.icon size={16} />
              </div>
              <div className="min-w-0">
                <h3
                  className={`text-sm font-medium text-white transition-colors ${link.accent.hover}`}
                >
                  {link.label}
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-neutral-500 xl:hidden">
                  {link.desc}
                </p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
