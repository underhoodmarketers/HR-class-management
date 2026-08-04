import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "./lib/jwt";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  const isAdminRoute = pathname.startsWith("/admin");
  const isPortalRoute = pathname.startsWith("/portal");
  const isInstructorRoute = pathname.startsWith("/instructor");

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = ""; // drop the original query before setting `next`
    // Preserve the full path + query (e.g. a deep link to one specific
    // package) so it survives the login/signup round trip.
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const home =
    session.role === "admin"
      ? "/admin"
      : session.role === "instructor"
      ? "/instructor"
      : "/portal";

  if (
    (isAdminRoute && session.role !== "admin") ||
    (isPortalRoute && session.role !== "customer") ||
    (isInstructorRoute && session.role !== "instructor")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/instructor/:path*"],
};
