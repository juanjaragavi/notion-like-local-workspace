# CLAUDE.md

## Project Overview

Notion-like personal productivity workspace built with Next.js (App Router). Features pages/docs editing, Gmail integration, Google Calendar, meeting transcriptions, action items, and a file browser. Uses Google OAuth for authentication. Dark-themed UI.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19 and TypeScript 5
- **Styling**: Tailwind CSS 4 via `@tailwindcss/postcss`
- **Auth**: NextAuth v5 (beta) — Google provider (Apple and Credentials disabled)
- **Database**: PostgreSQL via `pg` (connection pool)
- **Rich Text Editor**: Tiptap 3 (with task list extensions)
- **Google APIs**: `googleapis` for Gmail and Calendar
- **Icons**: lucide-react
- **Fonts**: Geist / Geist Mono via `next/font`

## Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
    api/            # REST API endpoints (auth, action-items, calendar, files, gmail, pages, transcriptions, workspace)
    dashboard/      # Dashboard page
    login/          # Login page
    settings/       # Settings page
    workspace/[id]/ # Workspace page (dynamic route)
  components/       # React client components (Sidebar, PagesPanel, CalendarPanel, GmailPanel, etc.)
  lib/              # Shared utilities
    auth.ts         # NextAuth configuration and providers
    db.ts           # PostgreSQL connection pool and schema auto-init
    google.ts       # Google OAuth2 / Gmail / Calendar client helpers
    hooks.ts        # Custom React hooks (useFetch)
    transcription-parser.ts
  types/index.ts    # Shared TypeScript interfaces (User, Page, Workspace, ActionItem, etc.)
lib/documents/      # Static document templates
public/             # Static assets
```

## Commands

```bash
npm run dev       # Start dev server (http://localhost:3000)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint (flat config, next/core-web-vitals + typescript)
./start.sh        # Launch script: checks .env.local, installs deps, opens browser, runs dev
```

## Environment Variables

Defined in `.env.local` (see `.env.example`):

- `NEXTAUTH_SECRET` — NextAuth session secret
- `NEXTAUTH_URL` — App base URL (`http://localhost:3000`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `DATABASE_URL` — PostgreSQL connection string

## Key Patterns

- **Path alias**: `@/*` maps to `./src/*`
- **Client components**: Prefixed with `"use client"` directive; use the `useFetch` hook from `@/lib/hooks` for data fetching
- **API routes**: Located under `src/app/api/`; server-side logic uses `getDb()` from `@/lib/db`
- **Database**: PostgreSQL via connection pool; schema auto-initializes on first `getDb()` call; uses `$1, $2...` parameterized queries
- **Auth**: JWT session strategy via NextAuth; sign-in callback auto-creates user, account, and workspace records
- **Dark theme**: Hardcoded `className="dark"` on `<html>`; background `bg-neutral-950`, text `text-white`

## Database Tables

`users`, `accounts`, `workspaces`, `pages`, `action_items`, `transcriptions`

## Troubleshooting

- **Port 3000 in use**: `lsof -ti:3000 | xargs kill`
- **Database errors**: Check PostgreSQL connection and `DATABASE_URL` env var
- **redirect_uri_mismatch**: Ensure `http://localhost:3000/api/auth/callback/google` is in Google Cloud authorized redirect URIs
