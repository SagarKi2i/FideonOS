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
import { getApiUrl } from "@/lib/apiBase";
import { clearUserCache } from "@/lib/currentUser";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Re-fetchable so post-login flows (OTP verify, OTP-bypass login) can refresh
  // the in-memory user without a full page reload. Client-side navigation does
  // NOT remount this provider, so without an explicit refresh the user stays
  // null after login and the (app) layout guard bounces back to /auth.
  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
        clearUserCache();
        return data;
      }
      setUser(null);
      clearUserCache();
      return null;
    } catch {
      setUser(null);
      clearUserCache();
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    await fetch(`${getApiUrl()}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
    clearUserCache();
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
