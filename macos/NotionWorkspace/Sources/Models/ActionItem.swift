import Foundation

struct ActionItem: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let description: String?
    let status: ActionItemStatus
    let priority: ActionItemPriority
    let dueDate: String?
    let workspaceId: String
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, priority
        case dueDate = "due_date"
        case workspaceId = "workspace_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

enum ActionItemStatus: String, Codable, Sendable, CaseIterable {
    case pending, completed, cancelled
}

enum ActionItemPriority: String, Codable, Sendable, CaseIterable {
    case low, medium, high
}

struct ActionItemListResponse: Codable, Sendable {
    let items: [ActionItem]
}
