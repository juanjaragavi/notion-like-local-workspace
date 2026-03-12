import SwiftUI
import QuickLookUI

struct FilePreviewView: View {
    let item: FileService.FileItem
    @State private var previewContent: PreviewContent = .none
    @State private var isLoading = false

    enum PreviewContent {
        case none
        case text(String)
        case image(NSImage)
        case unsupported
    }

    private let textExtensions = Set(["txt", "md", "swift", "ts", "tsx", "js", "jsx",
                                       "json", "yml", "yaml", "toml", "sh", "py",
                                       "html", "css", "xml", "csv", "log"])
    private let imageExtensions = Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "tiff", "bmp"])

    var body: some View {
        Group {
            switch previewContent {
            case .none:
                if isLoading {
                    ProgressView()
                } else {
                    ContentUnavailableView(item.name, systemImage: "doc")
                }

            case .text(let content):
                ScrollView {
                    TextEditor(text: .constant(content))
                        .font(.system(.body, design: .monospaced))
                        .scrollContentBackground(.hidden)
                        .padding()
                }

            case .image(let nsImage):
                ScrollView([.horizontal, .vertical]) {
                    Image(nsImage: nsImage)
                        .resizable()
                        .scaledToFit()
                        .padding()
                }

            case .unsupported:
                VStack(spacing: 12) {
                    Image(systemName: "eye.slash")
                        .font(.system(size: 40))
                        .foregroundStyle(.secondary)
                    Text("Preview not available")
                        .font(.headline)
                    Text(".\(item.ext) files cannot be previewed here.")
                        .foregroundStyle(.secondary)
                        .font(.callout)
                    Button("Open in Finder") {
                        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.path)])
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle(item.name)
        .navigationSubtitle(item.ext.uppercased())
        .task(id: item.id) { await loadPreview() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Open in Finder") {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.path)])
                }
                .help("Reveal in Finder")
            }
            ToolbarItem {
                Button("Quick Look") {
                    QLPreviewPanel.shared().makeKeyAndOrderFront(nil)
                }
                .help("Quick Look (Space)")
            }
        }
    }

    private func loadPreview() async {
        guard !item.isDirectory else { previewContent = .unsupported; return }
        isLoading = true
        defer { isLoading = false }

        if textExtensions.contains(item.ext) {
            do {
                let text = try await FileService.shared.readTextFile(item.path)
                previewContent = .text(text)
            } catch {
                previewContent = .unsupported
            }
        } else if imageExtensions.contains(item.ext) {
            do {
                let data = try await FileService.shared.readFile(item.path)
                if let img = NSImage(data: data) {
                    previewContent = .image(img)
                } else {
                    previewContent = .unsupported
                }
            } catch {
                previewContent = .unsupported
            }
        } else {
            previewContent = .unsupported
        }
    }
}
