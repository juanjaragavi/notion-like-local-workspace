# Cowork Agent Instructions — NotionWorkspace Xcode Testing

## Context

You are operating Juan Jaramillo's MacBook Pro M1 on his behalf.
The Xcode project is already open at:

```
/Users/macbookpro/GitHub/notion-workspace/macos/NotionWorkspace/NotionWorkspace.xcodeproj
```

The Next.js web server (backend) must be running at `http://localhost:3000` for any
network calls to work. Check this first.

**Toolchain:** Swift 6.2.4 / Xcode 26.3 / macOS 26 (Tahoe beta)
**Target:** NotionWorkspace — macOS 15.0+ / My Mac

---

## Pre-flight

### 1. Confirm Next.js server is running

Open Terminal and run:

```bash
curl -s http://localhost:3000/api/health | head -c 200
```

Expected: a JSON response with `{ "status": "ok" }` or similar.

If the server is not running:

```bash
cd /Users/macbookpro/GitHub/notion-workspace && npm run dev &
```

Wait ~10 seconds, then re-check with curl.

### 2. Switch to Xcode

Click the Xcode icon in the Dock or use:

```bash
open /Users/macbookpro/GitHub/notion-workspace/macos/NotionWorkspace/NotionWorkspace.xcodeproj
```

Take a screenshot to confirm the project is open and the navigator is visible.

---

## Phase 1 — Signing Setup

The `DEVELOPMENT_TEAM` in `project.yml` is intentionally empty so no hardcoded
team ID is committed. You must set it once via the Xcode UI.

1. In Xcode, click **NotionWorkspace** in the Project Navigator (left panel, top item).
2. Select the **NotionWorkspace** target under TARGETS.
3. Click the **Signing & Capabilities** tab.
4. Under **Signing**, set **Team** to the available Apple ID / team shown in the dropdown.
   - If the dropdown shows "Add an Account…", skip code-signing entirely:
     uncheck **Automatically manage signing** and set **Code Signing Style** to Manual,
     leaving **Development Team** blank. The app will still build and run locally
     without a certificate using `CODE_SIGNING_ALLOWED=NO` override (see Phase 2).

Take a screenshot of the Signing & Capabilities panel before proceeding.

---

## Phase 2 — First Build

### Option A — With valid signing

Press **⌘B** (Product → Build).

### Option B — Without a signing identity (no paid Apple Developer account)

Use the menu **Product → Build With → Other Build Settings** or override via the
scheme. The simplest workaround for local testing:

1. **Product menu → Scheme → Edit Scheme** (⌘<).
2. Select the **Run** action on the left.
3. In **Arguments**, add the environment variable: `CODE_SIGNING_ALLOWED = NO`
   (Arguments Passed On Launch section).
4. Close the scheme editor and press **⌘B**.

Alternatively, build from the terminal (bypasses UI signing dialogs):

```bash
cd /Users/macbookpro/GitHub/notion-workspace/macos/NotionWorkspace
xcodebuild -scheme NotionWorkspace \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build 2>&1 | tail -40
```

### Expected build output

```
** BUILD SUCCEEDED **
```

Zero errors. Warnings are acceptable.

---

## Phase 3 — Handling Build Errors

If the build reports errors, follow the triage steps below.

### How to read the error list

- In Xcode, click the **⚠ triangle / ✗ X icon** in the toolbar to open the Issue Navigator.
- Each error shows the file, line number, and message.
- Click an error entry to jump directly to the line.

### Known issues and their fixes

All known compile errors were fixed before this session. If a new error appears,
categorize it and apply the matching fix:

---

#### Error class A — "Value of type 'X' has no member 'Y'"

**Symptom:** A property is referenced that doesn't exist on the struct.

**Fix pattern:**

1. Open the model file (e.g., `Sources/Models/AgentMessage.swift`).
2. Add the missing property with an appropriate type and default.
3. If the struct has a custom `init`, add the parameter there too (with a default
   value so all existing call sites continue to compile).
4. Press **⌘B** again.

---

#### Error class B — "Expression pattern of type 'X' cannot match values of type 'Y'"

**Symptom:** A `switch` or `case` uses an enum value that doesn't exist.

**Fix pattern:**

1. Open the enum definition (e.g., `AgentStreamEventType` in `AgentMessage.swift`).
2. Add the missing case, or rename the switch arm to match the actual enum case name.
3. If the raw value string matters for JSON decoding, use a `RawValue`:

   ```swift
   case toolStart = "tool_start"
   ```

---

#### Error class C — "Missing argument for parameter 'X' in call"

**Symptom:** A struct memberwise init call is missing required parameters.

**Fix pattern:**

Open the call site (e.g., `ActionItemsView.swift`, the `toggleStatus` function).
Add all missing parameters by copying values from the existing instance:

```swift
let copy = ActionItem(
    id: item.id,
    title: item.title,
    description: item.description,   // add missing fields
    status: newStatus,
    priority: item.priority,
    dueDate: item.dueDate,
    workspaceId: item.workspaceId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
)
```

---

#### Error class D — Type mismatch (e.g., `String` vs `Date`)

**Symptom:** "Cannot convert value of type 'String' to expected argument type 'Date'".

**Fix pattern:**

Wrap the `String` in an ISO8601 parse:

```swift
if let date = ISO8601DateFormatter().date(from: someString) {
    Text(date, style: .relative)
}
```

---

#### Error class E — Sendable / concurrency warnings promoted to errors

**Symptom:** "Sending X risks causing data races" or similar Swift 6 concurrency messages.

**Fix pattern:**

- If the error is in a closure passed across actor boundaries, annotate with `@Sendable`.
- If a `class` or `struct` needs to cross actor boundaries, conform to `Sendable`
  or mark the property `nonisolated`.
- For warnings during testing, you can temporarily reduce strictness via
  Build Settings: set **Strict Concurrency Checking** from `complete` to `targeted`.

---

## Phase 4 — Run the App

1. Confirm the scheme shows **NotionWorkspace > My Mac** in the toolbar.
   If it shows an iOS simulator or another target, click the scheme selector and
   choose **My Mac**.

2. Press **⌘R** (Product → Run).

3. The app window should appear. Take a screenshot.

**Expected first screen:** Login view with "Notion Workspace" heading, icon, and
"Sign in with Google" button.

---

## Phase 5 — Feature Testing

Perform the following tests in order. Take a screenshot after each test to document
the result. Note any failures.

---

### Test 1 — Google Sign In

**Pre-condition:** Next.js server is running, Google OAuth is configured in
`/Users/macbookpro/GitHub/notion-workspace/.env.local`.

1. Click **Sign in with Google**.
2. An `ASWebAuthenticationSession` sheet (system browser panel) should appear,
   loading `http://localhost:3000/api/auth/signin/google`.
3. Complete the Google OAuth flow in the sheet.
4. On success, the sheet closes and the app transitions to the main window with
   a `NavigationSplitView`.

**Pass criteria:** The sidebar is visible with items: Pages, Action Items, Agent,
Files, Calendar, Gmail. The user's name and email are shown in the sidebar footer.

**If the sheet does not appear:**
- Confirm `NSAllowsLocalNetworking: true` is set in `Info.plist`.
- Confirm the `notion-workspace` URL scheme is registered in `Info.plist`
  under `CFBundleURLTypes`.

**If sign-in succeeds but the app stays on the login screen:**
- Open Xcode's Debug Console (⌘⇧C) and look for errors from `AuthService`.
- The most likely cause is that `/api/auth/native-callback` is not returning the
  session cookie. Test it directly:
  ```bash
  curl -v "http://localhost:3000/api/auth/native-callback"
  ```

---

### Test 2 — Pages List

1. In the sidebar, click **Pages**.
2. The left column should populate with a list of pages from the API.
3. Click any page in the list.
4. The right pane should show a `TextEditor` with the page content.

**Pass criteria:** Pages load, title is editable, content is editable.

**CRUD test:**
1. Press **⌘N** (or click the **+** button in the toolbar).
2. Enter a title in the sheet, click **Create**.
3. The new page should appear at the top of the list and be selected.
4. Type some content, press **⌘S**.
5. The save button should briefly show a spinner, then the button disables.

---

### Test 3 — Action Items

1. Click **Action Items** in the sidebar.
2. Verify items load from the API and are displayed with priority badges.
3. Click the **+** button. Enter a title, select a priority, click **Create**.
4. The new item appears at the top.
5. Click the circle/checkbox next to an item to toggle its status.
6. The item should show a strikethrough and a green checkmark.
7. Test the filter chips: click **Pending**, **Completed**, **Cancelled**, **All**.

**Pass criteria:** Create and status-toggle both work without errors.

---

### Test 4 — Agent Chat

1. Click **Agent** in the sidebar (or press **⌘K**).
2. The empty state should show a brain/chat icon with "Ask me anything".
3. Type a message in the input field and press **Return**.
4. The user message bubble should appear immediately.
5. A loading indicator or "Thinking…" state should appear in the agent response area.
6. The agent response should stream in and complete.

**Pass criteria:** Round-trip completes without a red error bubble.

**If the agent returns an error bubble:**
- Open the Xcode Debug Console and look for the API error.
- Test the endpoint directly:
  ```bash
  curl -X POST http://localhost:3000/api/agent \
    -H "Content-Type: application/json" \
    -d '{"message":"hello","sessionId":null}'
  ```
- If this returns 401, the Bearer token is not being attached. Check
  `APIClient.makeRequest` and confirm `AuthService.shared.sessionToken()` returns
  a non-nil value from Keychain.

---

### Test 5 — File Browser

1. Click **Files** in the sidebar.
2. The browser should open at the user's home directory.
3. The breadcrumb bar at the top should show `~`.
4. Double-click a folder to navigate into it.
5. Click the back chevron (←) to navigate back.
6. Click a text file (`.txt`, `.md`, `.swift`).
7. The right pane should show the file contents in a monospaced `TextEditor`.
8. Click an image file (`.png`, `.jpg`).
9. The right pane should show the image.

**Pass criteria:** Navigation, text preview, and image preview all work without
`accessDenied` errors.

**If an `accessDenied` error appears:**
- The path is outside the allowed roots defined in `FileService.allowedRoots`.
- Allowed roots: `$HOME`, `~/GitHub`, `~/Documents`, `~/Desktop`, `~/Downloads`,
  `~/Library/CloudStorage`.
- Navigate to one of these paths.

**Quick Look test:**
1. Select any file in the browser.
2. Click the **Quick Look** button in the detail pane toolbar.
3. macOS Quick Look panel should open for the file.

---

### Test 6 — Calendar

1. Click **Calendar** in the sidebar.
2. The graphical `DatePicker` should appear on the left.
3. Today's events should load from `/api/calendar`.
4. Click a different date to load events for that day.

**Pass criteria:** Event list updates when the date changes. Each event shows
title, time range, and location if present.

**If no events load:**
- Test the endpoint: `curl -s "http://localhost:3000/api/calendar?date=$(date +%Y-%m-%d)"`
- Ensure the Google Calendar scope was granted during sign-in.

---

### Test 7 — Gmail

1. Click **Gmail** in the sidebar.
2. The thread list should load from `/api/gmail?maxResults=50`.
3. Unread threads should have a filled accent-color dot.
4. Type in the search field to filter by subject/sender.
5. Click a thread to see the detail pane.

**Pass criteria:** Thread list loads, search filters correctly, detail pane shows
subject, from, snippet, and a "Open in Gmail →" link.

---

### Test 8 — Settings

1. Open **Notion Workspace → Settings** (⌘,) or use the Settings window.
2. **Account tab:** Verify the signed-in user's name and email appear.
3. **General tab:** Verify the API Base URL field shows `http://localhost:3000`.
   Change it to `http://localhost:3001`, then back to `http://localhost:3000`.
   The value should persist across tab switches (uses `@AppStorage`).
4. **About tab:** Verify the version string and description are displayed.
5. **Account tab:** Click **Sign Out**. A confirmation dialog should appear.
   Click **Cancel** — you should remain signed in.

---

### Test 9 — Keyboard Shortcuts

| Shortcut | Expected action                          |
|----------|------------------------------------------|
| ⌘N       | Opens "New Page" sheet                   |
| ⌘K       | Navigates sidebar to Agent Chat          |
| ⌘S       | Saves current page (when Page is focused) |
| ⌘,       | Opens Settings window                    |
| ⌘Q       | Quits the app                            |

---

### Test 10 — Graceful Quit

1. With the app running, press **⌘Q**.
2. The app should quit cleanly.
3. Confirm the session token persists in Keychain across restarts:
   - Re-launch with **⌘R** in Xcode.
   - The app should skip the login screen and go directly to the main window.

**Pass criteria:** Re-launch shows the sidebar immediately without repeating OAuth.

---

## Phase 6 — Regression: Web App

After native app testing is complete, confirm the web app is unaffected:

```bash
cd /Users/macbookpro/GitHub/notion-workspace
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -5
```

Expected:
```
** 0 errors
All matched files use Prettier code style!
```

---

## Reporting

After completing all tests, produce a summary with this structure:

```
## NotionWorkspace macOS App — Test Report
Date: <date>

### Build
- Status: PASS / FAIL
- Errors fixed: <list any you fixed>
- Warnings: <count>

### Feature Tests
| Feature        | Status | Notes |
|----------------|--------|-------|
| Sign In        | PASS / FAIL | |
| Pages          | PASS / FAIL | |
| Action Items   | PASS / FAIL | |
| Agent Chat     | PASS / FAIL | |
| File Browser   | PASS / FAIL | |
| Calendar       | PASS / FAIL | |
| Gmail          | PASS / FAIL | |
| Settings       | PASS / FAIL | |
| Shortcuts      | PASS / FAIL | |
| Persist Login  | PASS / FAIL | |

### Web App Regression
- npm run build: PASS / FAIL
- npm run lint:  PASS / FAIL

### Issues Found
<numbered list of any issues not resolved>
```

---

## Reference — Key File Paths

| Component             | Path                                                                 |
|-----------------------|----------------------------------------------------------------------|
| App entry point       | `Sources/App/NotionWorkspaceApp.swift`                               |
| Root view             | `Sources/App/ContentView.swift`                                      |
| Auth service          | `Sources/Services/AuthService.swift`                                 |
| API client            | `Sources/Services/APIClient.swift`                                   |
| File service          | `Sources/Services/FileService.swift`                                 |
| Shell service         | `Sources/Services/ShellService.swift`                                |
| Agent stream handler  | `Sources/Views/Agent/AgentStreamHandler.swift`                       |
| Tiptap renderer       | `Sources/Utils/TiptapRenderer.swift`                                 |
| Entitlements          | `Resources/NotionWorkspace.entitlements`                             |
| xcodegen config       | `project.yml`                                                        |
| OAuth callback route  | `../../src/app/api/auth/native-callback/route.ts`                    |
| Regenerate project    | `cd macos/NotionWorkspace && xcodegen generate`                      |
