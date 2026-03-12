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
        guard let signInURL = URL(string: "\(baseURL)/api/auth/signin/google?callbackUrl=\(baseURL)/api/auth/native-callback") else {
            throw AuthError.invalidURL
        }
        guard let callbackScheme = URL(string: "notion-workspace://auth") else {
            throw AuthError.invalidURL
        }

        let session = ASWebAuthenticationSession(
            url: signInURL,
            callbackURLScheme: callbackScheme.scheme
        ) { [weak self] callbackURL, error in
            guard let self else { return }
            Task { @MainActor in
                if let error {
                    if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return }
                    return
                }
                guard let callbackURL,
                      let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                      let token = components.queryItems?.first(where: { $0.name == "token" })?.value
                else { return }

                self.saveTokenToKeychain(token)
                self.isAuthenticated = true
                try? await self.fetchCurrentUser()
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }

    // MARK: – Sign Out

    func signOut() {
        deleteTokenFromKeychain()
        isAuthenticated = false
        currentUser = nil
    }

    // MARK: – Token Access

    func sessionToken() -> String? {
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
        NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }

    // MARK: – Keychain Helpers

    private func saveTokenToKeychain(_ token: String) {
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

    private func loadTokenFromKeychain() -> String? {
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

    private func deleteTokenFromKeychain() {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum AuthError: LocalizedError {
    case invalidURL, notAuthenticated, requestFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid URL"
        case .notAuthenticated: "Not authenticated"
        case .requestFailed: "Request failed"
        }
    }
}
