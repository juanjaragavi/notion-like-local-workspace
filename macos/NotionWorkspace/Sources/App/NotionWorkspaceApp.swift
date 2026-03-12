import SwiftUI

@main
struct NotionWorkspaceApp: App {
    @StateObject private var auth = AuthService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Page") {
                    NotificationCenter.default.post(name: .newPage, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .newItem) {
                Button("Open Agent Chat") {
                    NotificationCenter.default.post(name: .openAgentChat, object: nil)
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(auth)
        }
    }
}

extension Notification.Name {
    static let newPage = Notification.Name("com.topnetworks.notion-workspace.newPage")
    static let openAgentChat = Notification.Name("com.topnetworks.notion-workspace.openAgentChat")
}
