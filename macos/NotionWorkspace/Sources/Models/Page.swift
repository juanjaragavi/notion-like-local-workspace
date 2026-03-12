import Foundation

struct Page: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    let content: String?
    let workspaceId: String
    let createdAt: String
    let updatedAt: String
    let archived: Int

    enum CodingKeys: String, CodingKey {
        case id, title, content, archived
        case workspaceId = "workspace_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct PageListResponse: Codable, Sendable {
    let pages: [Page]
}

struct PageResponse: Codable, Sendable {
    let page: Page
}
