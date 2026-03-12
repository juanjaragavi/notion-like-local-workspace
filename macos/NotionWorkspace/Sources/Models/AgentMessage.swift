import Foundation

struct AgentMessage: Codable, Identifiable, Sendable {
    let id: String
    let role: AgentRole
    let content: String
    let timestamp: String

    init(id: String = UUID().uuidString, role: AgentRole, content: String) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = ISO8601DateFormatter().string(from: Date())
    }
}

enum AgentRole: String, Codable, Sendable {
    case user, agent, system, tool
}

// SSE stream event types from the web API
struct AgentStreamEvent: Codable, Sendable {
    let type: AgentStreamEventType
    let data: AgentStreamEventData
}

enum AgentStreamEventType: String, Codable, Sendable {
    case status, tool_start, tool_complete, thinking, done, error
}

struct AgentStreamEventData: Codable, Sendable {
    let phase: String?
    let message: String?
    let tool: String?
    let content: String?
    let sessionId: String?
    let round: Int?
    let maxRounds: Int?
    let success: Bool?
    let error: String?
}
