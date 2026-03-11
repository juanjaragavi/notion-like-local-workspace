"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Loader2, Search, Sparkles } from "lucide-react";

import type {
  WorkspaceSearchResponse,
  WorkspaceSearchResult,
} from "@/lib/google-workspace";

type RerankEngine = "webgpu" | "wasm-simd" | "scalar";

export function GlobalWorkspaceSearch({
  placeholder,
  contextSource,
}: {
  placeholder?: string;
  contextSource: "dashboard" | "agent";
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [engine, setEngine] = useState<RerankEngine>("scalar");
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    void detectRerankEngine().then(setEngine);
  }, []);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/workspace-rerank.worker.ts", import.meta.url),
    );
    const worker = workerRef.current;

    worker.onmessage = (
      event: MessageEvent<{
        requestId: number;
        results: WorkspaceSearchResult[];
      }>,
    ) => {
      if (event.data.requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => setResults(event.data.results));
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = deferredQuery.trim();
    if (normalizedQuery.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setError(null);
      setCached(false);
      setIsOpen(Boolean(normalizedQuery));
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setIsOpen(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/agents/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery }),
          signal: controller.signal,
        });
        const data = (await response.json()) as WorkspaceSearchResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Search failed.");
        }

        setCached(Boolean(data.cached));
        if (workerRef.current) {
          requestIdRef.current += 1;
          workerRef.current.postMessage({
            requestId: requestIdRef.current,
            engine,
            query: normalizedQuery,
            results: data.results,
          });
        } else {
          startTransition(() => setResults(data.results));
        }
      } catch (caughtError) {
        if ((caughtError as Error).name === "AbortError") {
          return;
        }

        setResults([]);
        setError(
          caughtError instanceof Error ? caughtError.message : "Search failed.",
        );
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [deferredQuery, engine]);

  const compact = contextSource === "agent";

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/85 px-4 py-3 transition-colors focus-within:border-neutral-600 ${compact ? "shadow-none" : "shadow-[0_10px_35px_rgba(0,0,0,0.25)]"}`}
      >
        <Search size={16} className="shrink-0 text-neutral-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() =>
            setIsOpen(query.trim().length >= 2 || results.length > 0)
          }
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
          placeholder={placeholder || "Search your workspace"}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
        />
        <span className="rounded-full border border-neutral-800 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-neutral-400">
          {engine}
        </span>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-neutral-500" />
        ) : null}
      </div>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            <span>Unified Search</span>
            <span>{cached ? "Cache hit" : "Fresh query"}</span>
          </div>
          {error ? (
            <div className="px-4 py-4 text-sm text-red-400">{error}</div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-6 text-sm text-neutral-500">
              {query.trim().length < 2
                ? "Type at least two characters to search Gmail, Calendar, and Drive."
                : "No matching Gmail threads, calendar events, or Drive files."}
            </div>
          ) : (
            <div className="max-h-[24rem] overflow-y-auto py-2">
              {results.map((result) => (
                <a
                  key={`${result.source}:${result.id}`}
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block cursor-pointer px-4 py-3 transition-colors hover:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-neutral-900 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                          {result.source}
                        </span>
                        <p className="truncate text-sm font-medium text-white">
                          {result.title}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                        {result.snippet || "No snippet available."}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-neutral-500">
                      {formatTimestamp(result.timestamp)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
          <div className="border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} />
              Results are server-aggregated and re-ranked in a background
              worker.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function detectRerankEngine(): Promise<RerankEngine> {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    return "webgpu";
  }

  if (
    typeof WebAssembly !== "undefined" &&
    WebAssembly.validate(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
        0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0xfd,
        0x0f, 0xfd, 0x62, 0x0b,
      ]),
    )
  ) {
    return "wasm-simd";
  }

  return "scalar";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
