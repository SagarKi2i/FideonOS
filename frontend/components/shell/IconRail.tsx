'use client';
import { clearUserCache } from '@/lib/currentUser';
import { useRouter, usePathname } from 'next/navigation';
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Box,
  ClipboardCheck,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Plug,
  Zap,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { FideonLogo } from "@/components/FideonLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type RailSection =
  | "today"
  | "approvals"
  | "agents"
  | "automations"
  | "connect"
  | "trust"
  | "admin"
  | "settings";

interface RailItem {
  id: RailSection;
  label: string;
  icon: LucideIcon;
  matchPaths: string[];
  defaultRoute: string;
  adminOnly?: boolean;
  /** Render a thin divider ABOVE this item. Used as a "barricade" between
   *  operational sections (Today/Approvals/Dashboards) and configuration
   *  sections (Marketplace/Workflows/Connect/Trust/Admin). */
  barricadeBefore?: boolean;
}

const RAIL_ITEMS: RailItem[] = [
  // ── Operational ──
  // Today owns its overview + every per-agent dashboard under the same
  // rail icon. The secondary nav lists the activated pods inside Today.
  { id: "today",       label: "Today",       icon: Sparkles,        matchPaths: ["/today", "/", "/pod/"], defaultRoute: "/today" },
  { id: "approvals",   label: "Approvals",   icon: ClipboardCheck,  matchPaths: ["/approvals", "/review-queue"], defaultRoute: "/approvals" },

  // ── Configuration (separated by a barricade) ──
  { id: "agents",      label: "Agents",      icon: Box,             matchPaths: ["/marketplace", "/my-models", "/training"], defaultRoute: "/marketplace", barricadeBefore: true },
  { id: "automations", label: "Automations", icon: Zap,             matchPaths: ["/automations", "/agent-workflows", "/request-pod"], defaultRoute: "/automations" },
  { id: "connect",     label: "Connect",     icon: Plug,            matchPaths: ["/connect", "/connections"], defaultRoute: "/connect" },
  { id: "trust",       label: "Trust",       icon: ShieldCheck,     matchPaths: ["/governance", "/inbox", "/work", "/mailbox"], defaultRoute: "/governance/decisions" },
  { id: "admin",       label: "Admin",       icon: Shield,          matchPaths: ["/admin", "/devices"], defaultRoute: "/admin", adminOnly: true },
];

export function detectActiveSection(pathname: string): RailSection {
  if (pathname.startsWith("/today") || pathname === "/" || pathname.startsWith("/pod/")) return "today";
  if (pathname.startsWith("/approvals") || pathname.startsWith("/review-queue")) return "approvals";
  if (pathname.startsWith("/governance") || pathname.startsWith("/inbox") ||
      pathname.startsWith("/work") || pathname.startsWith("/mailbox")) return "trust";
  if (pathname.startsWith("/automations") || pathname.startsWith("/agent-workflows") ||
      pathname.startsWith("/request-pod")) return "automations";
  if (pathname.startsWith("/connect") || pathname.startsWith("/connections")) return "connect";
  if (pathname.startsWith("/marketplace") || pathname.startsWith("/my-models") ||
      pathname.startsWith("/training")) return "agents";
  if (pathname.startsWith("/admin") || pathname.startsWith("/devices")) return "admin";
  if (pathname.startsWith("/settings")) return "settings";
  return "today";
}

export function IconRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const active = detectActiveSection(pathname);

  const handleLogout = async () => {
    await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/auth/logout', { method: 'POST', credentials: 'include' }); clearUserCache();
    toast({ title: "Signed out" });
    router.push("/auth");
  };

  return (
    <TooltipProvider delayDuration={250}>
      <aside
        className="hidden md:flex w-[60px] flex-col items-center border-r border-sidebar-border bg-sidebar"
        aria-label="Primary navigation"
      >
        {/* Logo */}
        <div className="h-14 w-full flex items-center justify-center border-b border-sidebar-border">
          <FideonLogo size={26} />
        </div>

        {/* Primary rail */}
        <nav className="flex-1 flex flex-col items-center gap-0.5 py-3 w-full overflow-y-auto scrollbar-hide">
          {RAIL_ITEMS.filter((i) => !i.adminOnly || isAdmin).map((item) => {
            const isActive = active === item.id;
            return (
              <div key={item.id} className="w-full flex flex-col items-center gap-0.5">
                {/* Barricade: a thin divider separating operational from
                    configuration sections. */}
                {item.barricadeBefore && (
                  <div className="w-6 h-px bg-sidebar-border my-1.5" aria-hidden />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => router.push(item.defaultRoute)}
                      className={cn(
                        "group relative h-10 w-10 rounded-lg flex items-center justify-center",
                        "transition-all duration-150 ease-out",
                        "hover:bg-sidebar-accent",
                        isActive && "bg-sidebar-accent",
                      )}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {isActive && (
                        <span className="absolute -left-px top-2 bottom-2 w-[3px] rounded-r-full bg-primary" aria-hidden />
                      )}
                      <item.icon
                        className={cn(
                          "h-[18px] w-[18px] transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={isActive ? 2.25 : 1.75}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className="text-[12px]">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </nav>

        {/* Bottom utility */}
        <div className="flex flex-col items-center gap-0.5 py-3 w-full border-t border-sidebar-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/settings"
                className="group h-10 w-10 rounded-lg flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground transition-colors"
                activeClassName="bg-sidebar-accent text-primary"
                aria-label="Settings"
              >
                <Settings className="h-[18px] w-[18px] group-hover:text-foreground transition-colors" strokeWidth={1.75} />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="text-[12px]">Settings</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="group h-10 w-10 rounded-lg flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-[18px] w-[18px] group-hover:text-destructive transition-colors" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="text-[12px]">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

// Re-export icons map used by SecondaryNav for consistency
export const SECTION_ICONS = {
  Box,
  Sparkles,
  Zap,
  Plug,
  Shield,
  LayoutDashboard,
};
