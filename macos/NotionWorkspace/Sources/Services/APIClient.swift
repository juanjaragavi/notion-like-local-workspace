import Foundation

/// URLSession-based client for all calls to the Next.js web API.
/// Attaches the session token from Keychain as a Bearer header on every request.
actor APIClient {
    static let shared = APIClient()
    private let baseURL = "http://localhost:3000"
    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private init() {}

    // MARK: – Pages

    func listPages() async throws -> [Page] {
        let response: PageListResponse = try await get("/api/pages")
        return response.pages
    }

    func createPage(title: String, content: String = "") async throws -> Page {
        struct Body: Encodable { let title: String; let content: String }
        let response: PageResponse = try await post("/api/pages", body: Body(title: title, content: content))
        return response.page
    }

    func updatePage(id: String, title: String, content: String) async throws -> Page {
        struct Body: Encodable { let title: String; let content: String }
        let response: PageResponse = try await patch("/api/pages/\(id)", body: Body(title: title, content: content))
        return response.page
    }

    // MARK: – Action Items

    func listActionItems() async throws -> [ActionItem] {
        let response: ActionItemListResponse = try await get("/api/action-items")
        return response.items
    }

    func createActionItem(title: String, priority: ActionItemPriority = .medium, dueDate: String? = nil) async throws -> ActionItem {
        struct Body: Encodable {
            let title: String
            let priority: String
            let dueDate: String?
            enum CodingKeys: String, CodingKey { case title, priority, dueDate = "due_date" }
        }
        struct Resp: Decodable { let item: ActionItem }
        let response: Resp = try await post("/api/action-items", body: Body(title: title, priority: priority.rawValue, dueDate: dueDate))
        return response.item
    }

    func updateActionItem(id: String, status: ActionItemStatus) async throws {
        struct Body: Encodable { let status: String }
        let _: EmptyResponse = try await patch("/api/action-items/\(id)", body: Body(status: status.rawValue))
    }

    // MARK: – Agent

    func sendAgentMessage(
        message: String,
        sessionId: String?,
        onEvent: @escaping @Sendable (AgentStreamEvent) -> Void
    ) async throws {
        guard let url = URL(string: "\(baseURL)/api/agent") else { throw APIError.invalidURL }
        var request = makeRequest(url: url, method: "POST")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        struct Body: Encodable { let message: String; let sessionId: String? }
        request.httpBody = try JSONEncoder().encode(Body(message: message, sessionId: sessionId))

        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.requestFailed(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let json = String(line.dropFirst(6))
            if json == "[DONE]" { break }
            guard let data = json.data(using: .utf8),
                  let event = try? JSONDecoder().decode(AgentStreamEvent.self, from: data)
            else { continue }
            onEvent(event)
        }
    }

    // MARK: – Generic HTTP

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        let (data, response) = try await session.data(for: makeRequest(url: url, method: "GET"))
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        var request = makeRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func patch<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        var request = makeRequest(url: url, method: "PATCH")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    private func makeRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = AuthService.shared.sessionToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.requestFailed(statusCode: http.statusCode)
        }
    }
}

struct EmptyResponse: Decodable {}

enum APIError: LocalizedError {
    case invalidURL, invalidResponse, requestFailed(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid URL"
        case .invalidResponse: "Invalid response"
        case .requestFailed(let code): "Request failed with status \(code)"
        }
    }
}
