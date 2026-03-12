import SwiftUI

struct PagesListView: View {
    @State private var pages: [Page] = []
    @State private var selectedPage: Page?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isCreating = false
    @State private var newPageTitle = ""
    @State private var showingNewPage = false

    var body: some View {
        NavigationSplitView {
            Group {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if pages.isEmpty {
                    ContentUnavailableView("No Pages", systemImage: "doc.text", description: Text("Create a page to get started."))
                } else {
                    List(pages, selection: $selectedPage) { page in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(page.title)
                                .font(.body)
                                .lineLimit(1)
                            if let updated = page.updatedAt {
                                Text(updated, style: .relative)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                        .tag(page)
                    }
                    .listStyle(.sidebar)
                }
            }
            .navigationTitle("Pages")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewPage = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .help("New Page (⌘N)")
                }
                ToolbarItem {
                    Button {
                        Task { await loadPages() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh")
                }
            }
        } detail: {
            if let page = selectedPage {
                PageDetailView(page: page) { updated in
                    if let idx = pages.firstIndex(where: { $0.id == updated.id }) {
                        pages[idx] = updated
                    }
                }
            } else {
                ContentUnavailableView("Select a Page", systemImage: "doc.text")
            }
        }
        .task { await loadPages() }
        .onReceive(NotificationCenter.default.publisher(for: .newPage)) { _ in
            showingNewPage = true
        }
        .sheet(isPresented: $showingNewPage) {
            newPageSheet
        }
        .alert("Error", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: {
            Text(errorMessage ?? "")
        })
    }

    private func loadPages() async {
        isLoading = true
        defer { isLoading = false }
        do {
            pages = try await APIClient.shared.listPages()
            if selectedPage == nil { selectedPage = pages.first }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private var newPageSheet: some View {
        VStack(spacing: 20) {
            Text("New Page")
                .font(.headline)

            TextField("Page title", text: $newPageTitle)
                .textFieldStyle(.roundedBorder)
                .frame(minWidth: 320)

            HStack {
                Button("Cancel") {
                    showingNewPage = false
                    newPageTitle = ""
                }

                Spacer()

                Button("Create") {
                    Task { await createPage() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(newPageTitle.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
            }
        }
        .padding(24)
        .frame(width: 380)
    }

    private func createPage() async {
        let title = newPageTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        isCreating = true
        defer {
            isCreating = false
            showingNewPage = false
            newPageTitle = ""
        }
        do {
            let page = try await APIClient.shared.createPage(title: title)
            pages.insert(page, at: 0)
            selectedPage = page
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
