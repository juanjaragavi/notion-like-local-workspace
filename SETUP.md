# Setup Guide

Complete setup instructions for the Workspace application.

## Google OAuth Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name (e.g., "Workspace App")
4. Click **Create**

### 2. Enable Required APIs

1. In your project, go to **APIs & Services** → **Library**
2. Search and enable:
   - **Gmail API**
   - **Google Calendar API**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type → **Create**
3. Fill in App name, support email, developer contact
4. **Scopes**: Add `openid`, `email`, `profile`, `gmail.readonly`, `calendar.readonly`
5. **Test users**: Add your Gmail address

### 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. **Authorized JavaScript origins**: `http://localhost:3000`
5. **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client Secret

## Environment Configuration

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXTAUTH_SECRET="<run: openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="<your_google_client_id>"
GOOGLE_CLIENT_SECRET="<your_google_client_secret>"
```

## First Run

```bash
npm install
./start.sh
```

Open <http://localhost:3000>, sign in with Google, and verify Gmail/Calendar tabs work.

## Troubleshooting

- **redirect_uri_mismatch**: Ensure `http://localhost:3000/api/auth/callback/google` is in authorized redirect URIs
- **No Google access token**: Sign in with Google OAuth, not email/password
- **Port 3000 in use**: `lsof -ti:3000 | xargs kill` or `PORT=3001 npm run dev`
- **Database errors**: Delete `~/.notion-workspace/workspace.db` and restart
