'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Monitor,
  Circle,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Key,
  Activity,
  History,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authApi, devicesApi, agentsApi } from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";

// public.devices
interface Device {
  id: string;
  device_token: string;
  status: "pending" | "active" | "suspended";
  hostname: string | null;
  os_type: string | null;
  app_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

// device_model_allocations joined with the agent catalog
interface DeviceModel {
  id: string;          // allocation id
  agent_id: string | null;
  model_name: string;
  notes: string | null;
  allocated_at: string;
  agents?: { keyword: string; name: string; domain: string } | null;
}

// device_sync_logs
interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  details: any;
  created_at: string;
}

// device_daily_analytics
interface AnalyticsRow {
  id: string;
  date: string;
  run_count: number;
  token_usage: number;
  error_count: number;
  sync_count: number;
}

// GET /api/agents/marketplace
interface MarketplaceAgent {
  id: string;
  name: string;
  domain: string;
}

export default function DeviceDetails() {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams(); const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [device, setDevice] = useState<Device | null>(null);
  const [allocatedModels, setAllocatedModels] = useState<DeviceModel[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [availableModels, setAvailableModels] = useState<MarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [allocating, setAllocating] = useState(false);

  useEffect(() => {
    checkAccess();
  }, [id]);

  const checkAccess = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        router.push("/auth");
        return;
      }

      const { role } = await authApi.role();
      const isAdmin = role === "admin";
      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "Only administrators can access device details",
          variant: "destructive",
        });
        router.push("/devices");
        return;
      }

      loadDeviceData();
    } catch (error) {
      console.error("Error checking access:", error);
      router.push("/auth");
    }
  };

  const loadDeviceData = async () => {
    if (!id) return;

    try {
      const [detail, allocations, analyticsRows, agents] = await Promise.all([
        devicesApi.get(id) as Promise<{ device: Device; logs: SyncLog[] }>,
        devicesApi.allocations(id) as Promise<DeviceModel[]>,
        devicesApi.analytics(id) as Promise<AnalyticsRow[]>,
        agentsApi.marketplace() as Promise<MarketplaceAgent[]>,
      ]);

      if (!detail?.device) {
        toast({
          title: "Not Found",
          description: "Device not found",
          variant: "destructive",
        });
        router.push("/devices");
        return;
      }

      setDevice(detail.device);
      setSyncLogs(detail.logs || []);
      setAllocatedModels(allocations || []);
      setAnalytics(analyticsRows || []);
      setAvailableModels(agents || []);
    } catch (error: any) {
      console.error("Error loading device data:", error);
      toast({
        title: "Error",
        description: "Failed to load device details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAllocateModels = async () => {
    if (selectedModels.length === 0) {
      toast({
        title: "No Models Selected",
        description: "Please select at least one model to allocate",
        variant: "destructive",
      });
      return;
    }

    setAllocating(true);
    try {
      // selectedModels holds marketplace agent ids.
      for (const agentId of selectedModels) {
        const agent = availableModels.find((m) => m.id === agentId);
        await devicesApi.allocate(id!, {
          agent_id: agentId,
          model_name: agent?.name || agentId,
        });
      }

      toast({
        title: "Models Allocated",
        description: `${selectedModels.length} model(s) allocated successfully`,
      });

      setIsAllocateOpen(false);
      setSelectedModels([]);
      loadDeviceData();
    } catch (error: any) {
      console.error("Error allocating models:", error);
      toast({
        title: "Allocation Failed",
        description: error.message || "Failed to allocate models",
        variant: "destructive",
      });
    } finally {
      setAllocating(false);
    }
  };

  const handleRemoveModel = async (allocationId: string, modelName: string) => {
    if (!confirm(`Remove ${modelName} from this device?`)) return;

    try {
      await devicesApi.deallocate(id!, allocationId);
      toast({
        title: "Model Removed",
        description: `${modelName} has been removed from this device`,
      });
      loadDeviceData();
    } catch (error: any) {
      console.error("Error removing model:", error);
      toast({
        title: "Remove Failed",
        description: error.message || "Failed to remove model",
        variant: "destructive",
      });
    }
  };

  const handleResetToken = async () => {
    if (!confirm("Are you sure you want to reset the device token? The device will need to re-register.")) return;

    try {
      await devicesApi.resetToken(id!);
      toast({
        title: "Token Reset",
        description: "Device token has been regenerated",
      });
      loadDeviceData();
    } catch (error: any) {
      console.error("Error resetting token:", error);
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset token",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/20">
            <Circle className="h-2 w-2 fill-success" />
            Active
          </Badge>
        );
      case "suspended":
        return (
          <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground">
            <Circle className="h-2 w-2 fill-muted-foreground" />
            Suspended
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Circle className="h-2 w-2" />
            Pending
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!device) {
    return null;
  }

  const alreadyAllocated = allocatedModels.map((m) => m.agent_id);
  const availableToAllocate = availableModels.filter(
    (m) => !alreadyAllocated.includes(m.id)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/devices")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {device.hostname || "Unnamed device"}
          </h1>
          <p className="text-muted-foreground mt-1">Device ID: {device.id}</p>
        </div>
        <div>{getStatusBadge(device.status)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Seen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {device.last_seen_at
                ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })
                : "Never"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OS / Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {device.os_type && device.app_version
                ? `${device.os_type} • v${device.app_version}`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Allocated Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allocatedModels.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="models" className="space-y-4">
        <TabsList>
          <TabsTrigger value="models" className="gap-2">
            <Package className="h-4 w-4" />
            Allocated Models
          </TabsTrigger>
          <TabsTrigger value="token" className="gap-2">
            <Key className="h-4 w-4" />
            Token
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <Activity className="h-4 w-4" />
            Sync Logs
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <History className="h-4 w-4" />
            Usage Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Allocated Models ({allocatedModels.length})</CardTitle>
                <Dialog open={isAllocateOpen} onOpenChange={setIsAllocateOpen}>
                  <Button
                    onClick={() => setIsAllocateOpen(true)}
                    className="gap-2"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Allocate Models
                  </Button>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Allocate Models to Device</DialogTitle>
                      <DialogDescription>
                        Select models to allocate to {device.hostname || "this device"}. The device will
                        receive these during the next sync.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {availableToAllocate.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No more models available to allocate
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {availableToAllocate.map((model) => (
                            <label
                              key={model.id}
                              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedModels.includes(model.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedModels([...selectedModels, model.id]);
                                  } else {
                                    setSelectedModels(
                                      selectedModels.filter((mid) => mid !== model.id)
                                    );
                                  }
                                }}
                                className="h-4 w-4"
                              />
                              <div className="flex-1">
                                <p className="font-medium">{model.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {model.domain}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsAllocateOpen(false);
                          setSelectedModels([]);
                        }}
                        disabled={allocating}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAllocateModels}
                        disabled={allocating || selectedModels.length === 0}
                      >
                        {allocating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Allocating...
                          </>
                        ) : (
                          `Allocate ${selectedModels.length} Model(s)`
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {allocatedModels.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    No Models Allocated
                  </h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Allocate models to this device to enable AI capabilities
                  </p>
                  <Button
                    onClick={() => setIsAllocateOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Allocate Models
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model Name</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocatedModels.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="font-medium">{model.model_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{model.agents?.domain || "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(model.allocated_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveModel(model.id, model.model_name)}
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="token" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Registration Token</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 rounded-lg bg-muted font-mono text-sm">
                    {showToken ? device.device_token : "••••••••••••••••••••••••••"}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(device.device_token);
                      toast({
                        title: "Copied",
                        description: "Token copied to clipboard",
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this token in the Electron app to authenticate with Fideon Fabric
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <Button
                  variant="destructive"
                  onClick={handleResetToken}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset Token
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Resetting the token will invalidate the current token. The device will need
                  to re-register.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync History ({syncLogs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No sync logs available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.sync_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status === "success" ? "outline" : "destructive"}
                            className={
                              log.status === "success" ? "bg-success/10 text-success" : ""
                            }
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                          {log.details ? JSON.stringify(log.details) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Usage ({analytics.length} days)</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No usage data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Syncs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {format(new Date(row.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>{row.run_count}</TableCell>
                        <TableCell>{row.token_usage.toLocaleString()}</TableCell>
                        <TableCell>{row.error_count}</TableCell>
                        <TableCell>{row.sync_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
