# Implementation Plan: GCP Configuration Playbook

## Goal Description

The objective is to operationalize the `notion-workspace` application within the user's existing Google Cloud Platform (GCP) project, `TopFinanzas`. Currently, the app relies on a local SQLite database (`better-sqlite3` stored in `~/.notion-workspace/workspace.db`) and supports Google, Apple, and Email authentication.

To make this application GCP-compatible, we must refactor the backend to use a cloud-native database (e.g., Cloud SQL) and configure the necessary Google APIs (Gmail, Calendar) and OAuth settings exclusively within the `TopFinanzas` project. This document serves as the instructional playbook for the automated browser assistant to execute this configuration.

## Pre-Configuration Codebase Assessment

Based on our analysis of `/Users/macbookpro/GitHub/notion-workspace`:

- **Frontend Architecture:** Next.js 16 (App Router) with React 19 and Tailwind CSS.
- **Backend Architecture:** Local Next.js API Routes interacting with a local database (`better-sqlite3`). **This is incompatible with serverless environments/GCP.**
- **Authentication Providers:** NextAuth v5 configured with Google, Apple, and Credentials (Email/Password).
- **Required Google APIs:** Gmail API, Google Calendar API.
- **Environment Variables:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `DATA_DIR`.

## Required Code Refactoring for GCP Compatibility

Before or during deployment, the following backend alignments must occur:

### Backend Database Refactor

1. Replace `better-sqlite3` with a PostgreSQL-compatible ORM (e.g., Prisma, Drizzle, or `pg`).
2. Update the `src/lib/db.ts` file to connect to a **Cloud SQL for PostgreSQL** instance via connection pooling, rather than the local filesystem.
3. Keep the same schema (`users`, `accounts`, `workspaces`, `pages`, `action_items`, `transcriptions`) but apply it via standard SQL migration scripts.

### Authentication Provider Simplification

If configuring Apple or Email auth causes blocking issues:

1. Open `src/lib/auth.ts`.
2. Temporarily comment out or remove the `Apple()` and `Credentials()` providers from the `providers` array.
3. Ensure Google remains the sole active provider to guarantee immediate unblocked progress.

## Playbook Instructions for the Browser Assistant

The browser assistant MUST follow these steps exactly:

### Step 1: Verify the Target Project

1. Navigate to the Google Cloud Console (<https://console.cloud.google.com>).
2. Look at the project selector dropdown in the top navbar.
3. **CRITICAL:** Ensure the selected project is **`TopFinanzas`**. Do NOT create a new project under any circumstance.

### Step 2: Enable Required APIs

1. Navigate to **APIs & Services** > **Library**.
2. Search for and enable the **Gmail API**.
3. Search for and enable the **Google Calendar API**.
4. _(Optional but recommended for the new backend)_ Search for and enable the **Cloud SQL Admin API**.

### Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** > **OAuth consent screen**.
2. If not already configured, select the **External** user type and click **Create**.
3. Enter the App name (e.g., "Notion Workspace").
4. Add the necessary support and developer contact emails.
5. Under **Scopes**, click **Add or Remove Scopes** and add:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
6. Under **Test users**, add the expected user email addresses (e.g., the user's main Google account) if the app remains in "Testing" mode.

### Step 4: Create OAuth Credentials

1. Navigate to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** -> **OAuth client ID**.
3. Select **Web application** as the application type.
4. Under **Authorized JavaScript origins**, add: `http://localhost:3000`.
5. Under **Authorized redirect URIs**, add: `http://localhost:3000/api/auth/callback/google`.
6. Click **Create**.
7. Securely capture the generated **Client ID** and **Client Secret**. These correspond to the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables needed for `.env.local`.

### Step 5: Configure Application Secrets

1. Navigate to **Security** > **Secret Manager** inside the `TopFinanzas` project.
2. Ensure the Secret Manager API is enabled.
3. Create new secrets for the application config:
   - `WORKSPACE_GOOGLE_CLIENT_ID`
   - `WORKSPACE_GOOGLE_CLIENT_SECRET`
   - `WORKSPACE_NEXTAUTH_SECRET` (Generate a secure 32-character base64 string for this).

### Step 6: Provision Cloud SQL for PostgreSQL (Backend Refactor)

1. Navigate to **SQL**.
2. Create a new **PostgreSQL** instance.
3. Ensure it is placed in the same region as your intended compute layer (e.g., Cloud Run).
4. Set a strong password and capture the connection string to be used when refactoring `src/lib/db.ts`.

## Verification Plan

1. **Manual Verification:** After completing the steps above, the user should be able to populate their `.env.local` file with the generated credentials.
2. The user will run `npm run dev` locally.
3. The user will navigate to `http://localhost:3000/login` and click "Sign in with Google".
4. Successful auth via Google, followed by the ability to read Calendar and Gmail data without OAuth mismatch errors, confirms the configuration was successful within `TopFinanzas`.
5. For the backend, successful creation and querying of Pages and Action Items against the Cloud SQL instance proves the GCP alignment is complete.
