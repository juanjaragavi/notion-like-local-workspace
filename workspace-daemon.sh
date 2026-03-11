#!/usr/bin/env bash
# ============================================================================
# Notion Workspace — Daemon Startup (Headless)
# Starts all services as background processes without terminal output.
# Designed to be invoked from the macOS .app launcher or any headless context.
#
# Exit codes:
#   0 — all services started successfully
#   1 — fatal error (check log output)
# ============================================================================
set -euo pipefail

# ── Restore user PATH when launched from macOS .app or launchd ──────────
# When invoked from a .app bundle, PATH is minimal (/usr/bin:/bin).
# Spawn a login shell to resolve the full user PATH without sourcing
# zsh-specific profile scripts directly into bash.
if ! command -v npm &>/dev/null; then
  if USER_PATH=$(zsh -ilc 'echo $PATH' 2>/dev/null); then
    export PATH="$USER_PATH"
  else
    export PATH="$HOME/.npm-global/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="/tmp"
PROXY_PID_FILE="$PID_DIR/notion-workspace-proxy.pid"
NEXT_PID_FILE="$PID_DIR/notion-workspace-next.pid"
PROXY_PORT=5433
NEXT_PORT=3000
MCP_PORT=3100
MCP_CONTAINER="notion-mcp-server"
PROXY_INSTANCE="absolute-brook-452020-d5:us-central1:notion-workspace-db"
LOG_DIR="/tmp/notion-workspace-logs"
SESSION_DIR="$HOME/.notion-workspace"

log() { echo "[$(date +"%Y-%m-%d %H:%M:%S")] $*"; }

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

wait_for_port() {
  local port="$1" timeout="${2:-30}" elapsed=0
  while ! port_in_use "$port"; do
    if (( elapsed >= timeout )); then return 1; fi
    sleep 0.5
    elapsed=$((elapsed + 1))
  done
  return 0
}

# ── Pre-flight ──────────────────────────────────────────────────────────
log "Daemon startup initiated"
mkdir -p "$LOG_DIR" "$SESSION_DIR"

if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
  log "FATAL: .env.local not found — aborting"
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  log "Installing dependencies..."
  (cd "$SCRIPT_DIR" && npm install --prefer-offline --no-audit --no-fund > "$LOG_DIR/npm-install.log" 2>&1)
  log "Dependencies installed"
fi

for port in $PROXY_PORT $NEXT_PORT; do
  if port_in_use "$port"; then
    log "FATAL: Port $port already in use — run workspace-stop.sh first"
    exit 1
  fi
done

# ── Cloud SQL Proxy ─────────────────────────────────────────────────────
if [ -x "$SCRIPT_DIR/cloud-sql-proxy" ]; then
  log "Starting Cloud SQL Proxy on port $PROXY_PORT..."

  nohup "$SCRIPT_DIR/cloud-sql-proxy" "$PROXY_INSTANCE" \
    --port="$PROXY_PORT" \
    --auto-iam-authn \
    > "$LOG_DIR/proxy.log" 2>&1 &
  disown

  echo $! > "$PROXY_PID_FILE"

  if wait_for_port "$PROXY_PORT" 20; then
    log "Cloud SQL Proxy ready (PID $(cat "$PROXY_PID_FILE"), port $PROXY_PORT)"
  else
    log "FATAL: Cloud SQL Proxy failed to bind port $PROXY_PORT"
    cat "$LOG_DIR/proxy.log" 2>/dev/null | tail -5
    exit 1
  fi
else
  log "WARN: cloud-sql-proxy binary not found — skipping"
fi

# ── MCP Server (Docker) ────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  if docker ps -a --format '{{.Names}}' | grep -q "^${MCP_CONTAINER}$"; then
    docker rm -f "$MCP_CONTAINER" > /dev/null 2>&1 || true
  fi

  log "Starting MCP server (Docker) on port $MCP_PORT..."
  (cd "$SCRIPT_DIR" && docker compose up -d --build > "$LOG_DIR/mcp.log" 2>&1) || true

  if wait_for_port "$MCP_PORT" 60; then
    log "MCP server ready (container: $MCP_CONTAINER, port $MCP_PORT)"
  else
    log "WARN: MCP server failed to start — continuing without it"
  fi
else
  log "INFO: Docker not available — skipping MCP server"
fi

# ── Next.js Dev Server ─────────────────────────────────────────────────
log "Starting Next.js dev server on port $NEXT_PORT..."

nohup bash -c "cd '$SCRIPT_DIR' && npm run dev" > "$LOG_DIR/next.log" 2>&1 &
disown

NEXT_PID=$!
echo "$NEXT_PID" > "$NEXT_PID_FILE"

if wait_for_port "$NEXT_PORT" 30; then
  log "Next.js dev server ready (PID $NEXT_PID, port $NEXT_PORT)"
else
  log "FATAL: Next.js failed to start within 30s"
  cat "$LOG_DIR/next.log" 2>/dev/null | tail -10
  exit 1
fi

# ── Done ────────────────────────────────────────────────────────────────
log "All services running — App: http://localhost:$NEXT_PORT | Proxy: 127.0.0.1:$PROXY_PORT | MCP: http://localhost:$MCP_PORT"
exit 0
