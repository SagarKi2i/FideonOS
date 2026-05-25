'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Package,
  UserCheck,
  Mail,
  ShieldCheck,
  User,
  Sparkles,
  ChevronDown,
  X,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authApi, adminApi, agentsApi } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface UserAccount {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

// A row from GET /api/admin/users/{id}/models (user_agents joined with agents).
interface AllocatedModel {
  id: string;          // user_agents row id (allocation id)
  agent_id: string;    // agents.id
  model_name: string;
  domain: string;
  activated_at: string;
}

// A row from GET /api/agents/marketplace.
interface MarketplaceAgent {
  id: string;
  name: string;
  domain: string;
}

export default function Devices() {
  const { toast } = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [userModels, setUserModels] = useState<Record<string, AllocatedModel[]>>({});
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);

  // Inline allocation state per user
  const [allocatingForUser, setAllocatingForUser] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [allocating, setAllocating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAllocatingForUser(null);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkAccessAndLoad = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }

      const { role } = await authApi.role();
      if (role !== "admin") {
        toast({ title: "Access Denied", description: "Admin only", variant: "destructive" });
        router.push("/"); return;
      }

      await loadUsers();
    } catch {
      router.push("/auth");
    }
  };

  const loadUsers = async () => {
    try {
      const [usersData, agents] = await Promise.all([
        adminApi.users() as Promise<{ users?: UserAccount[] }>,
        agentsApi.marketplace() as Promise<MarketplaceAgent[]>,
      ]);
      const userList: UserAccount[] = usersData.users || [];
      setUsers(userList);
      setMarketplaceAgents(agents || []);

      // Per-user allocation lists (no bulk endpoint — fetch in parallel).
      const entries = await Promise.all(
        userList.map(async (u) => {
          try {
            const models = (await adminApi.allocatedModels(u.id)) as AllocatedModel[];
            return [u.id, models || []] as const;
          } catch {
            return [u.id, [] as AllocatedModel[]] as const;
          }
        })
      );
      setUserModels(Object.fromEntries(entries));
    } catch (error) {
      console.error("Error loading users:", error);
      toast({ title: "Error", description: "Failed to load user accounts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAllocate = async (userId: string, userEmail: string, agentId: string) => {
    const agent = marketplaceAgents.find(a => a.id === agentId);
    if (!agent) return;

    setAllocating(true);
    try {
      await adminApi.allocateModel(userId, {
        agent_id: agent.id,
        model_name: agent.name,
        domain: agent.domain,
      });

      toast({ title: "Model Allocated", description: `${agent.name} allocated to ${userEmail}` });
      setAllocatingForUser(null);
      setSearchTerm("");
      loadUsers();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to allocate model";
      const alreadyAllocated = /already allocated/i.test(msg);
      toast({
        title: alreadyAllocated ? "Already Allocated" : "Error",
        description: alreadyAllocated ? "Model already assigned to this user" : msg,
        variant: "destructive",
      });
    } finally {
      setAllocating(false);
    }
  };

  const handleDeallocate = async (userId: string, allocationId: string, modelName: string) => {
    try {
      await adminApi.deallocateModel(userId, allocationId);
      toast({ title: "Model Removed", description: `${modelName} deallocated` });
      loadUsers();
    } catch (error) {
      console.error("Error deallocating:", error);
      toast({ title: "Error", description: "Failed to remove model", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 space-y-8 animate-fade-in">
        {/* Hero Header */}
        <div className="relative rounded-2xl bg-gradient-hero p-8 border border-border/50 backdrop-blur-sm shadow-premium">
          <div className="absolute inset-0 bg-gradient-subtle rounded-2xl opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-card">
                <Users className="h-7 w-7 text-primary animate-float" />
              </div>
              <h1 className="text-4xl font-display font-bold tracking-tight bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                User Accounts
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Manage user accounts and allocate AI models
            </p>
          </div>
        </div>

        {/* User Cards */}
        {users.length === 0 ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border/50 shadow-card">
            <CardContent className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-hero mb-6">
                <Users className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-2xl font-display font-bold mb-3">No Users Found</h3>
              <p className="text-muted-foreground max-w-md mx-auto text-lg">
                Create user accounts from the Admin Dashboard
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {users.map((user, index) => {
              const models = userModels[user.id] || [];
              const isAdmin = user.role === "admin";
              const isPickerOpen = allocatingForUser === user.id;
              const availableModels = marketplaceAgents.filter(
                m => !models.some(um => um.agent_id === m.id)
              );
              const filteredModels = availableModels.filter(m =>
                m.name.toLowerCase().includes(searchTerm.toLowerCase())
              );

              return (
                <Card
                  key={user.id}
                  className="group relative overflow-hidden bg-card/90 backdrop-blur-sm border-border/50 shadow-card hover:shadow-premium hover:border-primary/30 transition-all duration-300 animate-scale-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity duration-300" />

                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-3 rounded-xl bg-gradient-hero group-hover:scale-110 transition-transform duration-300">
                        {isAdmin ? (
                          <ShieldCheck className="h-6 w-6 text-primary" />
                        ) : (
                          <User className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <Badge variant={isAdmin ? "default" : "secondary"}>
                        {isAdmin ? "Admin" : "User"}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg font-display font-bold group-hover:text-primary transition-colors truncate">
                      {user.email}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span>Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Allocated Models */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Allocated Models
                        </span>
                        <Badge variant="outline" className="text-[10px]">{models.length}</Badge>
                      </div>

                      {models.length > 0 ? (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {models.map(model => (
                            <div key={model.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <UserCheck className="h-3 w-3 text-primary shrink-0" />
                                <span className="truncate font-medium">{model.model_name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeallocate(user.id, model.id, model.model_name)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic py-2">No models allocated</p>
                      )}
                    </div>

                    {/* Inline Model Picker */}
                    <div className="relative" ref={isPickerOpen ? dropdownRef : undefined}>
                      {isPickerOpen ? (
                        <div className="border border-border rounded-lg bg-card shadow-lg">
                          {/* Search input */}
                          <div className="flex items-center gap-2 p-2 border-b border-border">
                            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                              placeholder="Search models..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0"
                              onClick={() => { setAllocatingForUser(null); setSearchTerm(""); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          {/* Model list */}
                          <div className="max-h-40 overflow-y-auto">
                            {filteredModels.length > 0 ? (
                              filteredModels.map(model => (
                                <button
                                  key={model.id}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/80 transition-colors text-left disabled:opacity-50"
                                  disabled={allocating}
                                  onClick={() => handleAllocate(user.id, user.email, model.id)}
                                >
                                  <span className="font-medium truncate">{model.name}</span>
                                  <Badge variant="secondary" className="text-[10px] shrink-0">{model.domain}</Badge>
                                </button>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-3">No models available</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => { setAllocatingForUser(user.id); setSearchTerm(""); }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Allocate Model
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
