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
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  refreshUser: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
        clearUserCache();
      } else {
        setUser(null);
        clearUserCache();
      }
    } catch {
      setUser(null);
      clearUserCache();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

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
        refreshUser,
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
