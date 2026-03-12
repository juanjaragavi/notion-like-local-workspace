import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";

// Map NEXTAUTH_* vars to the AUTH_* names NextAuth v5 expects.
// AUTH_SECRET is always required. AUTH_URL is only set explicitly when
// NEXTAUTH_URL is present; otherwise NextAuth v5 auto-detects it from
// VERCEL_URL in Vercel deployments.
process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (process.env.NEXTAUTH_URL) {
  process.env.AUTH_URL = process.env.NEXTAUTH_URL;
}

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
          prompt: "consent",
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

      // Database persistence is best-effort — a DB outage must never block
      // authentication.  The JWT session works independently of the DB, so
      // we log the error and let the user through.
      try {
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
              [
                uuidv4(),
                `${user.name || user.email}'s Workspace`,
                "📋",
                userId,
              ],
            );
          }
        }
      } catch (err) {
        logger.error("[auth] signIn DB error (allowing login anyway)", err);
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

      // Only resolve userId from DB when it is not already cached in the JWT.
      // Without this guard the DB is queried on every request, and a single
      // transient failure silently drops userId — causing 401s until the next
      // successful sign-in.
      if (!token.userId) {
        try {
          const db = getDb();
          const resUser = await db.query(
            "SELECT id FROM users WHERE email = $1",
            [token.email!],
          );
          const dbUser = resUser.rows[0] as { id: string } | undefined;
          if (dbUser) {
            token.userId = dbUser.id;
          } else if (token.email) {
            // User record missing — this happens when the DB was unavailable
            // during the original sign-in callback. Self-heal by creating the
            // user + workspace now so existing sessions don't stay broken.
            const newUserId = uuidv4();
            await db.query(
              "INSERT INTO users (id, email, name, image, provider) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image",
              [
                newUserId,
                token.email,
                token.name ?? null,
                token.picture ?? null,
                (token.provider as string) ?? "google",
              ],
            );
            const resCreated = await db.query(
              "SELECT id FROM users WHERE email = $1",
              [token.email],
            );
            const createdUser = resCreated.rows[0] as
              | { id: string }
              | undefined;
            if (createdUser) {
              token.userId = createdUser.id;
              // Ensure a workspace exists for this user.
              const resWs = await db.query(
                "SELECT id FROM workspaces WHERE owner_id = $1",
                [createdUser.id],
              );
              if (!resWs.rows[0]) {
                await db.query(
                  "INSERT INTO workspaces (id, name, icon, owner_id) VALUES ($1, $2, $3, $4)",
                  [
                    uuidv4(),
                    `${(token.name as string | undefined) ?? token.email}'s Workspace`,
                    "📋",
                    createdUser.id,
                  ],
                );
              }
            }
          }
        } catch {
          // DB unavailable — userId will be populated on the next successful request
        }
      }

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
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days — survives server restarts
  },
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60, // 30 days — persistent, not session-scoped
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
});
