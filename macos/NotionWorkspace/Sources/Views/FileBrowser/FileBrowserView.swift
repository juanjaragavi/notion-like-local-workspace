import SwiftUI
import QuickLookUI

struct FileBrowserView: View {
    @State private var currentPath: String = FileManager.default.homeDirectoryForCurrentUser.path
    @State private var items: [FileService.FileItem] = []
    @State private var selectedItem: FileService.FileItem?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var pathHistory: [String] = []
    @State private var showDeleteAlert = false
    @State private var itemToDelete: FileService.FileItem?

    private var canGoBack: Bool { !pathHistory.isEmpty }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                breadcrumbBar

                Divider()

                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if items.isEmpty {
                    ContentUnavailableView("Empty Folder", systemImage: "folder")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(items, selection: $selectedItem) { item in
                        FileRow(item: item)
                            .tag(item)
                            .contextMenu {
                                if !item.isDirectory {
                                    Button("Quick Look") { quickLook(item) }
                                }
                                Divider()
                                Button("Delete", role: .destructive) {
                                    itemToDelete = item
                                    showDeleteAlert = true
                                }
                            }
                            .onTapGesture(count: 2) {
                                if item.isDirectory { navigate(to: item.path) }
                                else { quickLook(item) }
                            }
                    }
                    .listStyle(.inset)
                }
            }
            .navigationTitle("Files")
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    Button {
                        guard let prev = pathHistory.popLast() else { return }
                        currentPath = prev
                        Task { await loadDirectory(push: false) }
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .disabled(!canGoBack)
                    .help("Back")
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { Task { await loadDirectory() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh")
                }
            }
        } detail: {
            if let item = selectedItem, !item.isDirectory {
                FilePreviewView(item: item)
            } else {
                ContentUnavailableView("Select a File", systemImage: "doc")
            }
        }
        .task { await loadDirectory() }
        .alert("Delete \"\(itemToDelete?.name ?? "")\"?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                if let item = itemToDelete { Task { await deleteItem(item) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: – Breadcrumb

    private var breadcrumbBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                let components = breadcrumbComponents()
                ForEach(Array(components.enumerated()), id: \.offset) { idx, element in
                    let (name, path) = element
                    if idx > 0 {
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Button(name) {
                        if path != currentPath { navigate(to: path) }
                    }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(idx == components.count - 1 ? .primary : .secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .background(.bar)
    }

    private func breadcrumbComponents() -> [(String, String)] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let display = currentPath.hasPrefix(home)
            ? "~" + currentPath.dropFirst(home.count)
            : currentPath

        var result: [(String, String)] = []
        var accumPath = ""
        let parts = display.split(separator: "/", omittingEmptySubsequences: true)
        for (i, part) in parts.enumerated() {
            if i == 0 && part == "~" {
                accumPath = home
                result.append(("~", home))
            } else {
                accumPath += "/\(part)"
                let resolved = accumPath.hasPrefix(home) ? accumPath : currentPath
                result.append((String(part), resolved))
            }
        }
        return result.isEmpty ? [("~", home)] : result
    }

    // MARK: – Navigation

    private func navigate(to path: String) {
        pathHistory.append(currentPath)
        currentPath = path
        selectedItem = nil
        Task { await loadDirectory(push: false) }
    }

    private func loadDirectory(push: Bool = true) async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await FileService.shared.listDirectory(currentPath)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func quickLook(_ item: FileService.FileItem) {
        selectedItem = item
    }

    private func deleteItem(_ item: FileService.FileItem) async {
        do {
            try await FileService.shared.deleteItem(item.path)
            items.removeAll { $0.id == item.id }
            if selectedItem?.id == item.id { selectedItem = nil }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: – File Row

struct FileRow: View {
    let item: FileService.FileItem

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(iconColor)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(item.name)
                    .lineLimit(1)
                if !item.isDirectory {
                    Text(formattedSize)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if let modified = item.modifiedAt {
                Text(modified, style: .date)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }

    private var icon: String {
        if item.isDirectory { return "folder.fill" }
        switch item.ext {
        case "pdf": return "doc.richtext"
        case "png", "jpg", "jpeg", "gif", "webp", "heic": return "photo"
        case "mp4", "mov", "mkv": return "film"
        case "mp3", "m4a", "aac": return "music.note"
        case "swift": return "swift"
        case "ts", "tsx", "js", "jsx": return "chevron.left.forwardslash.chevron.right"
        case "md", "txt": return "doc.text"
        case "zip", "gz", "tar": return "doc.zipper"
        default: return "doc"
        }
    }

    private var iconColor: Color {
        if item.isDirectory { return Color.accentColor }
        switch item.ext {
        case "pdf": return .red
        case "png", "jpg", "jpeg", "gif", "webp", "heic": return .blue
        case "swift": return .orange
        default: return .secondary
        }
    }

    private var formattedSize: String {
        let kb = Double(item.size) / 1024
        if kb < 1 { return "\(item.size) B" }
        let mb = kb / 1024
        if mb < 1 { return String(format: "%.1f KB", kb) }
        return String(format: "%.1f MB", mb)
    }
}
