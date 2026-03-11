"use client";

import { Mail, Chrome, Apple } from "lucide-react";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, redirect: false }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
    } else {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Workspace</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Your personal productivity workspace
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <button
            onClick={() =>
              signIn("google", {
                callbackUrl: "/dashboard",
                prompt: "consent",
                access_type: "offline",
                include_granted_scopes: "true",
              })
            }
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg text-sm font-medium transition-colors"
          >
            <Chrome size={18} />
            Continue with Google
          </button>
          <button
            onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors border border-neutral-700"
          >
            <Apple size={18} />
            Continue with Apple
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-neutral-800" />
          <span className="text-xs text-neutral-500">or</span>
          <div className="flex-1 h-px bg-neutral-800" />
        </div>

        <form onSubmit={handleCredentials} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Mail size={16} />
            {mode === "login" ? "Sign in with Email" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-500 mt-4">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button
                onClick={() => setMode("register")}
                className="text-blue-400 hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-blue-400 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
