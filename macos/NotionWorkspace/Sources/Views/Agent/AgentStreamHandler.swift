import Foundation

/// Drives an SSE-based agent conversation, publishing events on the main actor.
@MainActor
final class AgentStreamHandler: ObservableObject {
    @Published var messages: [AgentMessage] = []
    @Published var isStreaming = false
    @Published var currentSessionId: String?
    @Published var streamingContent: String = ""

    func send(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        // Append the user message immediately
        let userMsg = AgentMessage(role: .user, content: text)
        messages.append(userMsg)
        isStreaming = true
        streamingContent = ""

        // Placeholder for the agent response
        var agentMsg = AgentMessage(role: .agent, content: "")
        messages.append(agentMsg)
        let agentIndex = messages.count - 1

        do {
            try await APIClient.shared.sendAgentMessage(
                message: text,
                sessionId: currentSessionId
            ) { [weak self] event in
                guard let self else { return }
                Task { @MainActor in
                    self.handleEvent(event, agentIndex: agentIndex, agentMsg: &agentMsg)
                }
            }
        } catch {
            messages[agentIndex] = AgentMessage(
                id: agentMsg.id,
                role: .system,
                content: "Error: \(error.localizedDescription)"
            )
        }

        isStreaming = false
        streamingContent = ""
    }

    private func handleEvent(_ event: AgentStreamEvent, agentIndex: Int, agentMsg: inout AgentMessage) {
        switch event.type {
        case .sessionId:
            if let sid = event.data?.sessionId {
                currentSessionId = sid
            }
        case .thinking:
            // Show thinking indicator
            messages[agentIndex] = AgentMessage(
                id: agentMsg.id,
                role: .agent,
                content: agentMsg.content,
                isThinking: true
            )
        case .toolStart:
            if let tool = event.data?.tool {
                let indicator = AgentMessage(
                    role: .tool,
                    content: "Using tool: \(tool)"
                )
                messages.insert(indicator, at: agentIndex)
            }
        case .toolComplete:
            break
        case .done:
            if let text = event.data?.content, !text.isEmpty {
                agentMsg = AgentMessage(
                    id: agentMsg.id,
                    role: .agent,
                    content: text
                )
                messages[agentIndex] = agentMsg
            }
            streamingContent = ""
        case .error:
            messages[agentIndex] = AgentMessage(
                id: agentMsg.id,
                role: .system,
                content: "Agent error: \(event.data?.content ?? "Unknown")"
            )
        case .status:
            if let content = event.data?.content {
                streamingContent = content
            }
        }
    }

    func clear() {
        messages = []
        currentSessionId = nil
        streamingContent = ""
        isStreaming = false
    }
}
