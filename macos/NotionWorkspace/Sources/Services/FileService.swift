import Foundation

/// FileManager wrapper that restricts access to a set of allowed root directories.
/// Provides listing, reading, moving, and deletion with safety confirmation hooks.
actor FileService {
    static let shared = FileService()

    private let fm = FileManager.default
    private let home = FileManager.default.homeDirectoryForCurrentUser.path

    /// Directories the file browser is allowed to access.
    var allowedRoots: [String] {
        [
            home,
            "\(home)/GitHub",
            "\(home)/Documents",
            "\(home)/Desktop",
            "\(home)/Downloads",
            "\(home)/Library/CloudStorage",
        ]
    }

    private init() {}

    // MARK: – Listing

    struct FileItem: Identifiable, Sendable, Hashable {
        let id: String
        let name: String
        let path: String
        let isDirectory: Bool
        let size: Int64
        let modifiedAt: Date?
        let ext: String
    }

    func listDirectory(_ path: String) throws -> [FileItem] {
        try assertAllowed(path)
        let contents = try fm.contentsOfDirectory(atPath: path)
        return try contents.compactMap { name -> FileItem? in
            let fullPath = "\(path)/\(name)"
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: fullPath, isDirectory: &isDir) else { return nil }
            let attrs = try? fm.attributesOfItem(atPath: fullPath)
            let size = (attrs?[.size] as? NSNumber)?.int64Value ?? 0
            let modified = attrs?[.modificationDate] as? Date
            let ext = isDir.boolValue ? "" : (name as NSString).pathExtension.lowercased()
            return FileItem(
                id: fullPath,
                name: name,
                path: fullPath,
                isDirectory: isDir.boolValue,
                size: size,
                modifiedAt: modified,
                ext: ext
            )
        }.sorted { a, b in
            if a.isDirectory != b.isDirectory { return a.isDirectory }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
    }

    // MARK: – Reading

    func readFile(_ path: String) throws -> Data {
        try assertAllowed(path)
        return try Data(contentsOf: URL(fileURLWithPath: path))
    }

    func readTextFile(_ path: String) throws -> String {
        let data = try readFile(path)
        return String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
    }

    // MARK: – Writing

    func writeFile(_ path: String, data: Data) throws {
        try assertAllowed(path)
        try data.write(to: URL(fileURLWithPath: path))
    }

    func createDirectory(_ path: String) throws {
        try assertAllowed(path)
        try fm.createDirectory(atPath: path, withIntermediateDirectories: true)
    }

    func moveItem(from src: String, to dst: String) throws {
        try assertAllowed(src)
        try assertAllowed(dst)
        try fm.moveItem(atPath: src, toPath: dst)
    }

    func deleteItem(_ path: String) throws {
        try assertAllowed(path)
        try fm.removeItem(atPath: path)
    }

    // MARK: – Safety

    private func assertAllowed(_ path: String) throws {
        let resolved = (path as NSString).standardizingPath
        let isAllowed = allowedRoots.contains { root in
            resolved == root || resolved.hasPrefix(root + "/")
        }
        guard isAllowed else {
            throw FileServiceError.accessDenied(path: path)
        }
    }
}

enum FileServiceError: LocalizedError {
    case accessDenied(path: String)

    var errorDescription: String? {
        switch self {
        case .accessDenied(let p): "Access denied: \(p)"
        }
    }
}
