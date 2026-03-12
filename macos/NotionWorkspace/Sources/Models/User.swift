import Foundation

struct User: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let email: String?
    let image: String?
}
