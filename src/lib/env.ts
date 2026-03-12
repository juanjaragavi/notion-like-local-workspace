/**
 * Environment variable validator.
 * Import this module early (e.g. in db.ts) so missing variables are caught
 * at startup with a descriptive error instead of a cryptic runtime failure.
 */

const REQUIRED_VARS = [
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

// ── Database connection mode ────────────────────────────────────────────────
// Mode A (Vercel / serverless): CLOUD_SQL_CONNECTION_NAME + CLOUD_SQL_DB_USER
//   Uses @google-cloud/cloud-sql-connector — no external binary needed.
//   Credentials come from GOOGLE_APPLICATION_CREDENTIALS (file path) or
//   GOOGLE_APPLICATION_CREDENTIALS_JSON (raw JSON, written to /tmp at runtime).
//
// Mode B (local dev / direct): DATABASE_URL
//   Connects directly to Postgres (through the local cloud-sql-proxy binary,
//   a Neon URL, an SSH tunnel, etc.).
const cloudSqlMode = !!process.env.CLOUD_SQL_CONNECTION_NAME;

const dbVars = cloudSqlMode
  ? ["CLOUD_SQL_CONNECTION_NAME", "CLOUD_SQL_DB_USER", "CLOUD_SQL_DB_NAME"]
  : ["DATABASE_URL"];

// GCP credentials are only required when running on Vercel (or any environment
// that lacks Application Default Credentials from `gcloud auth`).
// Locally, ADC (~/.config/gcloud/application_default_credentials.json) is used
// automatically by the Cloud SQL connector — no env var is needed.
const gcpCredsMissing =
  cloudSqlMode &&
  !!process.env.VERCEL && // only enforce on Vercel deployments
  !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

// NEXTAUTH_URL is required locally; on Vercel, NextAuth v5 derives it from VERCEL_URL.
const nextAuthVar = !process.env.VERCEL_URL ? ["NEXTAUTH_URL"] : [];

const missing = [
  ...REQUIRED_VARS.filter((key) => !process.env[key]),
  ...dbVars.filter((key) => !process.env[key]),
  ...(gcpCredsMissing ? ["GOOGLE_APPLICATION_CREDENTIALS_JSON"] : []),
  ...nextAuthVar.filter((key) => !process.env[key]),
];

if (missing.length > 0) {
  throw new Error(
    `[env] Missing required environment variables: ${missing.join(", ")}\n` +
      `Ensure these are set in .env.local (local) or in your Vercel project settings.`,
  );
}
