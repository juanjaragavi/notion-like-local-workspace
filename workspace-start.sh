#!/usr/bin/env bash
# ============================================================================
# Notion Workspace — Startup Script
# One-click launcher for Cloud SQL Proxy + Next.js dev server
# ============================================================================
set -euo pipefail

# ── Paths & Constants ───────────────────────────────────────────────────────
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

# ── Colors & Symbols ───────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
RESET='\033[0m'
CHECK="${GREEN}✓${RESET}"
CROSS="${RED}✗${RESET}"
ARROW="${CYAN}▸${RESET}"
SPINNER_CHARS=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# ── Helpers ─────────────────────────────────────────────────────────────────

timestamp() { date +"%H:%M:%S"; }

log_phase() {
  echo ""
  echo -e "${BOLD}${MAGENTA}━━━ $1 ━━━${RESET}"
}

log_step() {
  echo -e "  ${ARROW} ${DIM}$(timestamp)${RESET}  $1"
}

log_ok() {
  echo -e "  ${CHECK} ${DIM}$(timestamp)${RESET}  $1"
}

log_fail() {
  echo -e "  ${CROSS} ${DIM}$(timestamp)${RESET}  ${RED}$1${RESET}"
}

spin() {
  local msg="$1"
  local pid="$2"
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}${SPINNER_CHARS[$i]}${RESET} ${DIM}$(timestamp)${RESET}  %s" "$msg"
    i=$(( (i + 1) % ${#SPINNER_CHARS[@]} ))
    sleep 0.1
  done
  printf "\r"
}

wait_for_port() {
  local port="$1"
  local label="$2"
  local timeout="${3:-30}"
  local elapsed=0
  while ! lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
    if (( elapsed >= timeout )); then
      log_fail "$label failed to bind port $port within ${timeout}s"
      return 1
    fi
    sleep 0.5
    elapsed=$((elapsed + 1))
  done
  return 0
}

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

cleanup_on_exit() {
  echo ""
  log_phase "INTERRUPTED — Running cleanup"
  "$SCRIPT_DIR/workspace-stop.sh" 2>/dev/null || true
  exit 0
}

# ── Main ────────────────────────────────────────────────────────────────────

clear
echo ""
echo -e "${BOLD}${CYAN}"
echo "   ╭──────────────────────────────────────╮"
echo "   │        Notion Workspace Launcher      │"
echo "   ╰──────────────────────────────────────╯"
echo -e "${RESET}"

trap cleanup_on_exit INT TERM

# ── Phase 1: Pre-flight ────────────────────────────────────────────────────
log_phase "PRE-FLIGHT CHECKS"

# .env.local
if [ -f "$SCRIPT_DIR/.env.local" ]; then
  log_ok "Environment file (.env.local) found"
else
  log_fail ".env.local not found — copy .env.example and configure"
  exit 1
fi

# node_modules
if [ -d "$SCRIPT_DIR/node_modules" ]; then
  log_ok "Dependencies (node_modules) present"
else
  log_step "Installing dependencies..."
  (cd "$SCRIPT_DIR" && npm install --prefer-offline --no-audit --no-fund > /dev/null 2>&1) &
  spin "npm install" $!
  wait $!
  log_ok "Dependencies installed"
fi

# Port checks
if port_in_use "$PROXY_PORT"; then
  log_fail "Port $PROXY_PORT already in use (Cloud SQL Proxy?). Run workspace-stop.sh first."
  exit 1
else
  log_ok "Port $PROXY_PORT is available"
fi

if port_in_use "$NEXT_PORT"; then
  log_fail "Port $NEXT_PORT already in use (Next.js?). Run workspace-stop.sh first."
  exit 1
else
  log_ok "Port $NEXT_PORT is available"
fi

# cloud-sql-proxy binary
if [ -x "$SCRIPT_DIR/cloud-sql-proxy" ]; then
  log_ok "Cloud SQL Proxy binary found"
else
  log_fail "cloud-sql-proxy binary not found or not executable in project root"
  exit 1
fi

# Docker (for MCP server)
if command -v docker &>/dev/null; then
  log_ok "Docker available ($(docker --version | head -c 40))"
else
  log_warn "Docker not found — MCP server will be skipped"
fi

# Log directory
mkdir -p "$LOG_DIR"
log_ok "Log directory ready ($LOG_DIR)"

# ── Phase 2: Cloud SQL Proxy ──────────────────────────────────────────────
log_phase "CLOUD SQL PROXY"
log_step "Starting proxy → 127.0.0.1:${PROXY_PORT}..."

"$SCRIPT_DIR/cloud-sql-proxy" "$PROXY_INSTANCE" \
  --port="$PROXY_PORT" \
  --auto-iam-authn \
  > "$LOG_DIR/proxy.log" 2>&1 &

PROXY_PID=$!
echo "$PROXY_PID" > "$PROXY_PID_FILE"

if wait_for_port "$PROXY_PORT" "Cloud SQL Proxy" 20; then
  log_ok "Cloud SQL Proxy running  (PID $PROXY_PID, port $PROXY_PORT)"
else
  log_fail "Cloud SQL Proxy failed to start. Check $LOG_DIR/proxy.log"
  cat "$LOG_DIR/proxy.log" 2>/dev/null | tail -5
  exit 1
fi

# ── Phase 3: MCP Server (Docker) ──────────────────────────────────────────
if command -v docker &>/dev/null; then
  log_phase "MCP SERVER (DOCKER)"

  # Stop any existing container
  if docker ps -a --format '{{.Names}}' | grep -q "^${MCP_CONTAINER}$"; then
    log_step "Removing existing MCP container..."
    docker rm -f "$MCP_CONTAINER" > /dev/null 2>&1
  fi

  log_step "Starting MCP server → http://localhost:${MCP_PORT}..."
  (cd "$SCRIPT_DIR" && docker compose up -d --build > "$LOG_DIR/mcp.log" 2>&1) &
  spin "docker compose up" $!
  wait $!

  if wait_for_port "$MCP_PORT" "MCP Server" 60; then
    log_ok "MCP server running  (container: $MCP_CONTAINER, port $MCP_PORT)"
  else
    log_fail "MCP server failed to start. Check $LOG_DIR/mcp.log"
    cat "$LOG_DIR/mcp.log" 2>/dev/null | tail -10
    log_step "Continuing without MCP server..."
  fi
else
  log_phase "MCP SERVER (SKIPPED)"
  log_step "Docker not available — skipping MCP server"
fi

# ── Phase 4: Next.js Dev Server ───────────────────────────────────────────
log_phase "NEXT.JS DEV SERVER"
log_step "Starting dev server → http://localhost:${NEXT_PORT}..."

(cd "$SCRIPT_DIR" && npm run dev > "$LOG_DIR/next.log" 2>&1) &

NEXT_PID=$!
echo "$NEXT_PID" > "$NEXT_PID_FILE"

if wait_for_port "$NEXT_PORT" "Next.js" 30; then
  log_ok "Next.js dev server running  (PID $NEXT_PID, port $NEXT_PORT)"
else
  log_fail "Next.js failed to start. Check $LOG_DIR/next.log"
  cat "$LOG_DIR/next.log" 2>/dev/null | tail -10
  exit 1
fi

# ── Phase 5: Browser Launch ───────────────────────────────────────────────
log_phase "LAUNCHING BROWSER"
log_step "Opening http://localhost:${NEXT_PORT}..."
sleep 1
open "http://localhost:${NEXT_PORT}"
log_ok "Browser opened"

# ── Ready ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "   ╭──────────────────────────────────────╮"
echo "   │      ✓  Workspace is running!        │"
echo "   │                                       │"
echo "   │   App:   http://localhost:${NEXT_PORT}        │"
echo "   │   Proxy: 127.0.0.1:${PROXY_PORT}             │"
echo "   │   MCP:   http://localhost:${MCP_PORT}        │"
echo "   │                                       │"
echo "   │   Press Ctrl+C to stop all services   │"
echo "   ╰──────────────────────────────────────╯"
echo -e "${RESET}"

# Keep alive — forward logs
log_step "Tailing server output (Ctrl+C to stop)..."
echo ""
tail -f "$LOG_DIR/next.log" 2>/dev/null
