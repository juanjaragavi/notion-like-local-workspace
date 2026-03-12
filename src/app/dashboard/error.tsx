"use client";

import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { logger } from "@/lib/logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[dashboard] Render error", error);
  }, [error]);

  return (
    <DashboardShell user={{}}>
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
          <span className="text-2xl">⚠</span>
        </div>
        <h2 className="text-lg font-semibold text-white">
          Dashboard failed to load
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          A temporary error prevented the dashboard from rendering. This is
          usually caused by a network or database interruption.
        </p>
        <button
          onClick={reset}
          type="button"
          className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </DashboardShell>
  );
}
