import { Pool } from "pg";

let _pool: Pool | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // In production, you might want ssl: true
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });

    const originalQuery = _pool.query.bind(_pool);

    _initPromise = initSchema(originalQuery).catch((e) => {
      console.error("Schema init error:", e);
    }) as Promise<void>;

    // @ts-expect-error bypassing strict Pool method typings
    _pool.query = async (text: string, values?: unknown[]) => {
      if (_initPromise) {
        await _initPromise;
      }
      return originalQuery(text, values);
    };
  }
  return _pool;
}

async function initSchema(queryFn: (text: string) => Promise<unknown>) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      image TEXT,
      password_hash TEXT,
      provider TEXT NOT NULL DEFAULT 'credentials',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      scope TEXT,
      token_type TEXT,
      expires_at INTEGER,
      UNIQUE(provider, provider_account_id)
    );

    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS scope TEXT;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS token_type TEXT;

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      icon TEXT,
      cover_image TEXT,
      parent_id TEXT REFERENCES pages(id),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee TEXT,
      due_date TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      page_id TEXT REFERENCES pages(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transcriptions (
      id TEXT PRIMARY KEY,
      email_id TEXT,
      meeting_title TEXT NOT NULL,
      meeting_date TEXT,
      participants TEXT,
      raw_content TEXT NOT NULL,
      summary TEXT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pages_workspace ON pages(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_action_items_workspace ON action_items(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
    CREATE INDEX IF NOT EXISTS idx_transcriptions_workspace ON transcriptions(workspace_id);

    -- Agent framework tables
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      context JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id),
      parent_task_id TEXT REFERENCES agent_tasks(id),
      agent_role TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input JSONB NOT NULL DEFAULT '{}',
      output JSONB,
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      steps JSONB NOT NULL DEFAULT '[]',
      config JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace ON agent_sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_session ON agent_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
    CREATE INDEX IF NOT EXISTS idx_skills_agent_role ON skills(agent_role);
  `);
}
