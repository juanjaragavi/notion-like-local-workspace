"use client";

import { useState } from "react";
import { useFetch } from "@/lib/hooks";
import { FolderOpen, File, ChevronRight, ArrowLeft, Home } from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  type: string;
  size: number;
  modified: string;
  extension: string | null;
}

interface DirResponse {
  type: string;
  path: string;
  entries?: FileEntry[];
  content?: string;
  size?: number;
  binary?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBrowser() {
  const homePath = "/Users/macbookpro";
  const [currentPath, setCurrentPath] = useState(homePath);
  const [fileContent, setFileContent] = useState<{
    path: string;
    content: string;
  } | null>(null);

  const { data, loading, error } = useFetch<DirResponse>(
    `/api/files?path=${encodeURIComponent(currentPath)}`,
    [currentPath],
  );

  const navigateTo = (path: string) => {
    setFileContent(null);
    setCurrentPath(path);
  };

  const openFile = async (path: string) => {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (json.content) {
      setFileContent({ path, content: json.content });
    }
  };

  const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";

  if (loading)
    return <div className="p-6 text-neutral-500">Loading files...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;

  if (fileContent) {
    return (
      <div className="p-6">
        <button
          onClick={() => setFileContent(null)}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-4"
        >
          <ArrowLeft size={14} /> Back to directory
        </button>
        <h3 className="text-sm font-medium text-neutral-300 mb-2">
          {fileContent.path}
        </h3>
        <pre className="text-xs text-neutral-400 bg-neutral-900 p-4 rounded-lg overflow-auto max-h-[70vh] border border-neutral-700">
          {fileContent.content}
        </pre>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen size={20} /> Files
        </h2>
      </div>

      <div className="flex items-center gap-1 mb-4 text-sm text-neutral-400 overflow-x-auto">
        <button
          onClick={() => navigateTo(homePath)}
          className="hover:text-white shrink-0"
        >
          <Home size={14} />
        </button>
        {currentPath
          .replace(homePath, "")
          .split("/")
          .filter(Boolean)
          .map((segment, i, arr) => {
            const segPath = homePath + "/" + arr.slice(0, i + 1).join("/");
            return (
              <span key={i} className="flex items-center gap-1 shrink-0">
                <ChevronRight size={12} />
                <button
                  onClick={() => navigateTo(segPath)}
                  className="hover:text-white"
                >
                  {segment}
                </button>
              </span>
            );
          })}
      </div>

      {currentPath !== homePath && (
        <button
          onClick={() => navigateTo(parentPath)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 rounded w-full"
        >
          <ArrowLeft size={14} /> ..
        </button>
      )}

      <div className="space-y-0.5 mt-1">
        {data?.entries
          ?.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((entry) => (
            <button
              key={entry.path}
              onClick={() =>
                entry.type === "directory"
                  ? navigateTo(entry.path)
                  : openFile(entry.path)
              }
              className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-800 rounded w-full text-left group"
            >
              {entry.type === "directory" ? (
                <FolderOpen size={16} className="text-blue-400 shrink-0" />
              ) : (
                <File size={16} className="text-neutral-500 shrink-0" />
              )}
              <span className="flex-1 truncate text-neutral-300 group-hover:text-white">
                {entry.name}
              </span>
              <span className="text-xs text-neutral-600 shrink-0">
                {formatSize(entry.size)}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
