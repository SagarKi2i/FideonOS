/**
 * Drop-in replacement for supabase.auth.getUser() and supabase.auth.getSession().
 * Returns a minimal user object from the FastAPI /api/auth/me endpoint.
 * Cookies are sent automatically via credentials: "include".
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface CurrentUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string;
  mfa_verified?: boolean;
  status?: string;
}

let _cached: CurrentUser | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const now = Date.now();
  if (_cached && now - _cacheTime < CACHE_TTL_MS) return _cached;

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
    if (!res.ok) {
      _cached = null;
      return null;
    }
    _cached = await res.json();
    _cacheTime = now;
    return _cached;
  } catch {
    _cached = null;
    return null;
  }
}

export function clearUserCache() {
  _cached = null;
  _cacheTime = 0;
}
