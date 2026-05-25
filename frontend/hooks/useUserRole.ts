'use client';
import { useAuth } from '@/contexts/AuthContext';

export function useUserRole() {
  const { user, loading } = useAuth();
  const role = (user?.role as string | null) ?? null;

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    isUser: role === 'user',
  };
}
