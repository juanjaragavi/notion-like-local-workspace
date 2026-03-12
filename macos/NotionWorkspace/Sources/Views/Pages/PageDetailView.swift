import SwiftUI

struct PageDetailView: View {
    let page: Page
    let onSave: (Page) -> Void

    @State private var title: String
    @State private var content: String
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var isDirty = false

    init(page: Page, onSave: @escaping (Page) -> Void) {
        self.page = page
        self.onSave = onSave
        _title = State(initialValue: page.title)
        _content = State(initialValue: page.content ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Title
            TextField("Untitled", text: $title)
                .font(.largeTitle.bold())
                .textFieldStyle(.plain)
                .padding(.horizontal, 40)
                .padding(.top, 32)
                .padding(.bottom, 12)
                .onChange(of: title) { isDirty = true }

            Divider()

            // Content
            TextEditor(text: $content)
                .font(.body)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 36)
                .padding(.vertical, 16)
                .onChange(of: content) { isDirty = true }

            if let error = saveError {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .padding(.horizontal, 40)
                    .padding(.bottom, 8)
            }
        }
        .background(.background)
        .navigationTitle(title.isEmpty ? "Untitled" : title)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await savePage() }
                } label: {
                    if isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!isDirty || isSaving)
                .keyboardShortcut("s", modifiers: .command)
                .help("Save page (⌘S)")
            }
        }
        // Auto-save on view disappear
        .onDisappear {
            if isDirty {
                Task { await savePage() }
            }
        }
    }

    private func savePage() async {
        let t = title.trimmingCharacters(in: .whitespaces).isEmpty ? "Untitled" : title
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            let updated = try await APIClient.shared.updatePage(id: page.id, title: t, content: content)
            isDirty = false
            onSave(updated)
        } catch {
            saveError = error.localizedDescription
        }
    }
}
