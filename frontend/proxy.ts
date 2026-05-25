import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NOTE: This middleware intentionally does NOT gate routes on the access_token
// cookie.
//
// The frontend (*.azurewebsites.net) and the API behind APIM (*.azure-api.net)
// are on different registrable domains, so the auth cookie set by the API is
// scoped to the API's domain. The browser sends it on cross-origin fetches
// (credentials: "include"), which is why /api/auth/me succeeds client-side — but
// it is NEVER sent to the frontend's own server. So a server-side cookie check
// here can never see the cookie and would redirect every authenticated user back
// to /auth, producing an /auth <-> /today bounce loop.
//
// Route protection is enforced where it actually works:
//   1. Client-side: app/(app)/layout.tsx redirects to /auth when /me returns no
//      user. The protected page only ever renders a loading shell before that.
//   2. Server-side: every API endpoint validates the JWT itself, so no protected
//      DATA is reachable without a valid token regardless of routing.
//
// If the apps are ever unified under one parent domain (cookie Domain=.fideon...)
// or the API is proxied same-origin through Next, restore a jwtVerify gate here.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.png).*)"],
};
