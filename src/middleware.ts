import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware : ne fait que des redirections de commodité.
 * La vérification réelle de session reste côté serveur (données de base),
 * jamais dans le middleware (secret non disponible en edge).
 */
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("teu_session")?.value);

  if (pathname.startsWith("/dashboard") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
