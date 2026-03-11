#!/bin/bash
# Workspace - Launch Script
# Starts the application in foreground (default) or daemon mode (--daemon)

cd "$(dirname "$0")"

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found."
  echo "Copy .env.example to .env.local and configure your credentials."
  echo "  cp .env.example .env.local"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# ── Daemon mode: run silently in background ────────────────────────────
if [[ "${1:-}" == "--daemon" ]]; then
  LOG_DIR="/tmp/notion-workspace-logs"
  mkdir -p "$LOG_DIR"

  echo "Starting Workspace in daemon mode..."
  ./workspace-daemon.sh > "$LOG_DIR/launcher.log" 2>&1

  if [ $? -eq 0 ]; then
    echo "✓ Workspace running at http://localhost:3000"
    echo "  Logs: $LOG_DIR/"
    echo "  Stop: ./workspace-stop.sh"
    open "http://localhost:3000"
  else
    echo "✗ Startup failed. Check $LOG_DIR/launcher.log"
    exit 1
  fi
  exit 0
fi

# ── Foreground mode: interactive with cleanup ──────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  ./workspace-stop.sh 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Workspace on http://localhost:3000 ..."
open "http://localhost:3000" &
npm run dev
