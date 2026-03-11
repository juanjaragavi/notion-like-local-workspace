import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth gate ────────────────────────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next();
    setCacheHeaders(response);
    return response;
  }

  const token =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;
  if (!token && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Cache prevention headers on every non-static response ───────────
  const response = NextResponse.next();
  setCacheHeaders(response);
  return response;
}

/** Apply strict no-cache headers to guarantee fresh data on every request. */
function setCacheHeaders(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
