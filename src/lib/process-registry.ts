/**
 * process-registry.ts
 *
 * Centralized registry for all child processes spawned by the application.
 * Attaches listeners to SIGINT, SIGTERM, and `exit` so that every registered
 * process is terminated before the main Node.js thread exits.
 *
 * Usage:
 *   import { processRegistry } from "@/lib/process-registry";
 *   const child = spawn("some-command");
 *   processRegistry.register(child, "some-command");
 *
 * On host OS termination signals the registry will:
 *   1. Send SIGTERM to every live child.
 *   2. Wait up to KILL_TIMEOUT ms for graceful exit.
 *   3. Escalate to SIGKILL for any stragglers.
 *   4. Exit the main process.
 */

import type { ChildProcess } from "child_process";

interface RegisteredProcess {
  process: ChildProcess;
  label: string;
  registeredAt: number;
}

const KILL_TIMEOUT_MS = 5_000;

class ProcessRegistry {
  private registry = new Map<number, RegisteredProcess>();
  private teardownInProgress = false;
  private signalsBound = false;

  constructor() {
    this.bindSignals();
  }

  /** Register a child process for lifecycle management. */
  register(child: ChildProcess, label: string): void {
    if (child.pid == null) {
      // Process already exited or failed to spawn
      return;
    }

    this.registry.set(child.pid, {
      process: child,
      label,
      registeredAt: Date.now(),
    });

    // Auto-deregister when the child exits on its own
    child.once("exit", () => {
      if (child.pid != null) {
        this.registry.delete(child.pid);
      }
    });
  }

  /** Deregister a child process manually. */
  deregister(pid: number): void {
    this.registry.delete(pid);
  }

  /** Return a snapshot of all currently registered processes. */
  list(): Array<{ pid: number; label: string; registeredAt: number }> {
    return Array.from(this.registry.entries()).map(([pid, entry]) => ({
      pid,
      label: entry.label,
      registeredAt: entry.registeredAt,
    }));
  }

  /** Number of currently registered (live) processes. */
  get size(): number {
    return this.registry.size;
  }

  /**
   * Blocking teardown — terminates every registered child.
   * Returns a promise that resolves once all children have exited.
   */
  async teardown(): Promise<void> {
    if (this.teardownInProgress) return;
    this.teardownInProgress = true;

    const entries = Array.from(this.registry.values());
    if (entries.length === 0) {
      return;
    }

    console.log(
      `[process-registry] Tearing down ${entries.length} child process(es)…`,
    );

    // Phase 1 — SIGTERM
    for (const entry of entries) {
      try {
        if (!entry.process.killed) {
          entry.process.kill("SIGTERM");
          console.log(
            `[process-registry] SIGTERM → ${entry.label} (PID ${entry.process.pid})`,
          );
        }
      } catch {
        // Process may have already exited
      }
    }

    // Phase 2 — wait, then SIGKILL stragglers
    await Promise.allSettled(
      entries.map(
        (entry) =>
          new Promise<void>((resolve) => {
            if (entry.process.killed || entry.process.exitCode !== null) {
              resolve();
              return;
            }

            const timeout = setTimeout(() => {
              try {
                entry.process.kill("SIGKILL");
                console.log(
                  `[process-registry] SIGKILL → ${entry.label} (PID ${entry.process.pid})`,
                );
              } catch {
                // already gone
              }
              resolve();
            }, KILL_TIMEOUT_MS);

            entry.process.once("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
          }),
      ),
    );

    this.registry.clear();
    console.log("[process-registry] All child processes terminated.");
  }

  // ── Signal binding ───────────────────────────────────────────────────

  private bindSignals(): void {
    if (this.signalsBound) return;
    this.signalsBound = true;

    const handleSignal = (signal: string) => {
      console.log(
        `\n[process-registry] Received ${signal} — initiating teardown…`,
      );
      this.teardown().finally(() => {
        process.exit(signal === "SIGTERM" ? 143 : 130);
      });
    };

    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));

    // `exit` fires synchronously — we can only do best-effort sync kills here
    process.on("exit", () => {
      for (const entry of this.registry.values()) {
        try {
          if (!entry.process.killed) {
            entry.process.kill("SIGKILL");
          }
        } catch {
          // swallow
        }
      }
    });
  }
}

/** Singleton — import this from anywhere to register/inspect child processes. */
export const processRegistry = new ProcessRegistry();
