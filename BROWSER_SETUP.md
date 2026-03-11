# Browser Assistant Setup

Use these steps in a browser-based assistant session when you need to expand Google OAuth scopes, enable additional Google Workspace APIs, or verify Drive access settings that cannot be safely automated from the app server.

## Objective

Configure Google Cloud so Notion Workspace can read Gmail, Calendar, Drive, and Google Docs through the existing NextAuth Google OAuth flow.

## Preconditions

- You have access to the Google Cloud project used by this app.
- You can edit the OAuth consent screen and OAuth client configuration.
- You can reach the application at `http://localhost:3000`.

## APIs To Enable

Open Google Cloud Console and enable these APIs for the project:

1. Gmail API
2. Google Calendar API
3. Google Drive API
4. Google Docs API

Recommended Console path:

1. Go to `https://console.cloud.google.com/apis/library`
2. Confirm the correct project is selected
3. Search and enable each API listed above

## OAuth Consent Screen

Open the OAuth consent screen and verify that the app includes these scopes:

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/gmail.readonly`
5. `https://www.googleapis.com/auth/calendar.readonly`
6. `https://www.googleapis.com/auth/drive.readonly`
7. `https://www.googleapis.com/auth/documents.readonly`

Recommended Console path:

1. Go to `https://console.cloud.google.com/apis/credentials/consent`
2. Open the app registration used by this project
3. Add any missing scopes from the list above
4. Save changes

If the app is in testing mode, verify the intended Google account is present under test users.

## OAuth Client Configuration

Open the Web OAuth client used by Notion Workspace and verify these entries:

### Authorized JavaScript origins

1. `http://localhost:3000`

### Authorized redirect URIs

1. `http://localhost:3000/api/auth/callback/google`

Recommended Console path:

1. Go to `https://console.cloud.google.com/apis/credentials`
2. Open the active Web application OAuth client
3. Verify the origin and redirect URI values above
4. Save if you changed anything

## Session Re-Consent

If scopes were added after users already signed in, the existing OAuth grant may not include the new scopes. Force a fresh consent flow:

1. Sign out of Notion Workspace
2. Clear the app session if the old token persists
3. Sign in again with the target Google account
4. Accept the requested Gmail, Calendar, Drive, and Docs permissions

## Browser Assistant Prompt

Use this prompt in a browser-based assistant if you want it to drive the setup interactively:

```text
Open Google Cloud Console for the project used by Notion Workspace. Enable Gmail API, Google Calendar API, Google Drive API, and Google Docs API. Then open the OAuth consent screen and verify these scopes are configured: openid, email, profile, gmail.readonly, calendar.readonly, drive.readonly, documents.readonly. After that, open the Web OAuth client credentials and confirm http://localhost:3000 is an authorized JavaScript origin and http://localhost:3000/api/auth/callback/google is an authorized redirect URI. Report any missing API, missing scope, or redirect mismatch before making changes.
```

## Verification Checklist

After completing the browser steps, verify these behaviors inside Notion Workspace:

1. Dashboard widgets load Gmail and Calendar data without an auth error.
2. Global search returns Gmail, Calendar, and Drive results.
3. AI Agent responses reflect recent Gmail, Calendar, and Drive context.
4. No `redirect_uri_mismatch` or `insufficientPermissions` errors appear during sign-in or API calls.

## Common Failures

- `redirect_uri_mismatch`: The callback URL in Google Cloud does not match `http://localhost:3000/api/auth/callback/google`.
- `insufficientPermissions`: The user signed in before the new scopes were added and must re-consent.
- Drive returns empty search results: Drive API is disabled, the Drive scope is missing, or the signed-in account lacks access to the target files.
- Consent screen blocks login: The user account is not listed as a test user while the app is still in testing mode.
