import { NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/login"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = publicRoutes.some((route) => path === route || path.startsWith(`${route}/`));
  const hasSession = Boolean(request.cookies.get("behemoth_session")?.value);

  if (!isPublic && !hasSession) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)"],
};
