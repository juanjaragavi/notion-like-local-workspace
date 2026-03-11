#!/usr/bin/env bash
# ============================================================================
# Create macOS .app Bundle for Notion Workspace
# Uses osacompile (native macOS) to generate a Dock-draggable application
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="Notion Workspace"
INSTALL_DIR="/tmp"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
BUILD_DIR="/tmp/notion-workspace-build"

echo ""
echo "╭──────────────────────────────────────╮"
echo "│    Notion Workspace — App Builder     │"
echo "╰──────────────────────────────────────╯"
echo ""

# Remove previous version
if [ -d "$APP_PATH" ]; then
  echo "▸ Removing previous version..."
  rm -rf "$APP_PATH" 2>/dev/null || true
fi

# Create AppleScript source file
mkdir -p "$BUILD_DIR"
cat > "$BUILD_DIR/launcher.scpt" <<EOF
on run
    tell application "Terminal"
        activate
        do script "cd '${PROJECT_DIR}' && ./workspace-start.sh"
    end tell
end run
EOF

echo "▸ Compiling application bundle..."

# Build in /tmp (avoids macOS SIP restrictions on .app creation)
rm -rf "$APP_PATH" 2>/dev/null || true
osacompile -o "$APP_PATH" "$BUILD_DIR/launcher.scpt"

if [ ! -d "$APP_PATH" ]; then
  echo "✗ osacompile failed"
  exit 1
fi

# Cleanup build artifacts
rm -rf "$BUILD_DIR"

echo ""
echo "ℹ  To set a custom icon:"
echo "   Right-click '$APP_NAME.app' → Get Info (⌘I)"
echo "   Drag your icon onto the app icon in the top-left corner"

echo ""
echo "╭──────────────────────────────────────╮"
echo "│  ✓  App successfully generated!       │"
echo "│                                       │"
echo "│  Location: /tmp                       │"
echo "│                                       │"
echo "│  ACTION REQUIRED:                     │"
echo "│  1. A Finder window will now open     │"
echo "│  2. Drag 'Notion Workspace.app' to    │"
echo "│     your Desktop or Applications      │"
echo "╰──────────────────────────────────────╯"
echo ""

# Open Finder so user can copy the app
open "$INSTALL_DIR"
