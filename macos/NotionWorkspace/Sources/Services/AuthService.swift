import AppKit
import AuthenticationServices
import Foundation
import Security

/// Manages Google OAuth via ASWebAuthenticationSession and persists the
/// NextAuth session cookie in the Keychain.
@MainActor
final class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private let baseURL = "http://localhost:3000"
    private let keychainService = "com.topnetworks.notion-workspace"
    private let keychainAccount = "session-token"

    override private init() {
        super.init()
        // Restore token from Keychain on launch
        if loadTokenFromKeychain() != nil {
            isAuthenticated = true
        }
    }

    // MARK: – Sign In

    func signIn() async throws {
        // NextAuth v5 requires a CSRF token for the POST that initiates the
        // provider OAuth redirect.  We must:
        //   1. GET /api/auth/csrf  → receive csrfToken JSON + csrf cookie
        //   2. POST /api/auth/signin/google with csrfToken + callbackUrl
        //      → server responds 302 with Location: accounts.google.com/...
        //   3. Open that Google authorization URL in ASWebAuthenticationSession
        //      → after OAuth completes, Google redirects to
        //        /api/auth/callback/google → native-callback →
        //        notion-workspace://auth?token=<session-token>
        //   4. ASWebAuthenticationSession intercepts the custom-scheme redirect
        //      and delivers the URL to our completion handler.

        let callbackURL = "\(baseURL)/api/auth/native-callback"

        // --- Step 1: fetch CSRF token + cookie ---
        guard let csrfURL = URL(string: "\(baseURL)/api/auth/csrf") else {
            throw AuthError.invalidURL
        }
        let csrfSession = URLSession(configuration: .ephemeral)
        let (csrfData, _) = try await csrfSession.data(from: csrfURL)

        struct CSRFResponse: Decodable { let csrfToken: String }
        let csrfResponse = try JSONDecoder().decode(CSRFResponse.self, from: csrfData)
        let csrfToken = csrfResponse.csrfToken

        // The csrf cookie was stored in csrfSession's cookie jar automatically.

        // --- Step 2: POST to initiate Google OAuth, capture the redirect URL ---
        guard let signinURL = URL(string: "\(baseURL)/api/auth/signin/google") else {
            throw AuthError.invalidURL
        }
        var postRequest = URLRequest(url: signinURL)
        postRequest.httpMethod = "POST"
        postRequest.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let encodedCallback = callbackURL
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? callbackURL
        postRequest.httpBody = "csrfToken=\(csrfToken)&callbackUrl=\(encodedCallback)".data(using: .utf8)

        // Do NOT follow the redirect — we want the Location header (Google OAuth URL).
        let noRedirectConfig = URLSessionConfiguration.ephemeral
        let noRedirectSession = URLSession(
            configuration: noRedirectConfig,
            delegate: NoRedirectDelegate(),
            delegateQueue: nil
        )
        // Copy csrf cookie into the no-redirect session's jar
        if let cookies = csrfSession.configuration.httpCookieStorage?.cookies {
            noRedirectSession.configuration.httpCookieStorage?.setCookies(
                cookies, for: signinURL, mainDocumentURL: nil
            )
        }
        let (_, redirectResponse) = try await noRedirectSession.data(for: postRequest)
        guard
            let httpRedirect = redirectResponse as? HTTPURLResponse,
            let locationString = httpRedirect.value(forHTTPHeaderField: "Location"),
            let googleAuthURL = URL(string: locationString)
        else {
            throw AuthError.oauthRedirectFailed
        }

        // --- Step 3: open the Google authorization URL in ASWebAuthenticationSession ---
        let weakSelf = WeakRef(self)
        let authSession = ASWebAuthenticationSession(
            url: googleAuthURL,
            callbackURLScheme: "notion-workspace"
        ) { callbackURL, error in
            let capturedURL = callbackURL
            let capturedError = error
            Task.detached {
                await MainActor.run {
                    guard let auth = weakSelf.value else { return }
                    if let err = capturedError {
                        if (err as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return }
                        return
                    }
                    guard
                        let url = capturedURL,
                        let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                        let token = components.queryItems?.first(where: { $0.name == "token" })?.value
                    else { return }

                    auth.saveTokenToKeychain(token)
                    auth.isAuthenticated = true
                    Task { try? await auth.fetchCurrentUser() }
                }
            }
        }
        authSession.presentationContextProvider = self
        authSession.prefersEphemeralWebBrowserSession = false
        authSession.start()
    }

    // MARK: – Sign Out

    func signOut() {
        deleteTokenFromKeychain()
        isAuthenticated = false
        currentUser = nil
    }

    // MARK: – Token Access

    nonisolated func sessionToken() -> String? {
        loadTokenFromKeychain()
    }

    // MARK: – Current User

    func fetchCurrentUser() async throws {
        guard let token = sessionToken() else { throw AuthError.notAuthenticated }
        guard let url = URL(string: "\(baseURL)/api/auth/session") else { throw AuthError.invalidURL }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AuthError.requestFailed
        }

        struct SessionResponse: Decodable {
            struct SessionUser: Decodable {
                let id: String?
                let name: String?
                let email: String?
                let image: String?
            }
            let user: SessionUser?
        }

        let decoded = try JSONDecoder().decode(SessionResponse.self, from: data)
        if let u = decoded.user {
            currentUser = User(id: u.id ?? "", name: u.name, email: u.email, image: u.image)
        }
    }

    // MARK: – ASWebAuthenticationPresentationContextProviding

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // ASWebAuthenticationPresentationContextProviding requires nonisolated,
        // but NSApplication.shared is @MainActor.  Use assumeIsolated since this
        // callback is always invoked on the main thread by AuthenticationServices.
        MainActor.assumeIsolated {
            NSApplication.shared.windows.first ?? ASPresentationAnchor()
        }
    }

    // MARK: – Keychain Helpers

    nonisolated private func saveTokenToKeychain(_ token: String) {
        let data = Data(token.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
            kSecValueData: data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    nonisolated private func loadTokenFromKeychain() -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    nonisolated private func deleteTokenFromKeychain() {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// A Sendable weak-reference wrapper that lets non-isolated closures hold a
/// weak pointer to a @MainActor object without triggering Swift 6 isolation
/// violations.  Only dereference `.value` from the MainActor.
final class WeakRef<T: AnyObject>: @unchecked Sendable {
    private(set) weak var value: T?
    init(_ value: T) { self.value = value }
}

enum AuthError: LocalizedError {
    case invalidURL, notAuthenticated, requestFailed, oauthRedirectFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid URL"
        case .notAuthenticated: "Not authenticated"
        case .requestFailed: "Request failed"
        case .oauthRedirectFailed: "OAuth redirect failed — check server logs"
        }
    }
}

/// URLSession delegate that prevents automatic redirect-following so we can
/// capture the Location header from NextAuth's POST /signin/google response.
private final class NoRedirectDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest
    ) async -> URLRequest? {
        // Return nil to block the redirect — caller reads Location from `response`.
        return nil
    }
}
