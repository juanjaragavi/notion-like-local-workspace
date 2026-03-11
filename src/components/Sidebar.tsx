"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Mail,
  Calendar,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Mic,
  LogOut,
  Power,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard?tab=agent", icon: Sparkles, label: "AI Agent" },
  { href: "/dashboard?tab=pages", icon: FileText, label: "Pages" },
  { href: "/dashboard?tab=actions", icon: CheckSquare, label: "Action Items" },
  { href: "/dashboard?tab=gmail", icon: Mail, label: "Gmail" },
  { href: "/dashboard?tab=calendar", icon: Calendar, label: "Calendar" },
  { href: "/dashboard?tab=transcriptions", icon: Mic, label: "Transcriptions" },
  { href: "/dashboard?tab=files", icon: FolderOpen, label: "Files" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({
  user,
  isDev = true,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  isDev?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const pathname = usePathname();

  const handleQuit = useCallback(async () => {
    if (shuttingDown) return;
    const confirmed = window.confirm(
      "Quit Workspace?\n\nThis will stop the dev server and Cloud SQL Proxy. The page will become unreachable.",
    );
    if (!confirmed) return;
    setShuttingDown(true);
    try {
      await fetch("/api/workspace/shutdown", { method: "POST" });
    } catch {
      // Expected — server dies before response completes
    }
  }, [shuttingDown]);

  return (
    <aside
      className={`flex flex-col bg-neutral-900 text-neutral-200 border-r border-neutral-800 transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        {!collapsed && (
          <span className="font-semibold text-sm truncate">Workspace</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-neutral-800"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href.includes("?") && pathname === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-neutral-800 text-white"
                  : "hover:bg-neutral-800/50 text-neutral-400"
              }`}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-800 p-3">
        {!collapsed && (
          <Link
            href="/dashboard?tab=pages&new=1"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
          >
            <Plus size={16} />
            New Page
          </Link>
        )}
        <div className="flex items-center gap-2 mt-3 px-1">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={28}
              height={28}
              className="w-7 h-7 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-xs">
              {(user.name || user.email || "?")[0].toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {user.name || "User"}
              </p>
              <p className="text-[10px] text-neutral-500 truncate">
                {user.email}
              </p>
            </div>
          )}
          <button
            onClick={() => {
              window.location.href = "/api/auth/signout";
            }}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
        {isDev && (
          <button
            id="quit-workspace-btn"
            onClick={handleQuit}
            disabled={shuttingDown}
            className={`flex items-center gap-2 w-full mt-2 px-3 py-2 text-xs rounded transition-colors ${
              shuttingDown
                ? "bg-red-900/30 text-red-400 cursor-wait"
                : "bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300"
            }`}
            title="Stop all services and quit"
          >
            <Power size={14} className={shuttingDown ? "animate-pulse" : ""} />
            {!collapsed && (
              <span>{shuttingDown ? "Shutting down…" : "Quit Workspace"}</span>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
