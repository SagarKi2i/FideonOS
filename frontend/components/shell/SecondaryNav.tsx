'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { isElectron } from "@/lib/ollama";
import { HelpAssistant } from "@/components/HelpAssistant";
import {
  Compass, Box, MessageSquare, Zap, ClipboardCheck, FileText, Mail,
  Shield, GraduationCap, Workflow, CalendarClock, Monitor, Activity,
  Download, Clock, Brain, History, Inbox, Plug,
  Sparkles, AlertCircle, CheckCircle2, Send, Bot, Wand2, Building2, Database, type LucideIcon,
} from "lucide-react";
import { detectActiveSection, RailSection } from "./IconRail";

interface SectionLink {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: string | number;
  description?: string;
}

interface SectionGroup {
  label?: string;
  items: SectionLink[];
}

interface SectionDef {
  title: string;
  subtitle: string;
  groups: SectionGroup[];
}

interface ActivatedPod {
  id: string;
  model_id: string;
  model_name: string;
  domain: string;
}

const STORAGE_KEY = "fideon.secondary-nav.collapsed";

export function SecondaryNav() {
  const pathname = usePathname();
  const section = detectActiveSection(pathname);
  const { isAdmin } = useUserRole();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [pods, setPods] = useState<ActivatedPod[]>([]);
  const [isElectronApp, setIsElectronApp] = useState(false);

  useEffect(() => {
    isElectron().then(setIsElectronApp);
    loadPods();
  }, []);

  const loadPods = async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await supabase
      .from("activated_models")
      .select("*")
      .eq("user_id", user.id);
    if (data) setPods(data);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const sectionDef = buildSection(section, { pods, isAdmin, isElectronApp });
  if (!sectionDef) return null;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        collapsed ? "w-12" : "w-64",
      )}
      aria-label="Section navigation"
    >
      <div className="h-14 flex items-center justify-between px-3 border-b border-sidebar-border">
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] truncate">
              {sectionDef.subtitle}
            </p>
            <p className="text-[14px] font-semibold text-foreground tracking-tight truncate leading-tight">
              {sectionDef.title}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {sectionDef.groups.map((group, gi) => (
          <div key={gi} className={cn("px-2", gi > 0 && "mt-4")}>
            {!collapsed && group.label && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                {group.label}
              </p>
            )}
            <ul className="space-y-px">
              {group.items.map((item) => (
                <li key={item.url}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/" || item.url === "/today" || item.url === "/work"}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md text-[13px] font-medium text-foreground/70 hover:bg-sidebar-accent hover:text-foreground transition-colors h-8",
                      collapsed ? "justify-center px-0" : "px-2.5",
                    )}
                    activeClassName="bg-sidebar-accent text-primary hover:bg-sidebar-accent hover:text-primary"
                  >
                    <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{item.title}</span>
                        {item.badge !== undefined && (
                          <span className="text-[10px] font-semibold rounded-md bg-muted text-muted-foreground px-1.5 py-0.5 tabular-nums group-hover:bg-background">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-3 pb-3 pt-3">
          <HelpAssistant />
        </div>
      )}
    </aside>
  );
}

function buildSection(
  section: RailSection,
  ctx: { pods: ActivatedPod[]; isAdmin: boolean; isElectronApp: boolean },
): SectionDef | null {
  switch (section) {
    case "today":
      // Today owns the overview plus every per-agent dashboard. The
      // dashboards live as a sub-group so the broker can jump straight
      // from Today into any pod's analytics surface without leaving the
      // section.
      return {
        title: "Today",
        subtitle: "Overview + agent dashboards",
        groups: [
          {
            items: [
              { title: "Overview", url: "/today", icon: Sparkles },
            ],
          },
          ...(ctx.pods.length > 0
            ? [{
                label: "Dashboards",
                items: ctx.pods.map((p) => ({
                  title: p.model_name,
                  url: `/pod/${p.model_id}`,
                  icon: Activity,
                })),
              }]
            : []),
        ],
      };

    case "approvals":
      return {
        title: "Approvals",
        subtitle: "Needs your sign-off",
        groups: [
          {
            items: [
              { title: "Pending decisions", url: "/approvals", icon: ClipboardCheck },
            ],
          },
        ],
      };

    case "agents":
      return {
        title: "Agents",
        subtitle: "Browse, run, train",
        groups: [
          {
            items: [
              { title: "My Agents",   url: "/my-models",   icon: Box, badge: ctx.pods.length || undefined },
              { title: "Marketplace", url: "/marketplace", icon: Compass },
              { title: "Training",    url: "/training",    icon: GraduationCap },
            ],
          },
          ...(ctx.pods.length > 0
            ? [{
                label: "Active",
                items: ctx.pods.slice(0, 8).map((p) => ({
                  title: p.model_name,
                  url: `/pod/${p.model_id}`,
                  icon: Activity,
                })),
              }]
            : []),
        ],
      };

    case "automations":
      return {
        title: "Automations",
        subtitle: "Self-serve + custom pods",
        groups: [
          {
            items: [
              { title: "Overview",         url: "/automations",      icon: Zap },
              { title: "Workflows",        url: "/agent-workflows",  icon: Workflow },
              { title: "Request a pod",    url: "/request-pod",      icon: Wand2 },
            ],
          },
        ],
      };

    case "connect":
      return {
        title: "Connect",
        subtitle: "Carriers · AMS · MCP",
        groups: [
          {
            items: [
              { title: "Overview",  url: "/connect",            icon: Plug },
              { title: "Carriers",  url: "/connect?tab=carriers", icon: Building2 },
              { title: "AMS",       url: "/connect?tab=ams",    icon: Database },
              { title: "MCP",       url: "/connect?tab=mcp",    icon: Sparkles },
            ],
          },
        ],
      };

    case "trust":
      // Decision review queue lives under its own Approvals rail section
      // now — Trust is purely the audit/evidence surface (records, audit
      // log, model versions, exports). Avoids double-listing the queue.
      return {
        title: "Trust",
        subtitle: "Audit & evidence",
        groups: [
          {
            label: "Audit & evidence",
            items: [
              { title: "Decision records", url: "/governance/decisions",       icon: Brain },
              { title: "Audit log",        url: "/governance/audit-log",       icon: History },
              { title: "Model versions",   url: "/governance/model-versions",  icon: Box },
              { title: "Exports",          url: "/governance/exports",         icon: Download },
            ],
          },
        ],
      };

    case "admin":
      if (!ctx.isAdmin) return null;
      return {
        title: "Admin",
        subtitle: "Run the agency",
        groups: [
          {
            items: [
              { title: "Admin Dashboard", url: "/admin",          icon: Shield },
              { title: "Devices",         url: "/devices",        icon: Monitor },
              { title: "Approvals",       url: "/devices/pending",icon: Clock },
              ...(ctx.isElectronApp
                ? [{ title: "Device Setup", url: "/device-setup", icon: Download }]
                : []),
            ],
          },
        ],
      };

    case "settings":
      return null;
  }
}
