import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/native-callback
 *
 * After Google OAuth completes, NextAuth redirects here with the session
 * cookie already set.  This handler reads the `authjs.session-token` cookie
 * and passes it to the native macOS app via the `notion-workspace://` URL
 * scheme so the app can store it in the Keychain and attach it as a Bearer
 * token on subsequent API requests.
 *
 * Usage: set callbackUrl to this endpoint when opening ASWebAuthenticationSession:
 *   http://localhost:3000/api/auth/signin/google?callbackUrl=http://localhost:3000/api/auth/native-callback
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    logger.warn("[native-callback] No session token cookie found after OAuth");
    // Redirect to an error page the embedded browser can display
    return NextResponse.redirect(
      new URL("/login?error=native_callback_no_token", request.url),
    );
  }

  logger.info(
    "[native-callback] Session token found, redirecting to native app",
  );

  // Redirect to the custom URL scheme — ASWebAuthenticationSession intercepts
  // this redirect and delivers the callbackURL to the app.
  const callbackURL = new URL("notion-workspace://auth");
  callbackURL.searchParams.set("token", token);

  // Use 302 so the embedded browser follows the redirect immediately.
  return NextResponse.redirect(callbackURL.toString(), { status: 302 });
}
