'use client';
import { useSearchParams, useRouter } from 'next/navigation';
// Connect — the data + extension integration hub.
//
// Three tabs:
//   • Carriers — 500-carrier directory with status + connection method
//   • AMS     — the 5 named agency management systems
//   • MCP     — optional add-on for power users (Claude/ChatGPT/Copilot)
//
// MCP lives as its own tab, intentionally separate from the carrier/AMS
// integrations that are core to Fideon's value.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/hooks/use-toast";

import {
  Plug, Plus, Copy, Check, Trash2, Sparkles, Building2, Database,
  Activity, Clock, Code2, Loader2,
} from "lucide-react";

import CarriersPanel from "@/components/connect/CarriersPanel";
import AmsPanel from "@/components/connect/AmsPanel";

import { CARRIERS } from "@/lib/carriers";
import { AMS_SYSTEMS } from "@/lib/amsCatalog";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────── MCP types + config ───────────────────────────

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const MCP_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/mcp-server`;

const MCP_CLIENTS = [
  { id: "claude",   name: "Claude Desktop",   hint: "~/Library/Application Support/Claude/claude_desktop_config.json" },
  { id: "chatgpt",  name: "ChatGPT (Custom GPT)", hint: "OpenAI Actions / MCP" },
  { id: "copilot",  name: "Microsoft Copilot", hint: "Copilot Studio · custom connector" },
  { id: "cursor",   name: "Cursor",            hint: "~/.cursor/mcp.json" },
];

// ─────────────────────────── page ───────────────────────────

export default function Connect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "carriers" || tabParam === "ams" || tabParam === "mcp" ? tabParam : "overview";

  const handleTabChange = (t: string) => {
    if (t === "overview") router.replace('/connect');
    else router.push(`/connect?tab=${t}`);
  };

  // ─── MCP state (only loaded when MCP tab is opened) ───
  const { toast } = useToast();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "mcp" && !tokensLoaded) void loadTokens();
  }, [activeTab, tokensLoaded]);

  const loadTokens = async () => {
    setTokensLoading(true);
    const { data, error } = await supabase.functions.invoke("mcp-tokens", { method: "GET" });
    if (!error && data?.tokens) setTokens(data.tokens);
    setTokensLoaded(true);
    setTokensLoading(false);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("mcp-tokens", {
      method: "POST",
      body: { name: newName.trim(), scopes: ["all"] },
    });
    setCreating(false);
    if (error || !data?.token) {
      toast({ title: "Failed to create token", variant: "destructive" });
      return;
    }
    setRevealedToken(data.token);
    setNewName("");
    void loadTokens();
  };

  const revoke = async (id: string) => {
    await supabase.functions.invoke(`mcp-tokens?id=${id}`, { method: "DELETE" });
    void loadTokens();
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
    toast({ title: "Copied", description: "Configuration copied to clipboard." });
  };

  // ─── overview metrics ───
  const connectedCarriers = CARRIERS.filter((c) => c.status === "live").length;
  const connectedAms = AMS_SYSTEMS.filter((a) => a.status === "live").length;
  const activeTokens = tokens.filter((t) => !t.revoked_at).length;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        description="Carriers, agency management systems, and AI assistants. The connective tissue between Fideon and your existing stack."
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="carriers">
            <Building2 className="h-3.5 w-3.5" />
            Carriers
          </TabsTrigger>
          <TabsTrigger value="ams">
            <Database className="h-3.5 w-3.5" />
            AMS
          </TabsTrigger>
          <TabsTrigger value="mcp">
            <Sparkles className="h-3.5 w-3.5" />
            MCP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              label="Connected carriers"
              value={connectedCarriers}
              icon={Building2}
              tone="primary"
              hint={`of ${CARRIERS.length} named (500+ on request)`}
            />
            <KpiCard
              label="AMS connected"
              value={connectedAms}
              icon={Database}
              tone="primary"
              hint={`of ${AMS_SYSTEMS.length} supported`}
            />
            <KpiCard
              label="MCP tokens"
              value={tokensLoaded ? activeTokens : "—"}
              icon={Sparkles}
              tone="default"
              hint={tokensLoaded ? (activeTokens > 0 ? "active" : "none yet — optional") : "open MCP tab"}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OverviewTile
              icon={Building2}
              title="Carriers"
              tag={`${connectedCarriers} connected · ${CARRIERS.length}+ named`}
              body="Bidirectional integration with the carriers your book runs through — API where they offer one, portal scrape where they don't."
              cta="Browse carriers"
              onClick={() => handleTabChange("carriers")}
            />
            <OverviewTile
              icon={Database}
              title="AMS"
              tag={`${connectedAms} of ${AMS_SYSTEMS.length} connected`}
              body="Direct hooks into Applied Epic, AMS360, EZLynx, Hawksoft, and QQCatalyst. Agents read accounts, policies, loss runs, and write outputs back."
              cta="Manage AMS"
              onClick={() => handleTabChange("ams")}
            />
            <OverviewTile
              icon={Sparkles}
              title="MCP (add-on)"
              tag="Optional · power users"
              body="Expose Fideon agents to Claude, ChatGPT, Copilot, Cursor via Model Context Protocol. Same auth, same audit trail. Nothing changes for everyone else."
              cta="Configure MCP"
              onClick={() => handleTabChange("mcp")}
            />
          </div>
        </TabsContent>

        <TabsContent value="carriers" className="mt-0">
          <CarriersPanel />
        </TabsContent>

        <TabsContent value="ams" className="mt-0">
          <AmsPanel />
        </TabsContent>

        <TabsContent value="mcp" className="mt-0">
          <McpInline
            tokens={tokens}
            loading={tokensLoading}
            onCreate={() => { setRevealedToken(null); setNewName(""); setCreateOpen(true); }}
            onRevoke={revoke}
            onCopy={copy}
            copied={copied}
          />
        </TabsContent>
      </Tabs>

      {/* MCP create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold tracking-tight">
              {revealedToken ? "Token created" : "New MCP token"}
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {revealedToken
                ? "Copy this token now — you won't see the full value again. Paste into your AI client's MCP config."
                : "Name the connection (e.g. ‘My Claude Desktop'). Fideon issues a bearer token scoped to your agents."}
            </DialogDescription>
          </DialogHeader>

          {!revealedToken ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Connection name
                </Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Claude Desktop"
                  className="text-[13px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <pre className="rounded border border-border bg-muted/40 p-3 font-mono text-[11.5px] break-all whitespace-pre-wrap">
                {revealedToken}
              </pre>
              <div className="rounded border border-border bg-muted/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                  MCP server URL
                </p>
                <code className="text-[12px] font-mono text-foreground break-all">{MCP_URL}</code>
              </div>
            </div>
          )}

          <DialogFooter>
            {!revealedToken ? (
              <>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={create} disabled={creating || !newName.trim()}>
                  {creating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</> : <>Create token</>}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => copy(revealedToken, "new-token")}>
                  {copied === "new-token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy token
                </Button>
                <Button variant="primary" onClick={() => setCreateOpen(false)}>Done</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── overview tile ───────────────────────────

function OverviewTile({
  icon: Icon, title, tag, body, cta, onClick,
}: {
  icon: any;
  title: string;
  tag: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card className="p-4 hover:border-border-strong transition-colors flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{title}</h3>
      </div>
      <p className="text-[11.5px] text-muted-foreground mb-2">{tag}</p>
      <p className="text-[12.5px] text-foreground/85 leading-relaxed flex-1 mb-3">{body}</p>
      <Button variant="outline" size="sm" onClick={onClick} className="self-start">
        {cta}
      </Button>
    </Card>
  );
}

// ─────────────────────────── MCP inline tab ───────────────────────────

function McpInline({
  tokens, loading, onCreate, onRevoke, onCopy, copied,
}: {
  tokens: McpToken[];
  loading: boolean;
  onCreate: () => void;
  onRevoke: (id: string) => void;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const liveTokens = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Model Context Protocol</h2>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Optional add-on for power users. Generate a token below, paste it into your AI client's MCP config, and every Fideon agent becomes callable from Claude, ChatGPT, Copilot, or Cursor — with the same auth and audit trail.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />New token
        </Button>
      </div>

      {/* Server URL */}
      <Card className="p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          MCP server URL
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] font-mono text-foreground bg-muted/40 border border-border rounded px-3 py-2 break-all">
            {MCP_URL}
          </code>
          <Button variant="outline" size="sm" onClick={() => onCopy(MCP_URL, "url")}>
            {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy
          </Button>
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-2">
          Same URL across all clients. Pair with a token below as a Bearer header.
        </p>
      </Card>

      {/* Active tokens */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Active tokens</h3>
          <span className="text-[11.5px] text-muted-foreground tabular-nums">
            {liveTokens.length} {liveTokens.length === 1 ? "token" : "tokens"}
          </span>
        </div>
        {loading ? (
          <div className="p-6 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : liveTokens.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Sparkles}
            title="No tokens yet"
            description="MCP is optional. Create a token only if you want to call your Fideon agents from a third-party AI assistant."
            action={
              <Button variant="primary" size="sm" onClick={onCreate}>
                <Plus className="h-3.5 w-3.5" />Create your first token
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {liveTokens.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    <code className="font-mono">{t.token_prefix}…</code> · created {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    {t.last_used_at && <> · last used {formatDistanceToNow(new Date(t.last_used_at), { addSuffix: true })}</>}
                  </p>
                </div>
                <StatusPill tone="success" size="sm">Active</StatusPill>
                <Button variant="ghost" size="icon-sm" onClick={() => onRevoke(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Supported clients */}
      <div>
        <h3 className="text-[13px] font-semibold text-foreground mb-3">Supported clients</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MCP_CLIENTS.map((c) => (
            <Card key={c.id} className="p-3.5">
              <p className="text-[13px] font-semibold text-foreground">{c.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono break-all mt-1">{c.hint}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
