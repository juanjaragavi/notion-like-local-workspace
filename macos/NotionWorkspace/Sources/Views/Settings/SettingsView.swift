import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthService
    @AppStorage("apiBaseURL") private var apiBaseURL = "http://localhost:3000"
    @AppStorage("agentAutoScroll") private var agentAutoScroll = true
    @AppStorage("showFileSizes") private var showFileSizes = true
    @State private var showSignOutConfirm = false

    var body: some View {
        TabView {
            accountTab
                .tabItem { Label("Account", systemImage: "person.circle") }

            generalTab
                .tabItem { Label("General", systemImage: "gear") }

            aboutTab
                .tabItem { Label("About", systemImage: "info.circle") }
        }
        .padding(20)
        .frame(width: 480, height: 320)
    }

    // MARK: – Account

    private var accountTab: some View {
        Form {
            if let user = auth.currentUser {
                Section("Signed In") {
                    LabeledContent("Name") {
                        Text(user.name ?? "—")
                            .foregroundStyle(.secondary)
                    }
                    LabeledContent("Email") {
                        Text(user.email ?? "—")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        showSignOutConfirm = true
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
            } else {
                Text("Not signed in.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .confirmationDialog("Sign out of Notion Workspace?", isPresented: $showSignOutConfirm) {
            Button("Sign Out", role: .destructive) { auth.signOut() }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: – General

    private var generalTab: some View {
        Form {
            Section("API") {
                LabeledContent("Base URL") {
                    TextField("http://localhost:3000", text: $apiBaseURL)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 220)
                }
            }

            Section("Agent Chat") {
                Toggle("Auto-scroll to new messages", isOn: $agentAutoScroll)
            }

            Section("File Browser") {
                Toggle("Show file sizes", isOn: $showFileSizes)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: – About

    private var aboutTab: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.accentColor)

            Text("Notion Workspace")
                .font(.title2.bold())

            Text("Version 1.0.0")
                .foregroundStyle(.secondary)

            Text("A native macOS companion for your personal workspace.\nConnects to your local Next.js server for cloud data.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .font(.callout)

            Link("topnetworks.co", destination: URL(string: "https://topnetworks.co")!)
                .font(.callout)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
