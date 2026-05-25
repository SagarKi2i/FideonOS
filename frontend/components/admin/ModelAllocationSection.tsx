'use client';
import { useState, useEffect } from 'react';
import { adminApi, agentsApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Package, UserCheck, Trash2, Plus, Loader2 } from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  role: string;
}

// Row from GET /api/admin/users/{id}/models (user_agents joined with agents).
interface AllocatedModel {
  id: string;          // user_agents row id (allocation id)
  agent_id: string;    // agents.id
  model_name: string;
  domain: string;
  activated_at: string;
}

// Row from GET /api/agents/marketplace.
interface MarketplaceAgent {
  id: string;
  name: string;
  domain: string;
}

export function ModelAllocationSection() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [allocatedModels, setAllocatedModels] = useState<AllocatedModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [allocating, setAllocating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchAllocatedModels(selectedUserId);
    } else {
      setAllocatedModels([]);
    }
  }, [selectedUserId]);

  async function fetchUsers() {
    try {
      const [usersData, agents] = await Promise.all([
        adminApi.users() as Promise<{ users?: UserInfo[] }>,
        agentsApi.marketplace() as Promise<MarketplaceAgent[]>,
      ]);
      setUsers(usersData.users || []);
      setMarketplaceAgents(agents || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchAllocatedModels(userId: string) {
    setLoadingModels(true);
    try {
      const data = (await adminApi.allocatedModels(userId)) as AllocatedModel[];
      setAllocatedModels(data || []);
    } catch (error) {
      console.error('Error fetching allocated models:', error);
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleAllocate() {
    if (!selectedUserId || !selectedModelId) return;

    const agent = marketplaceAgents.find(m => m.id === selectedModelId);
    if (!agent) return;

    setAllocating(true);
    try {
      await adminApi.allocateModel(selectedUserId, {
        agent_id: agent.id,
        model_name: agent.name,
        domain: agent.domain,
      });

      toast({ title: 'Model Allocated', description: `${agent.name} allocated successfully` });
      setSelectedModelId('');
      fetchAllocatedModels(selectedUserId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to allocate model';
      const alreadyAllocated = /already allocated/i.test(msg);
      toast({
        title: alreadyAllocated ? 'Already Allocated' : 'Error',
        description: alreadyAllocated ? 'This model is already allocated to this user' : msg,
        variant: 'destructive',
      });
    } finally {
      setAllocating(false);
    }
  }

  async function handleDeallocate(allocationId: string, modelName: string) {
    try {
      await adminApi.deallocateModel(selectedUserId, allocationId);
      toast({ title: 'Model Removed', description: `${modelName} deallocated successfully` });
      fetchAllocatedModels(selectedUserId);
    } catch (error) {
      console.error('Error deallocating model:', error);
      toast({ title: 'Error', description: 'Failed to remove model', variant: 'destructive' });
    }
  }

  const allocatedAgentIds = new Set(allocatedModels.map(m => m.agent_id));
  const availableModels = marketplaceAgents.filter(m => !allocatedAgentIds.has(m.id));
  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <Card className="border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-premium">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Model Allocation
        </CardTitle>
        <CardDescription>Allocate marketplace models to user accounts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User Selector */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Select User</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Choose a user"} />
              </SelectTrigger>
              <SelectContent>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <span>{user.email}</span>
                      <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Allocate Model</label>
              <div className="flex gap-2">
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center gap-2">
                          <span>{model.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{model.domain}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAllocate}
                  disabled={!selectedModelId || allocating}
                  size="icon"
                >
                  {allocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Allocated Models Table */}
        {selectedUserId && (
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Models allocated to {selectedUser?.email}
              <Badge variant="secondary">{allocatedModels.length}</Badge>
            </h4>

            {loadingModels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : allocatedModels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No models allocated to this user yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Allocated At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocatedModels.map(model => (
                    <TableRow key={model.id}>
                      <TableCell className="font-medium">{model.model_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{model.domain}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(model.activated_at || '').toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeallocate(model.id, model.model_name)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
