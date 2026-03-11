"use client";

import { type ReactNode } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertCircle, CalendarClock, Mail, RefreshCcw } from "lucide-react";

import type {
  CalendarPreviewItem,
  DashboardWidgetBundle,
  GmailPreviewItem,
  PreviewCollection,
  WorkspaceDataError,
} from "@/lib/google-workspace";

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  day: "numeric",
});

const TONE_STYLES = {
  gmail: {
    border: "border-l-sky-400/80",
    chip: "border-sky-500/25 bg-sky-500/10 text-sky-200",
    accent: "text-sky-300",
    soft: "text-sky-200/75",
  },
  calendar: {
    border: "border-l-emerald-400/80",
    chip: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
    accent: "text-emerald-300",
    soft: "text-emerald-200/75",
  },
} as const;

type ToneName = keyof typeof TONE_STYLES;

export function DashboardWidgets({
  initialData,
}: {
  initialData: DashboardWidgetBundle;
}) {
  const [overview, setOverview] = useState(initialData);
  const [polling, setPolling] = useState(false);

  const refreshOverview = useCallback(async () => {
    if (polling) return;
    setPolling(true);
    try {
      const response = await fetch("/api/dashboard/widgets?widget=overview", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to refresh dashboard widgets.");
      }
      const data = (await response.json()) as DashboardWidgetBundle;
      startTransition(() => setOverview(data));
    } catch {
      // Leave previous data in place.
    } finally {
      setPolling(false);
    }
  }, [polling]);

  useEffect(() => {
    const timer = window.setInterval(refreshOverview, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshOverview]);

  return (
    <>
      {/* Tier 1: KPI Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SummaryCard
          className="min-h-35"
          title="Unread Email Count"
          description="Polling every 60 seconds"
          tone="gmail"
          icon={<Mail size={16} className="text-blue-400" />}
          action={
            <button
              onClick={refreshOverview}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
              type="button"
            >
              <RefreshCcw size={12} className={polling ? "animate-spin" : ""} />
              Refresh
            </button>
          }
        >
          <AuthOrErrorState
            authMessage={overview.auth.message}
            error={overview.errors.gmail}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-300/80">
                Inbox
              </p>
              <p className="mt-2 text-5xl font-bold tracking-tight text-white">
                {overview.unreadCount ?? "--"}
              </p>
              <p className="mt-1 text-sm text-neutral-400">unread</p>
            </div>
          </AuthOrErrorState>
        </SummaryCard>

        <SummaryCard
          className="min-h-35"
          title="Today's Events"
          description="Accepted and pending only"
          tone="calendar"
          icon={<CalendarClock size={16} className="text-emerald-400" />}
        >
          <AuthOrErrorState
            authMessage={overview.auth.message}
            error={overview.errors.calendar}
          >
            <div className="flex h-full flex-col justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">
                  Schedule
                </p>
                <p className="mt-2 text-5xl font-bold tracking-tight text-white">
                  {overview.todayEvents.length}
                </p>
                <p className="mt-1 text-sm text-neutral-400">events today</p>
              </div>
              {overview.todayEvents.length > 0 && (
                <div className="space-y-1">
                  {overview.todayEvents.slice(0, 2).map((event) => (
                    <p
                      key={event.id}
                      className="truncate text-xs text-neutral-300"
                    >
                      <span className="text-emerald-300/80">
                        {formatTimeOnly(event.start)}
                      </span>{" "}
                      {event.title}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </AuthOrErrorState>
        </SummaryCard>
      </div>

      {/* Tier 2: Preview Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PreviewWidget
          title="Gmail Inbox Preview"
          description="Recent inbox threads"
          tone="gmail"
          authMessage={overview.auth.message}
          error={overview.errors.gmail}
          endpoint="/api/dashboard/widgets?widget=gmail"
          initialCollection={overview.gmailPreview}
          version={overview.generatedAt}
          renderItem={(item) => <GmailRow item={item} />}
          emptyMessage="No inbox threads matched the current preview window."
        />

        <PreviewWidget
          title="Google Calendar Preview"
          description="Upcoming 7-day horizon"
          tone="calendar"
          authMessage={overview.auth.message}
          error={overview.errors.calendar}
          endpoint="/api/dashboard/widgets?widget=calendar"
          initialCollection={overview.calendarPreview}
          version={overview.generatedAt}
          renderItem={(item) => <CalendarRow item={item} />}
          emptyMessage="No upcoming events in the next seven days."
        />
      </div>
    </>
  );
}

function SummaryCard({
  title,
  description,
  tone,
  icon,
  className,
  action,
  children,
}: {
  title: string;
  description: string;
  tone: ToneName;
  icon: ReactNode;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <article
      className={`rounded-2xl border border-neutral-800 border-l-4 bg-neutral-900/70 p-5 ${toneStyle.border} ${className || ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-sm font-medium text-white">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneStyle.chip}`}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <span>{title}</span>
              <p
                className={`mt-1 text-[11px] uppercase tracking-[0.22em] ${toneStyle.soft}`}
              >
                Overview
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-neutral-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function AuthOrErrorState({
  authMessage,
  error,
  children,
}: {
  authMessage?: string;
  error?: WorkspaceDataError;
  children: ReactNode;
}) {
  if (authMessage) {
    return <ErrorState message={authMessage} />;
  }

  if (error) {
    return <ErrorState message={error.message} kind={error.kind} />;
  }

  return <>{children}</>;
}

function ErrorState({ message, kind }: { message: string; kind?: string }) {
  return (
    <div className="rounded-2xl border border-amber-900/60 bg-amber-950/40 p-4 text-sm text-amber-200">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-amber-100">
            {kind === "quota"
              ? "Google API quota limit reached"
              : "Google Workspace data unavailable"}
          </p>
          <p className="mt-1 text-amber-200/80">{message}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
      {message}
    </div>
  );
}

function GmailRow({ item }: { item: GmailPreviewItem }) {
  return (
    <a
      href={item.url}
      rel="noreferrer"
      target="_blank"
      className="flex min-h-23 cursor-pointer items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 transition-colors hover:border-sky-500/30"
    >
      <div
        className={`mt-1 h-2.5 w-2.5 rounded-full ${item.unread ? "bg-sky-400" : "bg-neutral-700"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">
            {item.sender}
          </p>
          <span
            className="shrink-0 text-[11px] text-neutral-500"
            suppressHydrationWarning
          >
            {relativeTime(item.timestamp)}
          </span>
        </div>
        <p className="truncate text-sm text-neutral-300">{item.subject}</p>
        <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
          {item.snippet || "No preview available."}
        </p>
      </div>
    </a>
  );
}

function CalendarRow({ item }: { item: CalendarPreviewItem }) {
  return (
    <a
      href={item.url || undefined}
      rel={item.url ? "noreferrer" : undefined}
      target={item.url ? "_blank" : undefined}
      className="flex min-h-23 cursor-pointer items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 transition-colors hover:border-emerald-500/30"
    >
      <div className="mt-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
        Cal
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">
            {item.title}
          </p>
          <span
            className="shrink-0 text-[11px] text-neutral-500"
            suppressHydrationWarning
          >
            {relativeTime(item.start)}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          {formatDateRange(item.start, item.end)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{item.attendeeStatus}</p>
      </div>
    </a>
  );
}

function PreviewWidget<T extends { id: string }>({
  title,
  description,
  tone,
  authMessage,
  error,
  endpoint,
  initialCollection,
  version,
  renderItem,
  emptyMessage,
  className,
}: {
  title: string;
  description: string;
  tone: ToneName;
  authMessage?: string;
  error?: WorkspaceDataError;
  endpoint: string;
  initialCollection: PreviewCollection<T>;
  version: string;
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  className?: string;
}) {
  const [collection, setCollection] = useState(initialCollection);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCollection(initialCollection);
    setLoadError(null);
  }, [initialCollection, version]);

  const loadMore = useCallback(async () => {
    if (!collection.nextPageToken || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setLoadError(null);
    try {
      const response = await fetch(
        `${endpoint}&pageToken=${encodeURIComponent(collection.nextPageToken)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as PreviewCollection<T> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Unable to load more items.");
      }

      setCollection((current) => ({
        items: [...current.items, ...data.items],
        nextPageToken: data.nextPageToken,
      }));
    } catch (caughtError) {
      setLoadError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load more items.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [collection.nextPageToken, endpoint, loadingMore]);

  useEffect(() => {
    if (!bottomRef.current || !collection.nextPageToken) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: scrollRef.current, rootMargin: "120px" },
    );

    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [collection.nextPageToken, loadMore]);

  const toneStyle = TONE_STYLES[tone];

  return (
    <article
      className={`rounded-2xl border border-neutral-800 border-l-4 bg-neutral-900/70 p-5 ${toneStyle.border} ${className || ""}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${tone === "gmail" ? "bg-sky-400" : "bg-emerald-400"}`}
            />
            <h3 className="text-sm font-medium text-white">{title}</h3>
          </div>
          <p
            className={`mt-1 text-[11px] uppercase tracking-[0.22em] ${toneStyle.soft}`}
          >
            Live feed
          </p>
        </div>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
      </div>
      <AuthOrErrorState authMessage={authMessage} error={error}>
        {collection.items.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <div ref={scrollRef} className="max-h-80 overflow-y-auto pr-1">
            <div className="space-y-2">
              {collection.items.map((item, index) => (
                <li key={`${item.id}-${index}`} className="list-none">
                  {renderItem(item)}
                </li>
              ))}
            </div>
            {loadingMore ? (
              <div className="mt-2 space-y-2">
                <WidgetRowSkeleton />
                <WidgetRowSkeleton />
              </div>
            ) : null}
            {loadError ? (
              <p className="mt-2 text-xs text-red-400">{loadError}</p>
            ) : null}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </AuthOrErrorState>
    </article>
  );
}

function WidgetRowSkeleton() {
  return (
    <div className="flex min-h-23 animate-pulse items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-neutral-800" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3.5 w-32 rounded bg-neutral-800" />
          <div className="h-3 w-14 rounded bg-neutral-800" />
        </div>
        <div className="h-3.5 w-40 rounded bg-neutral-800" />
        <div className="h-3 w-full rounded bg-neutral-900" />
      </div>
    </div>
  );
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Now";
  }

  const diffMinutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(diffMinutes) < 60) {
    return RELATIVE_TIME.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return RELATIVE_TIME.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return RELATIVE_TIME.format(diffDays, "day");
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime())) {
    return "Time unavailable";
  }

  if (Number.isNaN(endDate.getTime())) {
    return TIME_FORMAT.format(startDate);
  }

  return `${TIME_FORMAT.format(startDate)} - ${TIME_FORMAT.format(endDate)}`;
}

const SHORT_TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatTimeOnly(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "--:--" : SHORT_TIME.format(d);
}
