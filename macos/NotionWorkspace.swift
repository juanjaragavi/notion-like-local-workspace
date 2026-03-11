import Cocoa

// ============================================================================
// Notion Workspace — Native macOS Launcher
//
// A minimal Cocoa application that provides proper Dock integration.
// Starts services via workspace-daemon.sh, stops via workspace-stop.sh.
//
// Dock behaviour:
//   • First click  → starts services + opens browser
//   • Click while running → opens browser
//   • Quit (⌘Q / Dock → Quit) → graceful shutdown of all services
// ============================================================================

class AppDelegate: NSObject, NSApplicationDelegate {
    private let port = 3000

    // MARK: – Lifecycle

    func applicationDidFinishLaunching(_: Notification) {
        if isPortListening(port) {
            openBrowser()
        } else {
            startServices()
        }
    }

    func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows _: Bool) -> Bool {
        openBrowser()
        return false
    }

    func applicationShouldTerminate(_: NSApplication) -> NSApplication.TerminateReply {
        DispatchQueue.global(qos: .userInitiated).async {
            self.stopServices()
            DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) }
        }
        // Give shutdown up to 15 seconds, then force-quit
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    // MARK: – Service management

    private func startServices() {
        guard let root = projectRoot() else {
            notify("Project not found. Run scripts/create-macos-app.sh.", error: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { NSApp.terminate(nil) }
            return
        }

        let script = root + "/workspace-daemon.sh"
        guard FileManager.default.isExecutableFile(atPath: script) else {
            notify("workspace-daemon.sh missing at \(root)", error: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { NSApp.terminate(nil) }
            return
        }

        let logDir = "/tmp/notion-workspace-logs"
        let logPath = logDir + "/daemon.log"
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: logPath, contents: nil)

        // All blocking work (PATH resolution + daemon startup) runs off the main thread
        DispatchQueue.global(qos: .userInitiated).async {
            let env = self.launchEnvironment()

            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/bash")
            task.arguments = [script]
            task.currentDirectoryURL = URL(fileURLWithPath: root)
            task.environment = env
            task.standardInput = FileHandle.nullDevice
            if let fh = FileHandle(forWritingAtPath: logPath) {
                task.standardOutput = fh; task.standardError = fh
            }

            do {
                try task.run()
                task.waitUntilExit()
                DispatchQueue.main.async {
                    if task.terminationStatus == 0 {
                        self.openBrowser()
                        self.notify("Workspace running at http://localhost:\(self.port)")
                    } else {
                        self.notify("Startup failed — see /tmp/notion-workspace-logs/", error: true)
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self.notify("Launch error: \(error.localizedDescription)", error: true)
                }
            }
        }
    }

    private func stopServices() {
        // Persist session via API
        run("/usr/bin/curl", ["-sf", "-X", "POST",
             "http://localhost:\(port)/api/workspace/shutdown",
             "-H", "Content-Type: application/json", "--max-time", "5"])
        sleep(2)

        // Full teardown
        if let root = projectRoot() {
            run("/bin/bash", [root + "/workspace-stop.sh"], env: launchEnvironment())
        }
    }

    // MARK: – Helpers

    private func projectRoot() -> String? {
        // 1. Saved project root from build script
        let saved = NSHomeDirectory() + "/.notion-workspace/project-root"
        if let p = try? String(contentsOf: URL(fileURLWithPath: saved), encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
           FileManager.default.fileExists(atPath: p + "/workspace-daemon.sh") {
            return p
        }
        // 2. In-tree: .app lives at <project>/macos/Notion Workspace.app/
        let bundleDir = Bundle.main.bundlePath
        let candidate = URL(fileURLWithPath: bundleDir)
            .deletingLastPathComponent()   // macos/
            .deletingLastPathComponent()   // project root
            .path
        if FileManager.default.fileExists(atPath: candidate + "/workspace-daemon.sh") {
            return candidate
        }
        return nil
    }

    private func launchEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/zsh")
        task.arguments = ["-lc", "echo $PATH"]   // login (not interactive) to avoid TTY hang
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        task.standardInput = FileHandle.nullDevice
        do {
            try task.run(); task.waitUntilExit()
            if let p = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty {
                env["PATH"] = p
            }
        } catch {
            env["PATH"] = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:\(env["PATH"] ?? "/usr/bin:/bin")"
        }
        return env
    }

    private func isPortListening(_ port: Int) -> Bool {
        let s = socket(AF_INET, SOCK_STREAM, 0)
        guard s >= 0 else { return false }
        defer { Darwin.close(s) }
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        } == 0
    }

    private func openBrowser() {
        NSWorkspace.shared.open(URL(string: "http://localhost:\(port)")!)
    }

    private func notify(_ msg: String, error: Bool = false) {
        let snd = error ? " sound name \"Basso\"" : ""
        run("/usr/bin/osascript", ["-e",
            "display notification \"\(msg)\" with title \"Notion Workspace\"\(snd)"])
    }

    @discardableResult
    private func run(_ exe: String, _ args: [String], env: [String: String]? = nil) -> Int32 {
        let t = Process()
        t.executableURL = URL(fileURLWithPath: exe)
        t.arguments = args
        if let e = env { t.environment = e }
        t.standardInput = FileHandle.nullDevice
        t.standardOutput = FileHandle.nullDevice
        t.standardError = FileHandle.nullDevice
        do { try t.run(); t.waitUntilExit(); return t.terminationStatus }
        catch { return -1 }
    }
}

// ── Entry Point ─────────────────────────────────────────────────────────
// Route SIGTERM/SIGINT through NSApp.terminate so cleanup runs properly.
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigTermSource.setEventHandler { NSApp.terminate(nil) }
sigTermSource.resume()
let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigIntSource.setEventHandler { NSApp.terminate(nil) }
sigIntSource.resume()

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
