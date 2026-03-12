import SwiftUI

struct AgentChatView: View {
    @StateObject private var handler = AgentStreamHandler()
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    @Namespace private var bottomID

    var body: some View {
        VStack(spacing: 0) {
            if handler.messages.isEmpty {
                emptyState
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(handler.messages) { msg in
                                ChatBubble(message: msg)
                                    .id(msg.id)
                            }

                            if handler.isStreaming && !handler.streamingContent.isEmpty {
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "brain")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text(handler.streamingContent)
                                        .font(.callout)
                                        .foregroundStyle(.secondary)
                                        .italic()
                                }
                                .padding(.horizontal, 16)
                            }

                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.vertical, 12)
                    }
                    .onChange(of: handler.messages.count) {
                        withAnimation { proxy.scrollTo("bottom") }
                    }
                }
            }

            Divider()

            inputBar
        }
        .navigationTitle("Agent")
        .toolbar {
            ToolbarItem {
                Button {
                    handler.clear()
                } label: {
                    Image(systemName: "trash")
                }
                .help("Clear conversation")
                .disabled(handler.messages.isEmpty)
            }
        }
        .onAppear { inputFocused = true }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Ask me anything")
                .font(.title2.bold())
            Text("I can help with your pages, emails, calendar events, and tasks.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextEditor(text: $inputText)
                .font(.body)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 36, maxHeight: 120)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .focused($inputFocused)
                .onKeyPress(.return) {
                    if NSEvent.modifierFlags.contains(.shift) {
                        return .ignored // Allow shift+return for newline
                    }
                    sendMessage()
                    return .handled
                }

            Button {
                sendMessage()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(canSend ? .accent : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespaces).isEmpty && !handler.isStreaming
    }

    private func sendMessage() {
        guard canSend else { return }
        let text = inputText
        inputText = ""
        Task { await handler.send(text) }
    }
}

// MARK: – Chat Bubble

struct ChatBubble: View {
    let message: AgentMessage

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if message.role == .user { Spacer(minLength: 64) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                if message.isThinking == true {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.mini)
                        Text("Thinking…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text(message.content)
                        .textSelection(.enabled)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(bubbleBackground)
                        .foregroundStyle(message.role == .user ? .white : .primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            if message.role != .user { Spacer(minLength: 64) }
        }
        .padding(.horizontal, 16)
    }

    private var bubbleBackground: Color {
        switch message.role {
        case .user: .accentColor
        case .tool: Color.secondary.opacity(0.12)
        case .system: Color.red.opacity(0.12)
        default: Color.secondary.opacity(0.08)
        }
    }
}
