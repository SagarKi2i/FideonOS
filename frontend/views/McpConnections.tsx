'use client';
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plug, Plus, Copy, Check, Trash2, Sparkles, Terminal, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchPublishedPods } from "@/lib/pods";

interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface McpTool { name: string; desc: string; priority: string; }

// Fallback shown before pod_definitions loads (or pre-migration). The live list
// is fetched from published pods so every installed pod appears as an MCP tool.
const FALLBACK_TOOLS: McpTool[] = [
  { name: "quote_generation_fetch_quotes", desc: "Generate quotes from carriers", priority: "high" },
  { name: "loss_run_pull_report", desc: "Pull carrier loss runs", priority: "normal" },
  { name: "policy_compare", desc: "Side-by-side policy comparison & issued-vs-quoted check", priority: "normal" },
];

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const MCP_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/mcp-server`;

export default function McpConnections() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tools, setTools] = useState<McpTool[]>(FALLBACK_TOOLS);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("mcp-tokens", { method: "GET" });
    if (!error && data?.tokens) setTokens(data.tokens);
    setLoading(false);
  };
  const loadTools = async () => {
    const pods = await fetchPublishedPods();
    const list = pods
      .filter((p) => p.mcp_tool_name)
      .map((p) => ({
        name: p.mcp_tool_name as string,
        desc: (p.metadata?.oneLiner as string) ?? p.description ?? p.name,
        priority: "normal",
      }));
    if (list.length) setTools(list);
  };
  useEffect(() => { load(); loadTools(); }, []);

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
    load();
  };

  const revoke = async (id: string) => {
    await supabase.functions.invoke(`mcp-tokens?id=${id}`, { method: "DELETE" });
    load();
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  const claudeConfig = (token: string) => JSON.stringify({
    mcpServers: {
      fideon: {
        url: MCP_URL,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connect to Claude, Copilot & ChatGPT</h1>
            <p className="text-sm text-muted-foreground">
              Bring Fideon's pods into the AI tools your team already uses. Zero new UI to learn.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { icon: Sparkles, t: "5 hero tools live", s: "Quote, loss-run, compare, triage, FNOL" },
          { icon: Zap, t: "Same governance", s: "RLS, audit log, review queue all enforced" },
          { icon: Terminal, t: "1-line install", s: "Copy URL + token into Claude Desktop" },
        ].map((it, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="h-full">
              <CardContent className="p-4 flex gap-3">
                <it.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{it.t}</p>
                  <p className="text-xs text-muted-foreground">{it.s}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Your MCP tokens</CardTitle>
            <CardDescription>Each token authenticates one AI client (Claude, Copilot, ChatGPT, Cursor…)</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New token
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <Plug className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No tokens yet</p>
              <p className="text-xs text-muted-foreground mb-4">Create one to plug Fideon into Claude.</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Generate first token
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{t.name}</p>
                      {t.revoked_at && <Badge variant="destructive" className="text-[10px]">revoked</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{t.token_prefix}…</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString()}` : "Never used"}
                      {" · "}
                      Created {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!t.revoked_at && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(t.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available tools</CardTitle>
          <CardDescription>Exposed to any connected AI client. Mutating actions land in the broker's Inbox for approval.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2">
          {tools.map((tool) => (
            <div key={tool.name} className="border rounded-md p-3">
              <p className="text-sm font-mono">{tool.name}</p>
              <p className="text-xs text-muted-foreground">{tool.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setRevealedToken(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{revealedToken ? "Token created — copy it now" : "Create MCP token"}</DialogTitle>
            <DialogDescription>
              {revealedToken
                ? "This is the only time you'll see the full token. Store it somewhere safe."
                : "Name this token after the device or assistant that will use it."}
            </DialogDescription>
          </DialogHeader>

          {!revealedToken ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Token name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Sarah's Claude Desktop"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <Tabs defaultValue="token">
              <TabsList>
                <TabsTrigger value="token">Token</TabsTrigger>
                <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
                <TabsTrigger value="generic">Other clients</TabsTrigger>
              </TabsList>
              <TabsContent value="token" className="space-y-2">
                <Label>MCP server URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={MCP_URL} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copy(MCP_URL, "url")}>
                    {copied === "url" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <Label>Bearer token</Label>
                <div className="flex gap-2">
                  <Input readOnly value={revealedToken} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copy(revealedToken, "tok")}>
                    {copied === "tok" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="claude">
                <p className="text-xs text-muted-foreground mb-2">
                  Paste into <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> and restart Claude.
                </p>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-72">
{claudeConfig(revealedToken)}
                </pre>
                <Button size="sm" variant="outline" className="mt-2"
                  onClick={() => copy(claudeConfig(revealedToken), "claude")}>
                  {copied === "claude" ? <><Check className="w-4 h-4 mr-1" /> Copied</> : <><Copy className="w-4 h-4 mr-1" /> Copy config</>}
                </Button>
              </TabsContent>
              <TabsContent value="generic">
                <p className="text-xs text-muted-foreground">
                  Any MCP-compatible client. Use Streamable HTTP transport with:
                </p>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto mt-2">
{`URL:    ${MCP_URL}
Header: Authorization: Bearer ${revealedToken}`}
                </pre>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            {!revealedToken ? (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={create} disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create token"}
                </Button>
              </>
            ) : (
              <Button onClick={() => { setCreateOpen(false); setRevealedToken(null); }}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
