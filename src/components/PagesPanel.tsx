"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { FileText, Plus, Trash2, Save } from "lucide-react";

interface PageRow {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export function PagesPanel() {
  const {
    data: pages,
    loading,
    error,
    refetch,
  } = useFetch<PageRow[]>("/api/pages");
  const [selectedPage, setSelectedPage] = useState<PageRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const createPage = async () => {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled", content: "" }),
    });
    const page = await res.json();
    refetch();
    setSelectedPage({
      ...page,
      content: "",
      icon: "📄",
      parent_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setEditTitle(page.title);
    setEditContent("");
  };

  const selectPage = useCallback(async (page: PageRow) => {
    const res = await fetch(`/api/pages?id=${page.id}`);
    const full = await res.json();
    setSelectedPage(full);
    setEditTitle(full.title);
    setEditContent(full.content);
  }, []);

  const savePage = async () => {
    if (!selectedPage) return;
    setSaving(true);
    await fetch("/api/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedPage.id,
        title: editTitle,
        content: editContent,
      }),
    });
    setSaving(false);
    refetch();
  };

  const deletePage = async (id: string) => {
    await fetch("/api/pages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (selectedPage?.id === id) setSelectedPage(null);
    refetch();
  };

  if (loading)
    return <div className="p-6 text-neutral-500">Loading pages...</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;

  if (selectedPage) {
    return (
      <div className="p-6">
        <button
          onClick={() => setSelectedPage(null)}
          className="text-sm text-blue-400 hover:text-blue-300 mb-4"
        >
          ← Back to pages
        </button>
        <div className="mb-4">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full text-2xl font-bold bg-transparent border-none outline-none text-white placeholder-neutral-600"
            placeholder="Page title..."
          />
        </div>
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full min-h-[60vh] bg-neutral-800 border border-neutral-700 rounded-lg p-4 text-sm text-neutral-300 placeholder-neutral-600 outline-none resize-none focus:border-blue-500"
          placeholder="Start writing..."
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={savePage}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm text-white"
          >
            <Save size={14} /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText size={20} /> Pages
        </h2>
        <button
          onClick={createPage}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
        >
          <Plus size={14} /> New Page
        </button>
      </div>
      {!pages?.length ? (
        <p className="text-neutral-500 text-sm">
          No pages yet. Create your first page to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center gap-3 p-3 bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 cursor-pointer group"
              onClick={() => selectPage(page)}
            >
              <span className="text-lg">{page.icon || "📄"}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">
                  {page.title}
                </h3>
                <p className="text-xs text-neutral-500">
                  Updated {new Date(page.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePage(page.id);
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-700 text-neutral-500 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
