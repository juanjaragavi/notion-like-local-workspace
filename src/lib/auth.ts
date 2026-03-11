import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Hotfix: Force environment variables into the running process
process.env.AUTH_SECRET =
  process.env.NEXTAUTH_SECRET || "oRmw0FcAqMqsLiNsQAHQERtx0DVaBu/ajAeS8jgbZxM=";
process.env.AUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/documents.readonly",
            "https://www.googleapis.com/auth/calendar.readonly",
          ].join(" "),
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent select_account",
        },
      },
    }),
    /* Apple provider disabled for GCP deployment
    Apple({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    }),
    Credentials({ ... }) disabled */
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const db = getDb();
      const resExisting = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [user.email],
      );
      const existing = resExisting.rows[0] as { id: string } | undefined;
      const userId = existing?.id || uuidv4();
      if (!existing) {
        await db.query(
          "INSERT INTO users (id, email, name, image, provider) VALUES ($1, $2, $3, $4, $5)",
          [
            userId,
            user.email,
            user.name,
            user.image,
            account?.provider || "credentials",
          ],
        );
      }
      if (account && account.provider !== "credentials") {
        const resAcct = await db.query(
          "SELECT id FROM accounts WHERE provider = $1 AND provider_account_id = $2",
          [account.provider, account.providerAccountId],
        );
        const existingAccount = resAcct.rows[0] as { id: string } | undefined;
        if (!existingAccount) {
          await db.query(
            `INSERT INTO accounts (
              id,
              user_id,
              provider,
              provider_account_id,
              access_token,
              refresh_token,
              scope,
              token_type,
              expires_at
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              uuidv4(),
              userId,
              account.provider,
              account.providerAccountId,
              account.access_token,
              account.refresh_token,
              account.scope,
              account.token_type,
              account.expires_at,
            ],
          );
        } else {
          await db.query(
            "UPDATE accounts SET access_token = $1, refresh_token = COALESCE($2, refresh_token), scope = COALESCE($3, scope), token_type = COALESCE($4, token_type), expires_at = $5 WHERE provider = $6 AND provider_account_id = $7",
            [
              account.access_token,
              account.refresh_token,
              account.scope,
              account.token_type,
              account.expires_at,
              account.provider,
              account.providerAccountId,
            ],
          );
        }
        const resWs = await db.query(
          "SELECT id FROM workspaces WHERE owner_id = $1",
          [userId],
        );
        const ws = resWs.rows[0] as { id: string } | undefined;
        if (!ws) {
          await db.query(
            "INSERT INTO workspaces (id, name, icon, owner_id) VALUES ($1, $2, $3, $4)",
            [uuidv4(), `${user.name || user.email}'s Workspace`, "📋", userId],
          );
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.provider = account.provider;
        token.grantedScopes = account.scope
          ? account.scope.split(/\s+/).filter(Boolean)
          : token.grantedScopes;
      }
      const db = getDb();
      const resUser = await db.query("SELECT id FROM users WHERE email = $1", [
        token.email!,
      ]);
      const dbUser = resUser.rows[0] as { id: string } | undefined;
      if (dbUser) token.userId = dbUser.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session as unknown as Record<string, unknown>;
        s.accessToken = token.accessToken;
        s.refreshToken = token.refreshToken;
        s.userId = token.userId;
        s.provider = token.provider;
        s.grantedScopes = token.grantedScopes;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
});
