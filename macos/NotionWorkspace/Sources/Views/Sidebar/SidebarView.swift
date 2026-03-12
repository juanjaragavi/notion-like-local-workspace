import SwiftUI

struct SidebarView: View {
    @Binding var selection: SidebarItem?
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        List(SidebarItem.allCases, selection: $selection) { item in
            Label(item.rawValue, systemImage: item.icon)
                .tag(item)
        }
        .listStyle(.sidebar)
        .navigationTitle("Workspace")
        .safeAreaInset(edge: .bottom) {
            userFooter
        }
    }

    private var userFooter: some View {
        HStack(spacing: 8) {
            if let user = auth.currentUser {
                AsyncImage(url: user.image.flatMap(URL.init)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Image(systemName: "person.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .frame(width: 28, height: 28)
                .clipShape(Circle())

                VStack(alignment: .leading, spacing: 1) {
                    Text(user.name ?? "Unknown")
                        .font(.caption.bold())
                        .lineLimit(1)
                    Text(user.email ?? "")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    auth.signOut()
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Sign out")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }
}
