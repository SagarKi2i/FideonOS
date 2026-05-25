'use client';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { IconRail } from "@/components/shell/IconRail";
import { SecondaryNav } from "@/components/shell/SecondaryNav";
import { CommandBar } from "@/components/shell/CommandBar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  if (!user) return null;

  return (
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
  );
}
