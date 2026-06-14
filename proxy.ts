import { NextResponse, type NextRequest } from "next/server";

const proxyBasePath = "/world";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === proxyBasePath || pathname.startsWith(`${proxyBasePath}/`)) {
    const url = request.nextUrl.clone();

    url.pathname = pathname.slice(proxyBasePath.length) || "/";

    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/world/:path*"],
};
