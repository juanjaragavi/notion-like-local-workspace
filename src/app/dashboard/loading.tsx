import { DashboardShell } from "@/components/dashboard/DashboardShell";

function DashboardCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 ${className}`}
    >
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-neutral-800" />
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-neutral-800" />
            <div className="h-3 w-20 rounded bg-neutral-900" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-neutral-900" />
          <div className="h-3 w-5/6 rounded bg-neutral-900" />
          <div className="h-3 w-2/3 rounded bg-neutral-900" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <DashboardShell user={{}}>
      <div className="mx-auto w-full max-w-7xl px-6 py-5 space-y-5">
        {/* KPI row skeleton */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DashboardCardSkeleton className="min-h-35" />
          <DashboardCardSkeleton className="min-h-35" />
        </div>
        {/* Live feed row skeleton */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DashboardCardSkeleton className="min-h-60" />
          <DashboardCardSkeleton className="min-h-60" />
        </div>
        {/* Masonry module widgets skeleton */}
        <div className="columns-1 gap-4 md:columns-2 lg:columns-3 *:mb-4 *:break-inside-avoid">
          <DashboardCardSkeleton className="min-h-44" />
          <DashboardCardSkeleton className="min-h-56" />
          <DashboardCardSkeleton className="min-h-36" />
          <DashboardCardSkeleton className="min-h-44" />
          <DashboardCardSkeleton className="min-h-36" />
        </div>
      </div>
    </DashboardShell>
  );
}
