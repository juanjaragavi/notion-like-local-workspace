# Browser Assistant Delta Playbook

Use this playbook only if the initial Google OAuth setup is already complete.

## Goal

Update the existing Google Cloud OAuth configuration so the Workspace app can:

- read Gmail transcription notification emails
- follow Google Drive links contained in those emails
- read Gemini-generated Google Docs transcription content

## Do Not Repeat

Do not recreate the project.
Do not create a new OAuth client.
Do not change the existing redirect URI unless it is missing.
Do not regenerate client secrets unless the current ones are invalid.

## Actions To Perform

### 1. Open the existing Google Cloud project

1. Go to Google Cloud Console.
2. Open the project already used by this Workspace app.

### 2. Enable the newly required APIs

1. Open `APIs & Services` -> `Library`.
2. Search for `Google Drive API` and enable it if it is not already enabled.
3. Search for `Google Docs API` and enable it if it is not already enabled.
4. Do not change Gmail API or Google Calendar API if they are already enabled.

### 3. Update the OAuth consent screen scopes

1. Open `APIs & Services` -> `OAuth consent screen`.
2. Open the app's current consent configuration.
3. Go to the scopes section.
4. Ensure these scopes are present:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/documents.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
5. Add any missing scopes.
6. Save the consent screen changes.

### 4. Verify the existing OAuth client is still valid

1. Open `APIs & Services` -> `Credentials`.
2. Open the existing `OAuth 2.0 Client ID` used by the app.
3. Confirm this redirect URI exists:
   - `http://localhost:3000/api/auth/callback/google`
4. If it already exists, do not change anything else on this screen.

### 5. Re-consent in the local Workspace app

1. Open the local Workspace app in the browser.
2. Sign out if already signed in.
3. Sign in again with Google.
4. On the consent screen, approve the updated access request.
5. Make sure the sign-in completes successfully and returns to the app.

### 6. Validate the new permissions in the app

1. Open the app `Settings` page.
2. Confirm the displayed API scopes include:
   - `gmail.readonly`
   - `drive.readonly`
   - `documents.readonly`
   - `calendar.readonly`
3. Go to the Gmail area of the app.
4. Find a Gemini transcription notification email.
5. Trigger transcription processing.
6. Confirm the app can read the linked Google Doc and continue downstream processing.

## Expected Result

After these steps, the authenticated Workspace session should have enough access to:

- detect transcription notification emails in Gmail
- resolve Drive-hosted Google Docs links from those emails
- read the transcription text from Google Docs
- pass that text into transcription and action-item processing

## Stop Conditions

Stop and report back if any of the following happens:

- `Google Drive API` cannot be enabled
- `Google Docs API` cannot be enabled
- the required scopes cannot be added to the consent screen
- the redirect URI is missing and cannot be edited
- the sign-in flow does not show the updated permissions
- the app signs in successfully but still cannot process a linked Google Doc
