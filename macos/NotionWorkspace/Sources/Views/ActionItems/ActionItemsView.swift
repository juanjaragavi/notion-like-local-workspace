import SwiftUI

struct ActionItemsView: View {
    @State private var items: [ActionItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingNewItem = false
    @State private var newTitle = ""
    @State private var newPriority: ActionItemPriority = .medium
    @State private var filter: ActionItemStatus? = nil

    private var displayedItems: [ActionItem] {
        guard let f = filter else { return items }
        return items.filter { $0.status == f }
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar

            Divider()

            Group {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if displayedItems.isEmpty {
                    ContentUnavailableView(
                        "No Action Items",
                        systemImage: "checkmark.circle",
                        description: Text("Add tasks to track your work.")
                    )
                } else {
                    List(displayedItems) { item in
                        ActionItemRow(item: item) { updated in
                            if let idx = items.firstIndex(where: { $0.id == updated.id }) {
                                items[idx] = updated
                            }
                        }
                    }
                    .listStyle(.inset)
                }
            }
        }
        .navigationTitle("Action Items")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewItem = true
                } label: {
                    Image(systemName: "plus")
                }
                .help("Add Action Item")
            }
            ToolbarItem {
                Button { Task { await load() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh")
            }
        }
        .task { await load() }
        .sheet(isPresented: $showingNewItem) {
            newItemSheet
        }
        .alert("Error", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: {
            Text(errorMessage ?? "")
        })
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(label: "All", selected: filter == nil) { filter = nil }
                FilterChip(label: "Pending", selected: filter == .pending) { filter = .pending }
                FilterChip(label: "Completed", selected: filter == .completed) { filter = .completed }
                FilterChip(label: "Cancelled", selected: filter == .cancelled) { filter = .cancelled }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private var newItemSheet: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("New Action Item")
                .font(.headline)

            TextField("Task title", text: $newTitle)
                .textFieldStyle(.roundedBorder)

            Picker("Priority", selection: $newPriority) {
                ForEach(ActionItemPriority.allCases, id: \.self) { p in
                    Text(p.rawValue.capitalized).tag(p)
                }
            }
            .pickerStyle(.segmented)

            HStack {
                Button("Cancel") {
                    showingNewItem = false
                    newTitle = ""
                }
                Spacer()
                Button("Create") {
                    Task { await createItem() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 380)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await APIClient.shared.listActionItems()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createItem() async {
        let t = newTitle.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        showingNewItem = false
        newTitle = ""
        do {
            let item = try await APIClient.shared.createActionItem(title: t, priority: newPriority)
            items.insert(item, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: – Row

struct ActionItemRow: View {
    let item: ActionItem
    let onUpdate: (ActionItem) -> Void
    @State private var isUpdating = false

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Task { await toggleStatus() }
            } label: {
                Image(systemName: item.status == .completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.status == .completed ? .green : .secondary)
                    .font(.title3)
            }
            .buttonStyle(.plain)
            .disabled(isUpdating)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .strikethrough(item.status == .completed)
                    .foregroundStyle(item.status == .completed ? .secondary : .primary)

                HStack(spacing: 6) {
                    priorityBadge
                    if let due = item.dueDate {
                        Text(due)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var priorityBadge: some View {
        Text(item.priority.rawValue.capitalized)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(priorityColor.opacity(0.15))
            .foregroundStyle(priorityColor)
            .clipShape(Capsule())
    }

    private var priorityColor: Color {
        switch item.priority {
        case .high: .red
        case .medium: .orange
        case .low: .gray
        }
    }

    private func toggleStatus() async {
        isUpdating = true
        defer { isUpdating = false }
        let newStatus: ActionItemStatus = item.status == .completed ? .pending : .completed
        do {
            try await APIClient.shared.updateActionItem(id: item.id, status: newStatus)
            var updated = item
            // Create updated copy — ActionItem is a struct so we rebuild
            let copy = ActionItem(
                id: item.id,
                title: item.title,
                status: newStatus,
                priority: item.priority,
                dueDate: item.dueDate,
                createdAt: item.createdAt
            )
            onUpdate(copy)
        } catch {
            // silently ignore — row stays as-is
        }
    }
}

// MARK: – Filter chip

struct FilterChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(selected ? Color.accentColor : Color.secondary.opacity(0.12))
                .foregroundStyle(selected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
