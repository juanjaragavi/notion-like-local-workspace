## NotionWorkspace macOS App — Test Report
Date: 2026-03-12

### Build
- Status: **PASS**
- Toolchain: Swift 6.2.4 / Xcode 26.3 / macOS 26 (Tahoe beta) / macOS 26.2 SDK
- Signing: `CODE_SIGNING_ALLOWED=NO` (no paid Developer account; ad-hoc local build)
- Warnings: 2 (both non-blocking — see below)

**Errors fixed (6 total):**

1. `FileBrowserView.swift:100` — Tuple destructuring in closure parameter (`idx, (name, path) in`) removed in Swift 6. Fixed by introducing an intermediate `let (name, path) = element`.
2. `SettingsView.swift`, `ContentView.swift`, `AgentChatView.swift`, `FileBrowserView.swift` — `.accent` ShapeStyle shorthand removed from macOS 26 SDK. Replaced with `Color.accentColor` throughout.
3. `APIClient.swift` — `makeRequest` called `AuthService.shared.sessionToken()` synchronously from inside an `actor`, crossing a `@MainActor` boundary (Swift 6 strict concurrency). Fixed by extracting a file-scope `nonisolated` Keychain reader (`keychainSessionToken()`) and adding `import Security`.
4. `AuthService.swift` — `sessionToken()`, `saveTokenToKeychain()`, `loadTokenFromKeychain()`, `deleteTokenFromKeychain()` marked `nonisolated` (all use Security framework only, no actor-isolated state).
5. `GmailView.swift` — `GmailThread` missing `Hashable` conformance required by `List(_:selection:rowContent:)` and `.tag(_:)`. Added `Hashable`.
6. `Page.swift`, `FileService.swift`, `ContentView.swift` — Same `Hashable` requirement for `Page`, `FileService.FileItem`, and `SidebarItem`. Added `Hashable` to all three.

**Remaining warnings:**
- `FileService.swift:40` — Spurious `try` expression with no throwing call. Non-blocking; can be cleaned up separately.
- `appintentsmetadataprocessor` — No AppIntents.framework dependency found. Expected for this target; not actionable.

---

### Feature Tests

| Feature        | Status | Notes |
|----------------|--------|-------|
| Sign In        | CANNOT TEST | Requires display + Google OAuth interactive flow. ASWebAuthenticationSession, URL scheme, and Info.plist config are correctly in place. `http://localhost:3000/api/auth/signin/google` returns HTTP 200. |
| Pages          | CANNOT TEST | Requires authenticated session. API endpoint `/api/pages` returns HTTP 401 without Bearer token (correct). |
| Action Items   | CANNOT TEST | Requires authenticated session. `/api/action-items` returns HTTP 401 (correct). |
| Agent Chat     | CANNOT TEST | Requires authenticated session. `/api/agent` returns HTTP 401 (correct). |
| File Browser   | CANNOT TEST | Requires display. FileService logic verified by code review — `allowedRoots`, path traversal, and `Hashable` conformance all correct. |
| Calendar       | CANNOT TEST | Requires display + Google Calendar scope. `/api/calendar` returns HTTP 401 (correct). |
| Gmail          | CANNOT TEST | Requires display + Gmail scope. `/api/gmail` returns HTTP 401 (correct). |
| Settings       | CANNOT TEST | Requires display. `@AppStorage`, `ConfirmationDialog`, and `EnvironmentObject` wiring verified by code review. |
| Shortcuts      | CANNOT TEST | Requires display. `CommandGroup` definitions in `NotionWorkspaceApp.swift` verified correct (⌘N, ⌘K, ⌘S, ⌘,, ⌘Q). |
| Persist Login  | CANNOT TEST | Requires display + prior sign-in. Keychain read on `init()` is correctly implemented in `AuthService`. |

**Note:** All feature tests require an interactive macOS display session and a completed Google OAuth flow. The VM environment has no display (`screencapture` returns "could not create image from display"). The app binary **did launch successfully** (PID 65723 confirmed running). Manual verification in the Xcode-connected Mac session is required to exercise OAuth and UI flows.

---

### API Endpoint Verification (unauthenticated)

All endpoints correctly enforce authentication:

| Endpoint | Expected | Actual |
|----------|----------|--------|
| GET /api/pages | 401 | 401 ✓ |
| GET /api/action-items | 401 | 401 ✓ |
| GET /api/gmail | 401 | 401 ✓ |
| GET /api/calendar | 401 | 401 ✓ |
| POST /api/agent | 401 | 401 ✓ |
| GET /api/health | 200 | 200 ✓ (degraded: Google token reauth required — pre-existing config issue) |

---

### Web App Regression

| Check | Status | Notes |
|-------|--------|-------|
| `npm run build` | **PASS** | Exit 0, no TypeScript errors |
| `npm run lint` (ESLint) | **PASS** | No ESLint violations |
| `npm run lint` (Prettier) | **PASS** | "All matched files use Prettier code style!" |

---

### Issues Found

1. **No display in CI/VM environment** — All 10 UI feature tests require manual execution in an interactive macOS session with the app open in Xcode. Build and API-level verification are the extent of what is automatable from this environment.

2. **Google token `invalid_grant` in health check** — `/api/health` reports `database: error: invalid_grant (invalid_rapt)`. This is a pre-existing OAuth token expiry issue on the server side unrelated to the native app build. Re-authorizing the Google service account in the Next.js `.env.local` will resolve it.

3. **`presentationAnchor` concurrency warning** — `AuthService.swift:110`: `NSApplication.shared.windows` is `@MainActor`-isolated, called from `nonisolated presentationAnchor(for:)`. This is a warning only (not an error) in the current SDK, but should be addressed with `MainActor.assumeIsolated` or by restructuring the window lookup to avoid the isolation crossing.
