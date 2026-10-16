import SwiftUI
import AppKit
import Security

@MainActor final class StateBox<Value>: ObservableObject {
    @Published var value: Value
    init(_ value: Value) { self.value = value }
}

@propertyWrapper struct LocalState<Value>: DynamicProperty {
    @StateObject private var box: StateBox<Value>
    init(wrappedValue: Value) { _box = StateObject(wrappedValue: StateBox(wrappedValue)) }
    var wrappedValue: Value { get { box.value } nonmutating set { box.value = newValue } }
    var projectedValue: Binding<Value> { Binding(get: { box.value }, set: { box.value = $0 }) }
}

struct Record: Identifiable {
    let data: [String: Any]
    var id: String { text("id") }
    func text(_ key: String) -> String { data[key] as? String ?? "" }
}

@MainActor final class Workspace: ObservableObject {
    @Published var endpoint = UserDefaults.standard.string(forKey: "endpoint") ?? "http://127.0.0.1:8765"
    @Published var snapshot: [String: Any] = [:]
    @Published var error = ""
    @Published var connected = false
    @Published var selectedProject = ""
    @Published var room = "team"
    @Published var drafts: [String: String] = [:]
    @Published var sending = false
    var backend: Process?
    var key: String { readKey(endpoint) }
    var store: [String: Any] { snapshot["projects"] as? [String: Any] ?? [:] }
    var projects: [Record] { records(store["projects"]) }
    var messages: [Record] { records(store["messages"]).filter { $0.text("project_id") == selectedProject && $0.text("room") == room } }
    var rooms: [(String, String)] {
        [("team", "Everyone"), ("codex", "Codex"), ("antigravity", "Antigravity"), ("grok", "Grok")]
        + records(snapshot["agent_profiles"]).map { ($0.text("room"), $0.text("name")) }
    }
    func records(_ value: Any?) -> [Record] { (value as? [[String: Any]] ?? []).map { Record(data: $0) } }
    func connect(_ accessKey: String? = nil) async {
        endpoint = endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        guard let url = URL(string: endpoint), url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "")) else { error = "Use an HTTPS workspace address."; return }
        UserDefaults.standard.set(endpoint, forKey: "endpoint")
        if let accessKey, !accessKey.isEmpty { saveKey(accessKey, endpoint) }
        if url.host == "127.0.0.1" || url.host == "localhost" { await startLocalIfNeeded() }
        await refresh()
    }
    func startLocalIfNeeded() async {
        if (try? await request("/api/snapshot")) != nil { return }
        guard let root = Bundle.main.object(forInfoDictionaryKey: "CADFWorkspacePath") as? String,
              FileManager.default.fileExists(atPath: root + "/scripts/serve.py") else { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [root + "/scripts/serve.py", "--port", "8765", "--orchestrate"]
        process.currentDirectoryURL = URL(fileURLWithPath: root)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["HOME"] ?? "") + "/.local/bin:/usr/bin:/bin"
        process.environment = env
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run(); backend = process; try? await Task.sleep(nanoseconds: 800_000_000) }
        catch { self.error = error.localizedDescription }
    }
    func request(_ path: String, payload: [String: Any]? = nil) async throws -> [String: Any] {
        guard let url = URL(string: endpoint + path) else { throw URLError(.badURL) }
        var req = URLRequest(url: url); req.timeoutInterval = 20
        if !key.isEmpty { req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization") }
        if let payload {
            req.httpMethod = "POST"; req.httpBody = try JSONSerialization.data(withJSONObject: payload)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(endpoint, forHTTPHeaderField: "Origin")
            req.setValue(snapshot["write_token"] as? String ?? "", forHTTPHeaderField: "X-CADF-Token")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), !value.isEmpty else {
            throw NSError(domain: "CADF", code: (response as? HTTPURLResponse)?.statusCode ?? 0,
                          userInfo: [NSLocalizedDescriptionKey: value["error"] as? String ?? "Sign in or check your workspace address."])
        }
        return value
    }
    func refresh() async {
        do {
            snapshot = try await request("/api/snapshot"); connected = true; error = ""
            if selectedProject.isEmpty { selectedProject = projects.first?.id ?? "" }
        } catch { connected = false; self.error = error.localizedDescription }
    }
    func mutate(_ fields: [String: Any]) async -> Bool {
        var payload = fields; payload["expected_revision"] = store["revision"] ?? 0
        do { _ = try await request("/api/projects", payload: payload); await refresh(); return true }
        catch { self.error = error.localizedDescription; await refresh(); self.error = error.localizedDescription; return false }
    }
    func send() async {
        let draftKey = selectedProject + ":" + room
        let text = (drafts[draftKey] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !selectedProject.isEmpty, !sending else { return }
        sending = true; defer { sending = false }
        if await mutate(["action": "message", "id": selectedProject, "recipient": room, "content": text, "kind": "message", "broadcast": room == "team"]) { drafts[draftKey] = "" }
    }
    func readKey(_ account: String) -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "CADF Workspace", kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    func saveKey(_ key: String, _ account: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "CADF Workspace", kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var entry = query; entry[kSecValueData as String] = Data(key.utf8)
        entry[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(entry as CFDictionary, nil)
        if status != errSecSuccess { error = "Could not save the access key in Keychain." }
    }
}

@main struct CADFApp: App {
    @StateObject var model = Workspace()
    var body: some Scene {
        WindowGroup {
            WorkspaceView().environmentObject(model).frame(minWidth: 780, minHeight: 550)
                .task {
                    await model.connect()
                    while !Task.isCancelled { try? await Task.sleep(nanoseconds: 5_000_000_000); if !Task.isCancelled { await model.refresh() } }
                }
        }.windowStyle(.automatic).defaultSize(width: 1180, height: 780)
        Settings { ConnectionView().environmentObject(model) }
    }
}

struct WorkspaceView: View {
    @EnvironmentObject var model: Workspace
    @LocalState<String?> var section: String? = "Overview"
    @LocalState<String> var search = ""
    @LocalState<Bool> var connection = false
    let sections = [("Overview", "square.grid.2x2"), ("Projects", "folder"), ("Conversation", "bubble.left.and.bubble.right"), ("Tasks", "checklist"), ("Agents", "person.3"), ("Activity", "clock.arrow.circlepath")]
    var body: some View {
        NavigationSplitView {
            List(selection: $section) {
                Label("CADF", systemImage: "sparkles").font(.title2.bold()).padding(.vertical, 16)
                ForEach(sections, id: \.0) { item in Label(item.0, systemImage: item.1).tag(item.0) }
                Section("Workspace") {
                    Label(model.connected ? "Connected" : "Offline", systemImage: model.connected ? "checkmark.icloud" : "icloud.slash").foregroundStyle(model.connected ? .green : .secondary)
                    Button("Connection settings", systemImage: "gear") { connection = true }
                    Button("Open full web workspace", systemImage: "safari") { if let url = URL(string: model.endpoint) { NSWorkspace.shared.open(url) } }
                }
            }.navigationSplitViewColumnWidth(min: 180, ideal: 220)
        } detail: {
            VStack(spacing: 0) {
                if !model.error.isEmpty { Text(model.error).font(.callout).foregroundStyle(.red).padding(10).frame(maxWidth: .infinity).background(.red.opacity(0.07)) }
                Group {
                    switch section {
                    case "Conversation": ConversationView()
                    case "Projects": ProjectList(search: search)
                    case "Tasks": RecordList(records: model.records((model.snapshot["tasks"] as? [String: Any])?["tasks"]), titleKey: "title", subtitleKey: "status", search: search)
                    case "Agents": RecordList(records: model.records((model.snapshot["agents"] as? [String: Any])?["agents"]), titleKey: "name", subtitleKey: "role", search: search)
                    case "Activity": RecordList(records: model.records(model.snapshot["activity"]).reversed(), titleKey: "message", subtitleKey: "at", search: search)
                    default: OverviewView()
                    }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }.navigationTitle(section ?? "CADF").searchable(text: $search, prompt: "Search this view")
                .toolbar { ToolbarItem { Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refresh() } } } }
        }.tint(.purple).sheet(isPresented: $connection) { ConnectionView().environmentObject(model) }
    }
}

struct ConnectionView: View {
    @EnvironmentObject var model: Workspace
    @Environment(\.dismiss) var dismiss
    @LocalState<String> var key = ""
    var body: some View {
        Form {
            Text("Your CADF workspace").font(.title2.bold())
            TextField("Workspace URL", text: $model.endpoint)
            SecureField("Access key (hosted workspace)", text: $key)
            Text("The access key is stored in macOS Keychain. Local mode starts the existing CADF server automatically when needed.").font(.caption).foregroundStyle(.secondary)
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Connect") { Task { await model.connect(key); if model.connected { dismiss() } } }.buttonStyle(.borderedProminent) }
        }.padding(24).frame(width: 480)
    }
}

struct OverviewView: View {
    @EnvironmentObject var model: Workspace
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("From discussion to delivery").font(.largeTitle.bold())
                HStack(spacing: 16) {
                    metric("Projects", model.projects.count, "folder")
                    metric("In progress", model.projects.filter { $0.text("status") == "STARTED" }.count, "play.circle")
                    metric("Completed", model.projects.filter { $0.text("status") == "COMPLETED" }.count, "checkmark.circle")
                }
                Text("Your projects").font(.title2.bold())
                ForEach(model.projects) { p in
                    HStack { Image(systemName: "folder.fill").foregroundStyle(.purple); VStack(alignment: .leading) { Text(p.text("name")).font(.headline); Text(p.text("brief")).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }; Spacer(); Text(p.text("status").replacingOccurrences(of: "_", with: " ")).font(.caption).padding(8).background(.purple.opacity(0.1), in: Capsule()) }.padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                if model.projects.isEmpty { ContentUnavailableView("A fresh workspace", systemImage: "folder.badge.plus", description: Text("Create a project to begin.")) }
            }.padding(28)
        }
    }
    func metric(_ title: String, _ value: Int, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 12) { Label(title, systemImage: icon).foregroundStyle(.secondary); Text("\(value)").font(.system(size: 38, weight: .semibold, design: .rounded)) }.frame(maxWidth: .infinity, alignment: .leading).padding(22).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct ProjectList: View {
    @EnvironmentObject var model: Workspace
    let search: String
    @LocalState<Bool> var showNew = false
    @LocalState<String> var name = ""
    @LocalState<String> var brief = ""
    var body: some View {
        VStack {
            HStack { Spacer(); Button("New project", systemImage: "plus") { showNew = true }.buttonStyle(.borderedProminent) }.padding()
            Table(model.projects.filter { search.isEmpty || $0.text("name").localizedCaseInsensitiveContains(search) }) {
                TableColumn("Project") { Text($0.text("name")).fontWeight(.medium) }
                TableColumn("Status") { Text($0.text("status").replacingOccurrences(of: "_", with: " ")) }
                TableColumn("Priority") { Text($0.text("priority")) }
            }
        }.sheet(isPresented: $showNew) {
            Form { Text("Start a project").font(.title2.bold()); TextField("Project name", text: $name); TextField("What would you like to achieve?", text: $brief, axis: .vertical).lineLimit(4...8)
                HStack { Button("Cancel") { showNew = false }; Spacer(); Button("Create") { Task { if await model.mutate(["action": "create", "name": name, "brief": brief, "workflow": "supervised"]) { showNew = false; name = ""; brief = "" } } }.disabled(name.isEmpty || brief.isEmpty) }
            }.padding(24).frame(width: 480)
        }
    }
}

struct ConversationView: View {
    @EnvironmentObject var model: Workspace
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("Project", selection: $model.selectedProject) { ForEach(model.projects) { Text($0.text("name")).tag($0.id) } }.frame(maxWidth: 320)
                Spacer()
                Picker("Conversation", selection: $model.room) { ForEach(model.rooms, id: \.0) { Text($0.1).tag($0.0) } }.frame(width: 240)
            }.padding().background(.bar)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(model.messages) { message in
                            let own = message.text("sender") == "You"
                            HStack {
                                if own { Spacer(minLength: 70) }
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(message.text("sender")).font(.caption.bold()).foregroundStyle(.secondary)
                                    Text(.init(message.text("content"))).textSelection(.enabled).padding(13).background(own ? Color.purple.opacity(0.15) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                                }.frame(maxWidth: 640, alignment: own ? .trailing : .leading)
                                if !own { Spacer(minLength: 70) }
                            }.id(message.id)
                        }
                    }.padding(24)
                }.onChange(of: model.messages.count) { _, _ in if let id = model.messages.last?.id { proxy.scrollTo(id, anchor: .bottom) } }
            }
            HStack(alignment: .bottom) {
                Image(systemName: "lightbulb").foregroundStyle(.purple).padding(8)
                TextField("Message this conversation", text: Binding(get: { model.drafts[model.selectedProject + ":" + model.room] ?? "" }, set: { model.drafts[model.selectedProject + ":" + model.room] = $0 }), axis: .vertical).lineLimit(1...5).textFieldStyle(.plain).onSubmit { Task { await model.send() } }
                Button { Task { await model.send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }.buttonStyle(.plain).foregroundStyle(.purple).disabled(model.sending || model.selectedProject.isEmpty)
            }.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22)).padding(16)
        }
    }
}

struct RecordList: View {
    let records: [Record]
    let titleKey: String
    let subtitleKey: String
    let search: String
    var body: some View {
        List(Array(records.filter { search.isEmpty || $0.text(titleKey).localizedCaseInsensitiveContains(search) }.enumerated()), id: \.offset) { _, record in
            VStack(alignment: .leading, spacing: 6) { Text(record.text(titleKey)).font(.headline); Text(record.text(subtitleKey)).font(.subheadline).foregroundStyle(.secondary) }.padding(.vertical, 8)
        }.listStyle(.inset)
    }
}
