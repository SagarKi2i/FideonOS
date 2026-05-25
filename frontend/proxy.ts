import { jwtVerify, importSPKI } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/auth",
  "/signup",
  "/reset-password",
  "/_next",
  "/favicon",
  "/api",
];

// Parse the RSA public key once per server process, not on every request.
// importSPKI is relatively expensive; re-importing it per request was the bulk
// of this middleware's latency on every protected page load.
let _publicKeyPromise: ReturnType<typeof importSPKI> | null = null;
function getPublicKey() {
  if (!_publicKeyPromise) {
    _publicKeyPromise = importSPKI(process.env.JWT_PUBLIC_KEY_PEM!, "RS256");
  }
  return _publicKeyPromise;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.includes(".");
  if (isPublic) return NextResponse.next();

  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const publicKey = await getPublicKey();
    await jwtVerify(accessToken, publicKey);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.png).*)"],
};
