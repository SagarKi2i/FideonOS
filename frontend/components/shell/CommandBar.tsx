'use client';
import { clearUserCache } from '@/lib/currentUser';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { Search, Bell, ChevronRight, ChevronDown, LogOut, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/components/shell/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Crumb {
  label: string;
  href?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "": "Home",
  marketplace: "Marketplace",
  "my-models": "My Agents",
  training: "Training",
  "review-queue": "Review Queue",
  "agent-workflows": "Workflows",
  "request-pod": "Request a custom pod",
  schedules: "Schedules",
  mailbox: "Mailbox",
  email: "Email box",
  "electron-playground": "Electron Playground",
  admin: "Admin",
  devices: "Devices",
  pending: "Approvals",
  settings: "Settings",
  "device-setup": "Device Setup",
  pod: "Agent",
  "pitch-deck": "Pitch Deck",
  auth: "Sign in",
  "policy-comparison": "Policy Comparison",
};

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Home" }];
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];
  let acc = "";
  parts.forEach((part, i) => {
    acc += "/" + part;
    const label = ROUTE_LABELS[part] || decodeURIComponent(part).replace(/-/g, " ");
    const isLast = i === parts.length - 1;
    crumbs.push({ label: label.charAt(0).toUpperCase() + label.slice(1), href: isLast ? undefined : acc });
  });
  return crumbs;
}

export function CommandBar({ user }: { user: SupabaseUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const palette = useCommandPalette();
  const crumbs = buildCrumbs(pathname);
  const [systemTime, setSystemTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setSystemTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/auth/logout', { method: 'POST', credentials: 'include' }); clearUserCache();
    toast({ title: "Signed out" });
    router.push("/auth");
  };

  const initials = user.email?.slice(0, 2).toUpperCase() || "U";
  const tenant = user.email?.split("@")[1] || "fideon";

  return (
    <header className="sticky top-0 z-20 h-14 flex items-center gap-3 border-b border-border bg-background/85 backdrop-blur-md px-4 supports-[backdrop-filter]:bg-background/70">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[13px] min-w-0" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
            {c.href ? (
              <Link
                href={c.href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {c.label}
              </Link>
            ) : (
              <span className="font-semibold text-foreground truncate tracking-tight">{c.label}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Cmd+K trigger — looks like a search field, opens the palette */}
      <button
        type="button"
        onClick={() => palette.setOpen(true)}
        aria-label="Open command palette"
        className="hidden lg:flex items-center gap-2 h-9 w-80 pl-3 pr-2 text-[13px] bg-muted/40 hover:bg-muted/70 border border-border/70 hover:border-border-strong rounded-lg text-muted-foreground hover:text-foreground transition-colors group"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">Search agents, runs, carriers…</span>
        <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shadow-xs">
          ⌘K
        </kbd>
      </button>
      {/* Mobile/tablet trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-9 w-9 text-muted-foreground"
        onClick={() => palette.setOpen(true)}
        aria-label="Open command palette"
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </Button>

      {/* System status pill */}
      <div className="hidden xl:flex items-center gap-2 h-8 px-3 rounded-full border border-border/70 bg-success/5 text-[11px] font-medium text-success">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span>All systems operational</span>
      </div>

      {/* Notifications */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 relative text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" />
      </Button>

      {/* Tenant + user menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2 text-[13px]">
            <div className="h-7 w-7 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shadow-glow">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-[12px] font-semibold text-foreground truncate max-w-[160px]">
                {user.email}
              </span>
              <span className="text-[10.5px] text-muted-foreground truncate max-w-[160px]">
                {tenant}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
            Tenant
          </DropdownMenuLabel>
          <DropdownMenuItem disabled className="opacity-100">
            <Activity className="h-3.5 w-3.5 mr-2 text-success" />
            <span className="font-medium">{tenant}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
