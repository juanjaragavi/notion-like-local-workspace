# Notion Workspace

A personal AI-powered productivity workspace for macOS. Built with Next.js 16, Google Gemini, and a multi-agent orchestration framework. Features document editing, Gmail & Google Calendar integration, meeting transcription processing, action item tracking, and an extensible skill system — all running locally.

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.5-4285F4?logo=google)

---

## Features

- **AI Agent Orchestrator** — Multi-turn conversations with task decomposition, function calling, sub-agent delegation, and session persistence
- **Specialized Sub-Agents** — Email analyst, calendar planner, task manager, transcription processor, document writer, file operations, system control, and communication agents
- **Skill System** — Predefined multi-step workflows (proposals, presentations, emails, briefings) that agents discover and execute
- **MCP Server** — Dockerized Model Context Protocol server exposing 13 tools for shell execution, Finder automation, AppleScript, and filesystem operations
- **Google Integration** — Gmail inbox, Google Calendar events, and OAuth authentication
- **Rich Text Editor** — Tiptap 3 with task lists for document and page editing
- **Meeting Transcriptions** — Automatic extraction of action items from meeting transcription emails
- **File Browser** — Local file system explorer
- **macOS Native Wrapper** — Standalone `.app` bundle with one-click launch
- **Dark Theme** — Designed for a modern developer aesthetic (`neutral-950` background)

---

## Tech Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Framework   | Next.js 16 (App Router)                       |
| UI          | React 19, Tailwind CSS 4, Lucide Icons        |
| Language    | TypeScript 5                                  |
| Auth        | NextAuth v5 (Google OAuth, JWT sessions)      |
| Database    | PostgreSQL via `pg` connection pool           |
| AI/LLM      | Google Gemini 2.5 (`@google/genai`)           |
| Editor      | Tiptap 3 (starter kit + task list extensions) |
| Google APIs | `googleapis` (Gmail, Calendar)                |
| MCP Server  | Express 4 in Docker (Node 20)                 |
| Fonts       | Geist / Geist Mono via `next/font`            |

---

## Project Structure

```text
src/
├── app/                            # Next.js App Router
│   ├── api/                        # REST API endpoints
│   │   ├── agent/                  # AI orchestrator + sessions + skills + MCP
│   │   ├── auth/[...nextauth]/     # NextAuth handler
│   │   ├── action-items/           # Action item CRUD
│   │   ├── calendar/               # Google Calendar proxy
│   │   ├── files/                  # File system operations
│   │   ├── gmail/                  # Gmail proxy
│   │   ├── pages/                  # Document pages CRUD
│   │   ├── transcriptions/         # Meeting transcriptions
│   │   └── workspace/              # Workspace management + shutdown
│   ├── dashboard/                  # Main dashboard page
│   ├── login/                      # Login page
│   ├── settings/                   # Settings page
│   └── workspace/[id]/             # Dynamic workspace page
├── components/                     # React client components
│   ├── AgentPanel.tsx              # AI chat interface
│   ├── Sidebar.tsx                 # Navigation sidebar
│   ├── PagesPanel.tsx              # Document editor (Tiptap)
│   ├── ActionItemsPanel.tsx        # Task management
│   ├── GmailPanel.tsx              # Email inbox
│   ├── CalendarPanel.tsx           # Calendar view
│   ├── TranscriptionsPanel.tsx     # Meeting notes
│   └── FileBrowser.tsx             # File explorer
├── lib/                            # Shared utilities
│   ├── auth.ts                     # NextAuth configuration
│   ├── db.ts                       # PostgreSQL pool + auto-schema init
│   ├── google.ts                   # Google OAuth/API helpers
│   ├── hooks.ts                    # Custom React hooks (useFetch)
│   ├── transcription-parser.ts     # Transcription content parser
│   └── agents/                     # AI agent framework
│       ├── orchestrator.ts         # Main orchestrator (task decomposition, tool loop)
│       ├── sub-agents.ts           # 8 specialized agent role definitions
│       ├── skill-registry.ts       # Skill discovery, storage, and seeding
│       ├── mcp-client.ts           # MCP server HTTP client
│       ├── system-prompt.ts        # User context + prompt builders
│       ├── gemini.ts               # Gemini API client singleton
│       ├── types.ts                # Agent type definitions
│       ├── index.ts                # Barrel exports
│       └── tools/                  # Tool implementations
│           ├── action-items-tools.ts
│           ├── calendar-tools.ts
│           ├── gmail-tools.ts
│           ├── pages-tools.ts
│           ├── transcription-tools.ts
│           ├── file-operations-tools.ts
│           ├── system-control-tools.ts
│           └── index.ts            # Tool registry builder
└── types/
    ├── index.ts                    # Shared TypeScript interfaces
    └── next-auth.d.ts              # NextAuth type augmentation

mcp-server/                         # Dockerized MCP tool server
├── src/
│   ├── index.ts                    # Express server (port 3100)
│   ├── types.ts                    # Shared MCPTool interface
│   └── tools/
│       ├── shell.ts                # mcp_shell_exec, mcp_shell_which
│       ├── finder.ts               # mcp_finder_open, mcp_finder_reveal, mcp_applescript, mcp_app_launch
│       └── filesystem.ts           # mcp_fs_list, mcp_fs_read, mcp_fs_write, mcp_fs_mkdir, mcp_fs_move, mcp_fs_delete, mcp_fs_stat
├── Dockerfile
├── package.json
└── tsconfig.json

docker-compose.yml                  # MCP server container configuration
workspace-start.sh                  # One-click launcher (Proxy + MCP + Next.js)
workspace-stop.sh                   # Graceful shutdown of all services
start.sh                            # Lightweight dev launcher
```

---

## AI Agent Architecture

### Orchestrator

The `AgentOrchestrator` processes user messages through a multi-turn function-calling loop (up to 8 tool rounds). It:

1. **Receives** a user message with conversation history
2. **Creates/resumes** a session tracked in the `agent_sessions` table
3. **Selects tools** and builds Gemini function declarations from the tool registry
4. **Executes** tool calls, records each as a task in `agent_tasks`
5. **Returns** a response with session ID and tool call metadata

### Sub-Agents

| Role                      | Purpose                     | Tools                                                                                                                           |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `email-analyst`           | Gmail search & analysis     | `search_emails`, `read_email`                                                                                                   |
| `calendar-planner`        | Schedule management         | `get_upcoming_events`, `get_today_schedule`                                                                                     |
| `task-manager`            | Action item lifecycle       | `list_action_items`, `create_action_item`, `update_action_item`                                                                 |
| `transcription-processor` | Meeting note processing     | `list_transcriptions`, `process_transcription_email`, `read_transcription`, `search_emails`, `read_email`, `create_action_item` |
| `document-writer`         | Page creation & editing     | `list_pages`, `read_page`, `create_page`, `update_page`                                                                         |
| `file-operations`         | Local file management       | `list_directory`, `read_local_file`, `write_local_file`, `create_directory`, `move_file`, `delete_file`                         |
| `system-control`          | macOS automation            | `execute_shell_command`, `run_applescript`, `get_system_info`, `open_application`                                               |
| `communication`           | Cross-service communication | `search_emails`, `read_email`, `create_page`                                                                                    |

### Skill System

Agents discover and execute predefined multi-step workflows stored in the `skills` table. Default skills include:

- `create-technical-proposal` — Generate structured proposal documents
- `create-presentation` — Build presentation outlines for Keynote
- `draft-professional-email` / `draft-technical-email` — Compose context-aware emails
- `daily-briefing` — Aggregate calendar, email, and action item summaries
- `process-meeting-transcription` — Extract action items from transcriptions
- `organize-directory` — Audit and restructure local directories
- `system-health-check` — Check disk, memory, and processes
- `schedule-meeting` — Find availability and create calendar events

Custom skills can be registered via `POST /api/agent/skills`.

### MCP Server

A Dockerized Express server exposing 13 tools via JSON-RPC over HTTP:

| Category   | Tools                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Shell      | `mcp_shell_exec`, `mcp_shell_which`                                                                         |
| Finder     | `mcp_finder_open`, `mcp_finder_reveal`, `mcp_applescript`, `mcp_app_launch`                                 |
| Filesystem | `mcp_fs_list`, `mcp_fs_read`, `mcp_fs_write`, `mcp_fs_mkdir`, `mcp_fs_move`, `mcp_fs_delete`, `mcp_fs_stat` |

All tools include path sandboxing (Documents, Desktop, Downloads, GitHub) and destructive-command blocking.

---

## Database Schema

Auto-initialized on first connection via `getDb()`. Tables:

| Table            | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `users`          | User accounts                                          |
| `accounts`       | OAuth provider tokens (Google)                         |
| `workspaces`     | User workspaces                                        |
| `pages`          | Documents and notes (Tiptap content)                   |
| `action_items`   | Tasks with status, priority, due date, source tracking |
| `transcriptions` | Meeting transcription records and summaries            |
| `agent_sessions` | Agent conversation sessions with context               |
| `agent_tasks`    | Individual tool calls and results within sessions      |
| `skills`         | Registered agent skills and workflows                  |

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** (local or Cloud SQL)
- **Docker** (for MCP server — optional)
- **Google Cloud Project** with OAuth credentials and API access

### Google OAuth Setup

1. Create a project at [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Gmail API** and **Google Calendar API**
3. Configure the **OAuth Consent Screen** (External) with scopes:
   - `openid`, `email`, `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/documents.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
4. Create an **OAuth 2.0 Client ID** (Web application):
   - JavaScript origins: `http://localhost:3000`
   - Redirect URI: `http://localhost:3000/api/auth/callback/google`

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="<your_client_id>"
GOOGLE_CLIENT_SECRET="<your_client_secret>"
DATABASE_URL="postgresql://user:password@localhost:5432/notion_workspace"
GEMINI_API_KEY="<from https://aistudio.google.com/apikey>"
MCP_SERVER_URL="http://localhost:3100"   # Optional, default value shown
```

### Quick Start

```bash
# Install dependencies
npm install

# Start everything (Cloud SQL Proxy + MCP server + Next.js)
./workspace-start.sh

# Or, lightweight dev mode (no proxy or Docker)
./start.sh
```

The app launches at <http://localhost:3000>. Sign in with Google to get started.

For meeting transcription workflows, Gmail notifications only contain links to Drive-hosted Google Docs. The authenticated session therefore needs Gmail, Drive, and Google Docs read scopes in the same consent flow so the orchestrator can detect the notification email, resolve the linked file, and read the transcription document text.

### MCP Server (Docker)

The MCP server starts automatically with `workspace-start.sh`. To manage it independently:

```bash
# Build and start
docker compose up -d --build

# Check health
curl http://localhost:3100/health

# Discover tools
curl http://localhost:3100/tools

# Stop
docker compose down
```

---

## API Endpoints

| Method     | Endpoint                         | Description                        |
| ---------- | -------------------------------- | ---------------------------------- |
| `POST`     | `/api/agent`                     | Send message to AI orchestrator    |
| `GET`      | `/api/agent/sessions`            | List agent sessions                |
| `POST`     | `/api/agent/sessions`            | Create new session                 |
| `GET`      | `/api/agent/sessions/[id]/tasks` | Get tasks for a session            |
| `GET`      | `/api/agent/skills`              | List available skills              |
| `POST`     | `/api/agent/skills`              | Register a custom skill            |
| `GET`      | `/api/agent/mcp`                 | MCP server health & tool discovery |
| `GET/POST` | `/api/pages`                     | List / create pages                |
| `GET/POST` | `/api/action-items`              | List / create action items         |
| `GET`      | `/api/gmail`                     | Fetch Gmail messages               |
| `GET`      | `/api/calendar`                  | Fetch calendar events              |
| `GET`      | `/api/files`                     | Browse local files                 |
| `GET`      | `/api/transcriptions`            | List transcriptions                |
| `GET/POST` | `/api/workspace`                 | Workspace management               |

All endpoints require an authenticated NextAuth session.

---

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint + Prettier check
npm run format       # Auto-format with Prettier

./workspace-start.sh # Launch all services (Proxy + MCP + Next.js + browser)
./workspace-stop.sh  # Graceful shutdown of all services + cleanup
./start.sh           # Lightweight launcher (checks .env, installs deps, opens browser)
```

---

## Troubleshooting

| Problem                 | Solution                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Port 3000 in use        | `lsof -ti:3000 \| xargs kill` or run `./workspace-stop.sh`                                          |
| `redirect_uri_mismatch` | Verify `http://localhost:3000/api/auth/callback/google` is in Google Cloud authorized redirect URIs |
| No Google access token  | Sign in with Google OAuth (not credentials provider)                                                |
| Database errors         | Check `DATABASE_URL` in `.env.local` and ensure PostgreSQL is running                               |
| MCP server not starting | Run `docker compose logs mcp-server` to check container output                                      |
| GEMINI_API_KEY errors   | Get a key from [Google AI Studio](https://aistudio.google.com/apikey)                               |
| TS Server module errors | Run **"TypeScript: Restart TS Server"** from VS Code Command Palette                                |
