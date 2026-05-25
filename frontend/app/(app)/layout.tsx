'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { IconRail } from '@/components/shell/IconRail';
import { SecondaryNav } from '@/components/shell/SecondaryNav';
import { CommandBar } from '@/components/shell/CommandBar';
import { CommandPaletteProvider } from '@/components/shell/CommandPalette';
import { Loader2 } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <CommandPaletteProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <IconRail />
        <SecondaryNav />
        <div className="flex-1 flex flex-col min-w-0">
          <CommandBar user={user as any} />
          <main className="flex-1 overflow-auto bg-gradient-subtle">
            <div className="p-5 md:p-7 lg:p-8 max-w-[1600px] mx-auto w-full animate-fade-in-fast">
              {children}
            </div>
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
