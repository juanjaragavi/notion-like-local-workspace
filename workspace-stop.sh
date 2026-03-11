#!/usr/bin/env bash
# ============================================================================
# Notion Workspace — Shutdown Script
# Securely terminates all services and cleans up execution traces
# ============================================================================
set -uo pipefail

# ── Paths & Constants ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="/tmp"
PROXY_PID_FILE="$PID_DIR/notion-workspace-proxy.pid"
NEXT_PID_FILE="$PID_DIR/notion-workspace-next.pid"
PROXY_PORT=5433
NEXT_PORT=3000
MCP_PORT=3100
MCP_CONTAINER="notion-mcp-server"
LOG_DIR="/tmp/notion-workspace-logs"
KILL_TIMEOUT=5

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
WARN="${YELLOW}⚠${RESET}"
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

log_warn() {
  echo -e "  ${WARN} ${DIM}$(timestamp)${RESET}  ${YELLOW}$1${RESET}"
}

log_fail() {
  echo -e "  ${CROSS} ${DIM}$(timestamp)${RESET}  ${RED}$1${RESET}"
}

EXIT_CODE=0

# Gracefully kill a process: SIGTERM, wait, then SIGKILL if needed
kill_process() {
  local pid="$1"
  local label="$2"

  if ! kill -0 "$pid" 2>/dev/null; then
    log_warn "$label (PID $pid) — already stopped"
    return 0
  fi

  log_step "Sending SIGTERM to $label (PID $pid)..."
  kill -TERM "$pid" 2>/dev/null || true

  local waited=0
  while kill -0 "$pid" 2>/dev/null && (( waited < KILL_TIMEOUT )); do
    sleep 0.5
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    log_step "Escalating to SIGKILL for $label..."
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi

  if kill -0 "$pid" 2>/dev/null; then
    log_fail "Could not kill $label (PID $pid)"
    EXIT_CODE=1
  else
    log_ok "$label stopped (PID $pid)"
  fi
}

kill_from_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null)
    if [ -n "$pid" ]; then
      kill_process "$pid" "$label"
    fi
    rm -f "$pid_file"
    log_ok "Removed PID file: $(basename "$pid_file")"
  else
    log_warn "No PID file found for $label"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "${BOLD}${RED}"
echo "   ╭──────────────────────────────────────╮"
echo "   │       Notion Workspace Shutdown       │"
echo "   ╰──────────────────────────────────────╯"
echo -e "${RESET}"

# ── Phase 1: Service Termination ───────────────────────────────────────────
log_phase "SERVICE TERMINATION"

# Next.js first (web-facing), then proxy
kill_from_pid_file "$NEXT_PID_FILE" "Next.js dev server"
kill_from_pid_file "$PROXY_PID_FILE" "Cloud SQL Proxy"

# MCP server (Docker)
if command -v docker &>/dev/null; then
  if docker ps --format '{{.Names}}' | grep -q "^${MCP_CONTAINER}$"; then
    log_step "Stopping MCP server container..."
    docker rm -f "$MCP_CONTAINER" > /dev/null 2>&1
    log_ok "MCP server container stopped"
  else
    log_ok "MCP server container not running"
  fi
else
  log_ok "Docker not available — skipping MCP cleanup"
fi

# ── Phase 2: Orphan Cleanup ───────────────────────────────────────────────
log_phase "ORPHAN PROCESS CLEANUP"

# Kill anything still listening on our ports
for port in $NEXT_PORT $PROXY_PORT $MCP_PORT; do
  orphans=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$orphans" ]; then
    log_step "Killing orphan processes on port $port..."
    echo "$orphans" | xargs kill -9 2>/dev/null || true
    sleep 0.5
    log_ok "Orphans on port $port cleared"
  else
    log_ok "No orphan processes on port $port"
  fi
done

# ── Phase 3: Temp File Purge ──────────────────────────────────────────────
log_phase "TEMPORARY FILE CLEANUP"

# PID files (safety — should already be removed)
for f in "$PROXY_PID_FILE" "$NEXT_PID_FILE"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    log_ok "Removed $(basename "$f")"
  fi
done

# Log directory
if [ -d "$LOG_DIR" ]; then
  rm -rf "$LOG_DIR"
  log_ok "Removed log directory ($LOG_DIR)"
else
  log_ok "No log directory to clean"
fi

# .next build cache
if [ -d "$SCRIPT_DIR/.next" ]; then
  rm -rf "$SCRIPT_DIR/.next"
  log_ok "Removed .next build cache"
else
  log_ok "No .next cache present"
fi

# Next.js dev log
if [ -f "$SCRIPT_DIR/.next_dev.log" ]; then
  rm -f "$SCRIPT_DIR/.next_dev.log"
  log_ok "Removed .next_dev.log"
fi

# Home dir temp files
WORKSPACE_TMP="$HOME/.notion-workspace"
if [ -d "$WORKSPACE_TMP" ]; then
  find "$WORKSPACE_TMP" -name "*.tmp" -delete 2>/dev/null && \
    log_ok "Purged temp files in ~/.notion-workspace" || \
    log_ok "No temp files in ~/.notion-workspace"
else
  log_ok "No ~/.notion-workspace directory"
fi

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo -e "${BOLD}${GREEN}"
  echo "   ╭──────────────────────────────────────╮"
  echo "   │    ✓  Workspace shut down cleanly     │"
  echo "   │       All traces removed.             │"
  echo "   ╰──────────────────────────────────────╯"
  echo -e "${RESET}"
else
  echo -e "${BOLD}${YELLOW}"
  echo "   ╭──────────────────────────────────────╮"
  echo "   │    ⚠  Shutdown completed with errors  │"
  echo "   │       Check output above.             │"
  echo "   ╰──────────────────────────────────────╯"
  echo -e "${RESET}"
fi

exit "$EXIT_CODE"
