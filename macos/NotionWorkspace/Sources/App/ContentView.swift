import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case pages = "Pages"
    case actionItems = "Action Items"
    case agent = "Agent"
    case files = "Files"
    case calendar = "Calendar"
    case gmail = "Gmail"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .pages: "doc.text"
        case .actionItems: "checkmark.circle"
        case .agent: "bubble.left.and.bubble.right"
        case .files: "folder"
        case .calendar: "calendar"
        case .gmail: "envelope"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var auth: AuthService
    @State private var selectedItem: SidebarItem? = .pages

    var body: some View {
        if auth.isAuthenticated {
            mainContent
        } else {
            LoginView()
        }
    }

    private var mainContent: some View {
        NavigationSplitView {
            SidebarView(selection: $selectedItem)
        } detail: {
            Group {
                switch selectedItem {
                case .pages, .none:
                    PagesListView()
                case .actionItems:
                    ActionItemsView()
                case .agent:
                    AgentChatView()
                case .files:
                    FileBrowserView()
                case .calendar:
                    CalendarView()
                case .gmail:
                    GmailView()
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onReceive(NotificationCenter.default.publisher(for: .openAgentChat)) { _ in
            selectedItem = .agent
        }
    }
}

// MARK: – Login placeholder

struct LoginView: View {
    @EnvironmentObject private var auth: AuthService
    @State private var isSigningIn = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 64))
                .foregroundStyle(.accent)

            Text("Notion Workspace")
                .font(.largeTitle.bold())

            Text("Sign in with your Google account to continue.")
                .foregroundStyle(.secondary)

            if let error = errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.callout)
            }

            Button {
                isSigningIn = true
                errorMessage = nil
                Task {
                    do {
                        try await auth.signIn()
                    } catch {
                        errorMessage = error.localizedDescription
                    }
                    isSigningIn = false
                }
            } label: {
                Label(isSigningIn ? "Signing in…" : "Sign in with Google", systemImage: "person.badge.key")
                    .frame(minWidth: 220)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isSigningIn)
        }
        .padding(48)
        .frame(minWidth: 480, minHeight: 360)
    }
}
