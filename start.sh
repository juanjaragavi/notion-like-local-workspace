#!/bin/bash
# Workspace - Launch Script for macOS
# Starts the application and opens it in the default browser

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

echo "Starting Workspace on http://localhost:3000 ..."
open "http://localhost:3000" &
npm run dev
