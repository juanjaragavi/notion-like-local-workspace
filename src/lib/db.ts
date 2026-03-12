import "@/lib/env";
import fs from "fs";
import { Pool } from "pg";
import { logger } from "@/lib/logger";

// Singleton setup promise — resolved when pool + schema are ready.
let _setupPromise: Promise<Pool> | null = null;

/**
 * Write the GCP service-account JSON stored in GOOGLE_APPLICATION_CREDENTIALS_JSON
 * (a Vercel/CI-friendly env var) to a temp file so google-auth-library can find it.
 * No-op when GOOGLE_APPLICATION_CREDENTIALS already points at a real file.
 */
function persistGCPCredentials(): void {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return;
  try {
    const dest = "/tmp/gcp-credentials.json";
    // Write once per container cold-start; reuse on warm invocations.
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, raw, { mode: 0o600 });
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = dest;
  } catch (err) {
    logger.error("[db] Could not persist GCP credentials", err);
  }
}

/**
 * Build and initialise the pg Pool.
 *
 * Two modes:
 *  - CLOUD_SQL_CONNECTION_NAME is set → use @google-cloud/cloud-sql-connector
 *    (Vercel / any environment without the cloud-sql-proxy binary).
 *  - Otherwise → direct DATABASE_URL connection
 *    (local dev with the cloud-sql-proxy binary, or any direct Postgres URL).
 */
async function setupPool(): Promise<Pool> {
  let pool: Pool;

  if (process.env.CLOUD_SQL_CONNECTION_NAME) {
    // ── Serverless / Vercel path ──────────────────────────────────────────
    // The @google-cloud/cloud-sql-connector creates an IAM-authenticated
    // mTLS tunnel inside the Node.js process — no external binary required.
    persistGCPCredentials();

    const { Connector, AuthTypes } =
      await import("@google-cloud/cloud-sql-connector");
    const connector = new Connector();
    const connectorOpts = await connector.getOptions({
      instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME,
      // PASSWORD: for built-in DB users (e.g. 'postgres') with a password.
      // Switch to AuthTypes.IAM for IAM-principal DB users (no password needed).
      authType: process.env.CLOUD_SQL_DB_PASS
        ? AuthTypes.PASSWORD
        : AuthTypes.IAM,
    });

    pool = new Pool({
      ...connectorOpts,
      user: process.env.CLOUD_SQL_DB_USER,
      // Required for built-in (password) DB users; omit for IAM DB users.
      password: process.env.CLOUD_SQL_DB_PASS || undefined,
      database: process.env.CLOUD_SQL_DB_NAME ?? "postgres",
      max: 5, // conservative limit for serverless concurrency
      connectionTimeoutMillis: 10_000,
    });
  } else {
    // ── Local dev / direct connection path ───────────────────────────────
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  pool.on("error", (err) => logger.error("PostgreSQL pool error", err.message));

  await initSchema(pool.query.bind(pool)).catch((e) =>
    logger.error("Schema init error", e),
  );

  return pool;
}

/**
 * Return a Pool-compatible handle.
 *
 * First call starts async setup (connector handshake + schema migration);
 * all subsequent calls — including concurrent requests during a cold start —
 * share the same promise and therefore the same Pool instance.
 *
 * If setup fails the promise is cleared so the next request can retry.
 */
export function getDb(): Pool {
  if (!_setupPromise) {
    _setupPromise = setupPool().catch((err) => {
      logger.error("[db] Fatal setup error", err);
      _setupPromise = null; // allow retry on next cold start
      throw err;
    });
  }

  // Return a proxy whose .query() awaits pool readiness.
  // All call-sites in this codebase only use Pool.query(), so this is safe.
  return {
    query: async (text: string, values?: unknown[]) => {
      const pool = await _setupPromise!;
      return pool.query(text, values);
    },
  } as Pool;
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

    ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_markdown TEXT NOT NULL DEFAULT '';

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

    -- Chat history persistence
    ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS title TEXT;

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(session_id, created_at);

    -- -------------------------------------------------------------------------
    -- One-time migration: normalise any legacy uuid-typed ID/FK columns to TEXT.
    --
    -- Early versions of this schema used the PostgreSQL UUID type for primary
    -- keys and foreign keys.  The node-postgres driver sends JS strings as
    -- type OID 25 (text), which makes every WHERE comparison against a UUID
    -- column fail with "operator does not exist: uuid = text".
    --
    -- This DO block:
    --   1. Exits immediately (RETURN) when no UUID columns are found — so fresh
    --      databases and repeated server restarts pay zero cost.
    --   2. Dynamically drops all FK constraints that reference a UUID column.
    --   3. Converts every UUID column to TEXT with a USING cast.
    --   4. Recreates the FK constraints so referential integrity is preserved.
    -- -------------------------------------------------------------------------
    DO $uuid_to_text_migration$
    DECLARE
      r RECORD;
    BEGIN
      -- Fast path: all columns already TEXT, nothing to do.
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'uuid'
          AND table_name IN (
            'users','accounts','workspaces','pages','action_items',
            'transcriptions','agent_sessions','agent_tasks','skills','agent_messages'
          )
      ) THEN
        RETURN;
      END IF;

      -- Step 1: drop all FK constraints on affected tables so we can safely
      -- change column types without hitting type-mismatch errors.
      FOR r IN
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name IN (
            'users','accounts','workspaces','pages','action_items',
            'transcriptions','agent_sessions','agent_tasks','skills','agent_messages'
          )
      LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                       r.table_name, r.constraint_name);
      END LOOP;

      -- Step 2: convert every remaining UUID column to TEXT.
      FOR r IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'uuid'
          AND table_name IN (
            'users','accounts','workspaces','pages','action_items',
            'transcriptions','agent_sessions','agent_tasks','skills','agent_messages'
          )
      LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::text',
                       r.table_name, r.column_name, r.column_name);
      END LOOP;

      -- Step 3: recreate FK constraints (TEXT ↔ TEXT, matching the schema).
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);

      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES users(id);

      ALTER TABLE pages
        ADD CONSTRAINT pages_parent_id_fkey
        FOREIGN KEY (parent_id) REFERENCES pages(id);
      ALTER TABLE pages
        ADD CONSTRAINT pages_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
      ALTER TABLE pages
        ADD CONSTRAINT pages_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id);

      ALTER TABLE action_items
        ADD CONSTRAINT action_items_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
      ALTER TABLE action_items
        ADD CONSTRAINT action_items_page_id_fkey
        FOREIGN KEY (page_id) REFERENCES pages(id);

      ALTER TABLE transcriptions
        ADD CONSTRAINT transcriptions_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

      ALTER TABLE agent_sessions
        ADD CONSTRAINT agent_sessions_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
      ALTER TABLE agent_sessions
        ADD CONSTRAINT agent_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);

      ALTER TABLE agent_tasks
        ADD CONSTRAINT agent_tasks_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id);
      ALTER TABLE agent_tasks
        ADD CONSTRAINT agent_tasks_parent_task_id_fkey
        FOREIGN KEY (parent_task_id) REFERENCES agent_tasks(id);

      ALTER TABLE agent_messages
        ADD CONSTRAINT agent_messages_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;
    END $uuid_to_text_migration$;
  `);
}
