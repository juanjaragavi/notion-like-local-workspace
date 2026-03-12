import SwiftUI

// Lightweight calendar event model — fetched from the web API's /api/calendar endpoint
struct CalendarEvent: Identifiable, Decodable, Sendable {
    let id: String
    let summary: String
    let start: String
    let end: String
    let location: String?
    let description: String?
    let htmlLink: String?

    enum CodingKeys: String, CodingKey {
        case id, summary, start, end, location, description
        case htmlLink = "html_link"
    }
}

struct CalendarView: View {
    @State private var events: [CalendarEvent] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedDate = Date()

    var body: some View {
        HSplitView {
            // Date picker sidebar
            VStack(alignment: .leading) {
                DatePicker("", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .padding(8)
                    .onChange(of: selectedDate) { Task { await loadEvents() } }

                Spacer()
            }
            .frame(minWidth: 240, maxWidth: 280)

            // Events list
            VStack(spacing: 0) {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if events.isEmpty {
                    ContentUnavailableView(
                        "No Events",
                        systemImage: "calendar.badge.clock",
                        description: Text(selectedDate.formatted(date: .long, time: .omitted))
                    )
                } else {
                    List(events) { event in
                        EventRow(event: event)
                    }
                    .listStyle(.inset)
                }
            }
            .navigationTitle("Calendar")
            .toolbar {
                ToolbarItem {
                    Button { Task { await loadEvents() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh")
                }
            }
        }
        .task { await loadEvents() }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func loadEvents() async {
        isLoading = true
        defer { isLoading = false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dateStr = selectedDate.formatted(.iso8601.year().month().day())
        do {
            let url = URL(string: "http://localhost:3000/api/calendar?date=\(dateStr)")!
            var request = URLRequest(url: url)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let token = AuthService.shared.sessionToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let (data, _) = try await URLSession.shared.data(for: request)
            struct Resp: Decodable { let events: [CalendarEvent] }
            let resp = try JSONDecoder().decode(Resp.self, from: data)
            events = resp.events
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct EventRow: View {
    let event: CalendarEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.accentColor)
                .frame(width: 4)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 3) {
                Text(event.summary)
                    .font(.body.bold())
                    .lineLimit(2)

                Text(timeRange)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let location = event.location {
                    Label(location, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let link = event.htmlLink, let url = URL(string: link) {
                Link(destination: url) {
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(.secondary)
                }
                .help("Open in Google Calendar")
            }
        }
        .padding(.vertical, 4)
    }

    private var timeRange: String {
        // Dates from API are ISO8601 strings
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fmt2 = ISO8601DateFormatter()
        fmt2.formatOptions = [.withInternetDateTime]

        func parse(_ s: String) -> Date? { fmt.date(from: s) ?? fmt2.date(from: s) }

        let displayFmt = DateFormatter()
        displayFmt.timeStyle = .short
        displayFmt.dateStyle = .none

        if let start = parse(event.start), let end = parse(event.end) {
            return "\(displayFmt.string(from: start)) – \(displayFmt.string(from: end))"
        }
        return event.start
    }
}
