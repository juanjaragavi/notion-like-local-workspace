import { DashboardShell } from "@/components/dashboard/DashboardShell";

const PLACEHOLDER_LINKS = [
  "xl:col-span-2",
  "xl:col-span-2",
  "xl:col-span-2",
  "xl:col-span-2",
  "xl:col-span-2",
  "xl:col-span-2",
  "xl:col-span-2",
];

function DashboardCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5 ${className}`}
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
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="grid auto-rows-[minmax(132px,auto)] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <DashboardCardSkeleton className="md:col-span-2 xl:col-span-4 xl:row-span-2" />
          <DashboardCardSkeleton className="md:col-span-2 xl:col-span-2 xl:row-span-2" />
          <DashboardCardSkeleton className="xl:col-span-2 xl:row-span-2" />
          <DashboardCardSkeleton className="md:min-h-75 xl:col-span-2 xl:row-span-3" />
          <DashboardCardSkeleton className="md:col-span-2 xl:col-span-3 xl:row-span-4" />
          <DashboardCardSkeleton className="md:col-span-2 xl:col-span-3 xl:row-span-4" />
          {PLACEHOLDER_LINKS.map((span, index) => (
            <DashboardCardSkeleton
              key={index}
              className={`md:min-h-38 ${span}`}
            />
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
