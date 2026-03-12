"use client";

import Image from "next/image";
import { Sidebar } from "@/components/Sidebar";
import { useState, useEffect } from "react";
import { Shield, Key, Globe, Database, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user) setUser(s.user);
        else window.location.href = "/login";
      });
  }, []);

  if (!user)
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-500">
        Loading...
      </div>
    );

  return (
    <div className="flex h-screen bg-neutral-950 text-white">
      <Sidebar
        user={
          user as {
            name?: string | null;
            email?: string | null;
            image?: string | null;
          }
        }
      />
      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <section className="mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Shield size={18} /> Account
          </h2>
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4 space-y-2">
            <div className="flex items-center gap-3">
              {user.image ? (
                <Image
                  src={user.image as string}
                  alt=""
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center text-xl">
                  {((user.name as string) ||
                    (user.email as string) ||
                    "?")[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium">{(user.name as string) || "User"}</p>
                <p className="text-sm text-neutral-400">
                  {user.email as string}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Globe size={18} /> Connected Services
          </h2>
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 divide-y divide-neutral-700">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Google Workspace</p>
                <p className="text-xs text-neutral-500">
                  Gmail, Calendar, Meet transcriptions
                </p>
              </div>
              <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs">
                Connected
              </span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Apple ID</p>
                <p className="text-xs text-neutral-500">Sign in with Apple</p>
              </div>
              <span className="px-2 py-1 bg-neutral-700 text-neutral-400 rounded text-xs">
                Optional
              </span>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Key size={18} /> API Scopes
          </h2>
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
            <ul className="text-xs text-neutral-400 space-y-1 font-mono">
              <li>gmail.readonly</li>
              <li>drive.readonly</li>
              <li>documents.readonly</li>
              <li>calendar.readonly</li>
              <li>openid, email, profile</li>
            </ul>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Database size={18} /> Data Storage
          </h2>
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4 text-sm text-neutral-400">
            <p>
              All data is stored in a{" "}
              <code className="bg-neutral-900 px-1 rounded">
                PostgreSQL (Cloud SQL)
              </code>{" "}
              database.
            </p>
            <p className="mt-1">
              No data is sent to external servers beyond Google API calls.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3 text-red-400">
            <AlertTriangle size={18} /> Danger Zone
          </h2>
          <div className="bg-neutral-800 rounded-lg border border-red-900/50 p-4">
            <button
              onClick={() => {
                window.location.href = "/api/auth/signout";
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
            >
              Sign Out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
