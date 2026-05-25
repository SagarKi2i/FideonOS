'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { usePathname } from 'next/navigation';
import { FideonLogo } from "@/components/FideonLogo";
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Box, 
  MessageSquare, 
  FileText,
  Mail,
  Settings,
  Monitor,
  Download,
  Shield,
  Clock,
  ChevronDown,
  Activity,
  GraduationCap,
  Workflow,
  CalendarClock,
  Zap,
  ClipboardCheck,
  Layers,
  Compass,
  Wrench,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useState, useEffect } from "react";
import { isElectron } from "@/lib/ollama";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
import { HelpAssistant } from "@/components/HelpAssistant";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ActivatedPod {
  id: string;
  model_id: string;
  model_name: string;
  domain: string;
}

// Simplified navigation groups
const coreItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
];

const aiToolsItems = [
  { title: "Review Queue", url: "/review-queue", icon: ClipboardCheck },
];

const aiAgentItems = [
  { title: "Marketplace", url: "/marketplace", icon: Compass },
  { title: "My Agents", url: "/my-models", icon: Box },
  { title: "Training", url: "/training", icon: GraduationCap },
];

const automationItems = [
  { title: "Workflows", url: "/agent-workflows", icon: Zap },
  { title: "Pipelines", url: "/workflows", icon: Workflow },
  { title: "Schedules", url: "/schedules", icon: CalendarClock },
];

const resourceItems = [
  { title: "Mailbox", url: "/mailbox", icon: Mail },
];

const adminItems = [
  { title: "Admin", url: "/admin", icon: Shield },
  { title: "Devices", url: "/devices", icon: Monitor },
  { title: "Approvals", url: "/devices/pending", icon: Clock },
];

const electronItems = [
  { title: "Device Setup", url: "/device-setup", icon: Download },
];

function NavGroup({ label, items: navItems, icon: Icon, defaultOpen = true, onNavClick }: {
  label: string;
  items: { title: string; url: string; icon: typeof LayoutDashboard }[];
  icon?: typeof LayoutDashboard;
  defaultOpen?: boolean;
  onNavClick: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full">
          <SidebarGroupLabel className="text-muted-foreground text-[10px] uppercase tracking-[0.12em] font-semibold flex items-center justify-between cursor-pointer hover:text-foreground transition-colors px-2.5">
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className="h-3 w-3" strokeWidth={2} />}
              {label}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      onClick={onNavClick}
                      className="hover:bg-sidebar-accent hover:text-foreground transition-colors rounded-md text-[13px] font-medium text-foreground/75"
                      activeClassName="bg-sidebar-accent text-primary font-semibold"
                    >
                      <item.icon className="h-4 w-4" strokeWidth={1.75} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const { isAdmin } = useUserRole();
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [activatedPods, setActivatedPods] = useState<ActivatedPod[]>([]);

  useEffect(() => {
    const checkElectron = async () => {
      const result = await isElectron();
      setIsElectronApp(result);
    };
    checkElectron();
    loadActivatedPods();
  }, []);

  const loadActivatedPods = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("activated_models")
        .select("*")
        .eq("user_id", user.id);

      if (!error && data) {
        setActivatedPods(data);
      }
    } catch (error) {
      console.error("Error loading pods:", error);
    }
  };

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <FideonLogo size={28} className="flex-shrink-0" />
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="font-display font-bold text-sidebar-foreground text-[15px] tracking-tight leading-tight">Fideon</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-semibold">OS</span>
          </div>
        </div>

        {/* Core - always visible, no collapsible */}
        <SidebarGroup className="pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      onClick={handleNavClick}
                      className="hover:bg-sidebar-accent hover:text-foreground transition-colors rounded-md text-[13px] font-medium text-foreground/75"
                      activeClassName="bg-sidebar-accent text-primary font-semibold"
                    >
                      <item.icon className="h-4 w-4" strokeWidth={1.75} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavGroup label="AI Tools" items={aiToolsItems} icon={MessageSquare} onNavClick={handleNavClick} />
        <NavGroup label="AI Agents" items={aiAgentItems} icon={Layers} onNavClick={handleNavClick} />
        <NavGroup label="Automation" items={automationItems} icon={Wrench} onNavClick={handleNavClick} />
        <NavGroup label="Resources" items={resourceItems} icon={FileText} defaultOpen={false} onNavClick={handleNavClick} />

        {/* Active Pods */}
        {activatedPods.length > 0 && (
          <NavGroup 
            label={`Active Agents (${activatedPods.length})`}
            icon={Activity}
            items={activatedPods.map(pod => ({
              title: pod.model_name,
              url: `/pod/${pod.model_id}`,
              icon: Activity,
            }))}
            onNavClick={handleNavClick}
          />
        )}

        {isAdmin && (
          <NavGroup label="Admin" items={adminItems} icon={Shield} defaultOpen={false} onNavClick={handleNavClick} />
        )}

        {isElectronApp && (
          <NavGroup label="Device" items={electronItems} icon={Monitor} defaultOpen={false} onNavClick={handleNavClick} />
        )}

        {/* Bottom section */}
        <div className="mt-auto">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Settings">
                    <NavLink
                      to="/settings"
                      onClick={handleNavClick}
                      className="hover:bg-sidebar-accent hover:text-foreground transition-colors rounded-md text-[13px] font-medium text-foreground/75"
                      activeClassName="bg-sidebar-accent text-primary font-semibold"
                    >
                      <Settings className="h-4 w-4" strokeWidth={1.75} />
                      <span>Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          
          <div className="px-3 pb-4 group-data-[collapsible=icon]:hidden">
            <Separator className="mb-3" />
            <HelpAssistant />
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
