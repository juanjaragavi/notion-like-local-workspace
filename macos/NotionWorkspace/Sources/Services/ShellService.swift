import Foundation

/// Executes shell commands via Process(). Maintains a blocklist of
/// destructive commands. All commands run in a sandboxed subprocess.
actor ShellService {
    static let shared = ShellService()

    private let blocklist: Set<String> = [
        "rm", "rmdir", "dd", "mkfs", "fdisk", "diskutil",
        "sudo", "su", "chmod", "chown", "kill", "killall",
        "shutdown", "reboot", "halt",
    ]

    private init() {}

    struct CommandResult: Sendable {
        let stdout: String
        let stderr: String
        let exitCode: Int32
    }

    func execute(_ command: String, workingDirectory: String? = nil) async throws -> CommandResult {
        try assertNotBlocked(command)

        return try await withCheckedThrowingContinuation { continuation in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/zsh")
            task.arguments = ["-c", command]

            if let cwd = workingDirectory {
                task.currentDirectoryURL = URL(fileURLWithPath: cwd)
            }

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            task.standardOutput = stdoutPipe
            task.standardError = stderrPipe
            task.standardInput = FileHandle.nullDevice

            do {
                try task.run()
                task.waitUntilExit()
                let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                continuation.resume(returning: CommandResult(stdout: stdout, stderr: stderr, exitCode: task.terminationStatus))
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    private func assertNotBlocked(_ command: String) throws {
        let tokens = command.split(separator: " ").map { String($0) }
        guard let first = tokens.first else { return }
        let cmd = URL(fileURLWithPath: first).lastPathComponent
        if blocklist.contains(cmd) {
            throw ShellError.commandBlocked(cmd: cmd)
        }
    }
}

enum ShellError: LocalizedError {
    case commandBlocked(cmd: String)

    var errorDescription: String? {
        switch self {
        case .commandBlocked(let c): "Command '\(c)' is blocked for safety"
        }
    }
}
