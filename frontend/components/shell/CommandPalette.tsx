'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ArrowRight,
  Box,
  Brain,
  ClipboardCheck,
  Compass,
  FileText,
  GraduationCap,
  Mail,
  LogOut,
  MessageSquare,
  Monitor,
  Plug,
  Settings,
  Shield,
  Sparkles,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ActivatedAgent {
  model_id: string;
  model_name: string;
  domain: string;
}

interface PaletteContext {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const Ctx = React.createContext<PaletteContext | null>(null);

/** Hook used by header search field & ⌘K hotkey to open the palette. */
export function useCommandPalette() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useCommandPalette must be used within <CommandPaletteProvider>");
  return ctx;
}

interface NavCommand {
  label: string;
  to: string;
  icon: LucideIcon;
  keywords?: string;
  shortcut?: string;
}

const NAV_COMMANDS: NavCommand[] = [
  { label: "Today",          to: "/today",                     icon: Sparkles,        keywords: "home briefing morning mission control",  shortcut: "g t" },
  { label: "Review Queue",   to: "/approvals",                 icon: ClipboardCheck,  keywords: "approvals decisions needs you inbox tasks", shortcut: "g r" },
  { label: "Email box",      to: "/email",                     icon: Mail,            keywords: "mailbox inbound carrier submissions triage" },
  { label: "Marketplace",    to: "/marketplace",               icon: Compass,         keywords: "agents browse activate",       shortcut: "g m" },
  { label: "My Agents",      to: "/my-models",                 icon: Box,             keywords: "models pods activated",        shortcut: "g a" },
  { label: "Request a custom pod", to: "/request-pod",         icon: Wand2,           keywords: "sop workflow custom request fideon build engineer" },
  { label: "Automations",    to: "/automations",               icon: Zap,             keywords: "workflow pipeline schedule",   shortcut: "g x" },
  { label: "Connect (MCP add-on)", to: "/connect",             icon: Plug,            keywords: "mcp claude chatgpt copilot slack tokens use elsewhere extend" },
  { label: "Training",       to: "/training",                  icon: GraduationCap,   keywords: "fine-tune model" },
  { label: "Decisions",      to: "/governance/decisions",      icon: Brain,           keywords: "governance audit" },
  { label: "Audit Log",      to: "/governance/audit-log",      icon: Shield,          keywords: "history events" },
  { label: "Devices",        to: "/devices",                   icon: Monitor,         keywords: "device admin" },
  { label: "Admin",          to: "/admin",                     icon: Shield,          keywords: "admin dashboard" },
  { label: "Settings",       to: "/settings",                  icon: Settings,        keywords: "preferences",                  shortcut: "g s" },
];

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [agents, setAgents] = React.useState<ActivatedAgent[]>([]);

  const ctx = React.useMemo<PaletteContext>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open],
  );

  // Cmd/Ctrl + K toggles the palette globally.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Load activated agents (lazy — only when palette opens).
  React.useEffect(() => {
    if (!open || agents.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        const { data } = await supabase
          .from("activated_models")
          .select("model_id, model_name, domain")
          .eq("user_id", user.id);
        if (!cancelled && data) setAgents(data as unknown as ActivatedAgent[]);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, agents.length]);

  const go = React.useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router],
  );

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    toast({ title: "Signed out" });
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command, search agents, or jump to a page…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No matches found.</CommandEmpty>

          {agents.length > 0 && (
            <>
              <CommandGroup heading="Your active agents">
                {agents.slice(0, 8).map((a) => (
                  <CommandItem
                    key={a.model_id}
                    value={`agent ${a.model_name} ${a.domain}`}
                    onSelect={() => go(`/pod/${a.model_id}`)}
                  >
                    <Box className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium">{a.model_name}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{a.domain}</span>
                    <CommandShortcut>open</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Navigation">
            {NAV_COMMANDS.map((cmd) => (
              <CommandItem
                key={cmd.to}
                value={`${cmd.label} ${cmd.keywords ?? ""} ${cmd.to}`}
                onSelect={() => go(cmd.to)}
              >
                <cmd.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{cmd.label}</span>
                {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem value="open settings" onSelect={() => go("/settings")}>
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              Open settings
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
            <CommandItem value="browse marketplace activate agent" onSelect={() => go("/marketplace")}>
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              Activate a new agent
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
            <CommandItem value="request custom pod sop fideon engineer" onSelect={() => go("/request-pod")}>
              <Wand2 className="mr-2 h-4 w-4 text-primary" />
              Request a custom pod
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
            <CommandItem value="sign out logout" onSelect={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </Ctx.Provider>
  );
}
