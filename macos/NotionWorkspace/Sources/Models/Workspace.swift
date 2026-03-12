import Foundation

struct Workspace: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let ownerId: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case ownerId = "owner_id"
    }
}
