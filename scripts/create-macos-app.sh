#!/usr/bin/env bash
# ============================================================================
# Create macOS .app Bundle for Notion Workspace
# Builds a native .app that runs services as background daemons (no Terminal).
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="Juan's Workspace"
INSTALL_DIR="/tmp"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
SESSION_DIR="$HOME/.notion-workspace"
SOURCE_APP="$PROJECT_DIR/macos/$APP_NAME.app"
SWIFT_SOURCE="$PROJECT_DIR/macos/NotionWorkspace.swift"

echo ""
echo "╭──────────────────────────────────────╮"
echo "│    Notion Workspace — App Builder     │"
echo "╰──────────────────────────────────────╯"
echo ""

# Verify Swift compiler
if ! command -v swiftc &>/dev/null; then
  echo "ERROR: swiftc not found. Install Xcode Command Line Tools:"
  echo "  xcode-select --install"
  exit 1
fi

if [ ! -f "$SWIFT_SOURCE" ]; then
  echo "ERROR: NotionWorkspace.swift not found at $SWIFT_SOURCE"
  exit 1
fi

# Remove previous version
if [ -d "$APP_PATH" ]; then
  echo "▸ Removing previous version..."
  rm -rf "$APP_PATH" 2>/dev/null || true
fi

# Build .app bundle structure
echo "▸ Creating application bundle..."
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Copy Info.plist
cp "$SOURCE_APP/Contents/Info.plist" "$APP_PATH/Contents/Info.plist"

# Compile native Swift launcher
echo "▸ Compiling native launcher..."
swiftc -O -o "$APP_PATH/Contents/MacOS/launcher" \
  "$SWIFT_SOURCE" \
  -framework Cocoa \
  -swift-version 5
echo "▸ Native launcher compiled"

# Copy icon if it exists
ICON_DIR="$SOURCE_APP/Contents/Resources/AppIcon.iconset"
if [ -d "$ICON_DIR" ]; then
  # Build .icns from iconset if iconutil is available
  if command -v iconutil &>/dev/null; then
    iconutil -c icns "$ICON_DIR" -o "$APP_PATH/Contents/Resources/AppIcon.icns" 2>/dev/null || \
      cp -r "$ICON_DIR" "$APP_PATH/Contents/Resources/"
  else
    cp -r "$ICON_DIR" "$APP_PATH/Contents/Resources/"
  fi
  echo "▸ App icon included"
fi

# Persist project root for the launcher to discover
mkdir -p "$SESSION_DIR"
echo "$PROJECT_DIR" > "$SESSION_DIR/project-root"
echo "▸ Project root saved to ~/.notion-workspace/project-root"

# Ensure workspace scripts are executable
chmod +x "$PROJECT_DIR/workspace-daemon.sh" 2>/dev/null || true
chmod +x "$PROJECT_DIR/workspace-start.sh" 2>/dev/null || true
chmod +x "$PROJECT_DIR/workspace-stop.sh" 2>/dev/null || true

# Update in-tree .app with compiled binary (so it's directly runnable)
cp "$APP_PATH/Contents/MacOS/launcher" "$SOURCE_APP/Contents/MacOS/launcher"
echo "▸ In-tree .app updated with compiled binary"

echo ""
echo "╭──────────────────────────────────────╮"
echo "│  ✓  App successfully generated!       │"
echo "│                                       │"
echo "│  Location: /tmp                       │"
echo "│                                       │"
echo "│  FEATURES:                            │"
echo "│  • Silent startup (no Terminal)       │"
echo "│  • Auto-cleanup on Quit               │"
echo "│  • Persistent sessions                │"
echo "│                                       │"
echo "│  ACTION REQUIRED:                     │"
echo "│  1. A Finder window will now open     │"
echo "│  2. Drag 'Notion Workspace.app' to    │"
echo "│     your Desktop or Applications      │"
echo "╰──────────────────────────────────────╯"
echo ""

# Open Finder so user can copy the app
open "$INSTALL_DIR"
