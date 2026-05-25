'use client';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { role, loading, isAdmin } = useUserRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) {
    return // Redirect to /auth - use router.replace in useEffect or redirect() in server component;
  }

  if (requireAdmin && !isAdmin) {
    return // Redirect to / - use router.replace in useEffect or redirect() in server component;
  }

  return <>{children}</>;
}
