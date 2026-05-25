"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string;
  mfa_verified?: boolean;
  status?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  refresh: async () => null,
  signOut: async () => {},
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Re-fetchable so post-login flows (OTP verify, OTP-bypass login) can refresh
  // the in-memory user without a full page reload. Client-side navigation does
  // NOT remount this provider, so without an explicit refresh the user stays
  // null after login and the (app) layout guard bounces back to /auth.
  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
      const data = r.ok ? ((await r.json()) as AuthUser) : null;
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
    router.push("/auth");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
