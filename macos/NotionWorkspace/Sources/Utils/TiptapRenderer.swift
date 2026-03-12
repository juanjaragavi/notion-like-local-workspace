import Foundation
import AppKit

/// Converts a Tiptap JSON document (as produced by the web app's Tiptap editor)
/// into plain text suitable for display in SwiftUI TextEditor.
/// Full NSAttributedString rendering is not required for the MVP — plain text
/// is sufficient until a rich WYSIWYG view is needed.
enum TiptapRenderer {

    /// Convert a raw Tiptap JSON string to plain text.
    static func plainText(from jsonString: String) -> String {
        guard
            let data = jsonString.data(using: .utf8),
            let doc = try? JSONDecoder().decode(TiptapDoc.self, from: data)
        else {
            // Fallback: return as-is (may already be plain text from older entries)
            return jsonString
        }
        return plainText(from: doc.content ?? [])
    }

    // MARK: – Private

    private static func plainText(from nodes: [TiptapNode]) -> String {
        nodes.map { textForNode($0) }.joined()
    }

    private static func textForNode(_ node: TiptapNode) -> String {
        switch node.type {
        case "doc":
            return plainText(from: node.content ?? [])

        case "paragraph":
            let inner = plainText(from: node.content ?? [])
            return inner + "\n"

        case "heading":
            let level = node.attrs?["level"] as? Int ?? 1
            let prefix = String(repeating: "#", count: level) + " "
            return prefix + plainText(from: node.content ?? []) + "\n"

        case "bulletList", "orderedList":
            return plainText(from: node.content ?? [])

        case "listItem":
            return "• " + plainText(from: node.content ?? [])

        case "taskList":
            return plainText(from: node.content ?? [])

        case "taskItem":
            let checked = node.attrs?["checked"] as? Bool ?? false
            return (checked ? "[x] " : "[ ] ") + plainText(from: node.content ?? [])

        case "blockquote":
            return plainText(from: node.content ?? [])
                .split(separator: "\n", omittingEmptySubsequences: false)
                .map { "> \($0)" }
                .joined(separator: "\n") + "\n"

        case "codeBlock":
            return "```\n" + plainText(from: node.content ?? []) + "\n```\n"

        case "horizontalRule":
            return "---\n"

        case "hardBreak":
            return "\n"

        case "text":
            return node.text ?? ""

        default:
            return plainText(from: node.content ?? [])
        }
    }
}

// MARK: – Decodable models

private struct TiptapDoc: Decodable {
    let type: String?
    let content: [TiptapNode]?
}

private struct TiptapNode: Decodable {
    let type: String
    let text: String?
    let content: [TiptapNode]?
    let attrs: [String: AnyDecodable]?
}

/// Wrapper for heterogeneous JSON values in Tiptap `attrs`.
private struct AnyDecodable: Decodable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let bool = try? container.decode(Bool.self) { value = bool }
        else if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let string = try? container.decode(String.self) { value = string }
        else { value = NSNull() }
    }
}

extension Dictionary where Key == String, Value == AnyDecodable {
    subscript(_ key: String) -> Any? { self[key]?.value }
}
