import SwiftUI

struct GmailThread: Identifiable, Decodable, Sendable {
    let id: String
    let subject: String
    let from: String
    let snippet: String
    let date: String
    let isRead: Bool
    let labels: [String]

    enum CodingKeys: String, CodingKey {
        case id, subject, from, snippet, date, labels
        case isRead = "is_read"
    }
}

struct GmailView: View {
    @State private var threads: [GmailThread] = []
    @State private var selectedThread: GmailThread?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var searchQuery = ""

    private var displayedThreads: [GmailThread] {
        guard !searchQuery.isEmpty else { return threads }
        let q = searchQuery.lowercased()
        return threads.filter {
            $0.subject.lowercased().contains(q) ||
            $0.from.lowercased().contains(q) ||
            $0.snippet.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                searchBar

                Divider()

                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if displayedThreads.isEmpty {
                    ContentUnavailableView(
                        searchQuery.isEmpty ? "No Messages" : "No Results",
                        systemImage: "envelope",
                        description: searchQuery.isEmpty ? Text("Your inbox is empty.") : Text("Try a different search term.")
                    )
                } else {
                    List(displayedThreads, selection: $selectedThread) { thread in
                        ThreadRow(thread: thread)
                            .tag(thread)
                    }
                    .listStyle(.inset)
                }
            }
            .navigationTitle("Gmail")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { Task { await loadThreads() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh")
                }
            }
        } detail: {
            if let thread = selectedThread {
                ThreadDetailView(thread: thread)
            } else {
                ContentUnavailableView("Select a Message", systemImage: "envelope")
            }
        }
        .task { await loadThreads() }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search messages", text: $searchQuery)
                .textFieldStyle(.plain)
            if !searchQuery.isEmpty {
                Button { searchQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func loadThreads() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let url = URL(string: "http://localhost:3000/api/gmail?maxResults=50")!
            var request = URLRequest(url: url)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let token = AuthService.shared.sessionToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let (data, _) = try await URLSession.shared.data(for: request)
            struct Resp: Decodable { let threads: [GmailThread] }
            threads = try JSONDecoder().decode(Resp.self, from: data).threads
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: – Thread Row

struct ThreadRow: View {
    let thread: GmailThread

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(thread.isRead ? Color.clear : Color.accentColor)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(thread.from)
                        .font(thread.isRead ? .callout : .callout.bold())
                        .lineLimit(1)
                    Spacer()
                    Text(formattedDate)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(thread.subject.isEmpty ? "(no subject)" : thread.subject)
                    .font(thread.isRead ? .body : .body.bold())
                    .lineLimit(1)

                Text(thread.snippet)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }

    private var formattedDate: String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fmt2 = ISO8601DateFormatter()
        fmt2.formatOptions = [.withInternetDateTime]
        if let date = fmt.date(from: thread.date) ?? fmt2.date(from: thread.date) {
            let df = DateFormatter()
            if Calendar.current.isDateInToday(date) {
                df.timeStyle = .short
                df.dateStyle = .none
            } else {
                df.timeStyle = .none
                df.dateStyle = .short
            }
            return df.string(from: date)
        }
        return thread.date
    }
}

// MARK: – Thread Detail

struct ThreadDetailView: View {
    let thread: GmailThread

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(thread.subject.isEmpty ? "(no subject)" : thread.subject)
                    .font(.title2.bold())

                HStack {
                    Text("From:")
                        .foregroundStyle(.secondary)
                    Text(thread.from)
                }
                .font(.callout)

                Divider()

                Text(thread.snippet)
                    .font(.body)
                    .textSelection(.enabled)

                Link("Open in Gmail →", destination: URL(string: "https://mail.google.com/mail/u/0/#inbox/\(thread.id)")!)
                    .font(.callout)
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(thread.subject.isEmpty ? "(no subject)" : thread.subject)
    }
}
