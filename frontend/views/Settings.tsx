'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  FolderOpen,
  Settings as SettingsIcon,
  Shield,
  CheckCircle2,
  AlertCircle,
  Key,
  Globe,
  Zap,
  Eye,
  EyeOff,
  Pencil,
  Sparkles,
  RotateCcw,
  DollarSign,
  Scale,
  Download,
  Code2,
  Monitor,
  ArrowRight,
  Activity,
  Server,
  Wifi,
  Clock,
  FileText,
  TrendingUp,
  Cloud
} from "lucide-react";
import DeploymentPanel from "@/components/settings/DeploymentPanel";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowSettings } from "@/hooks/useWorkflowSettings";

import appliedEpicLogo from "@/assets/logos/applied-epic-logo.png";
import hawksoftLogo from "@/assets/logos/hawksoft-logo.png";
import ams360Logo from "@/assets/logos/ams360-logo.png";
import qqCatalystLogo from "@/assets/logos/qq-catalyst-logo.png";
import ezlynxLogo from "@/assets/logos/ezlynx-logo.png";

interface CarrierCredentialData {
  username: string;
  password: string;
  enterpriseId: string;
}

interface CarrierCredential {
  id: string;
  name: string;
  logo: string;
  connected: boolean;
  lastSync?: string;
  credentials?: CarrierCredentialData;
}

interface AMSSystem {
  id: string;
  name: string;
  logo: string;
  connected: boolean;
  description: string;
  connectionType?: "sdk" | "ui";
  sdkCredentials?: { clientId: string; clientKey: string };
  uiCredentials?: { username: string; password: string; enterpriseId: string };
}

const carriers: CarrierCredential[] = [
  { id: "travelers", name: "Travelers", logo: "🏢", connected: false },
  { id: "hartford", name: "The Hartford", logo: "🦌", connected: false },
  { id: "chubb", name: "Chubb", logo: "🛡️", connected: true, lastSync: "2 hours ago", credentials: { username: "user@agency.com", password: "••••••••", enterpriseId: "ENT-12345" } },
  { id: "liberty-mutual", name: "Liberty Mutual", logo: "🗽", connected: false },
  { id: "nationwide", name: "Nationwide", logo: "🏠", connected: true, lastSync: "1 day ago", credentials: { username: "agent@nationwide.com", password: "••••••••", enterpriseId: "NW-67890" } },
  { id: "progressive", name: "Progressive Commercial", logo: "📊", connected: false },
  { id: "amtrust", name: "AmTrust", logo: "💼", connected: false },
  { id: "markel", name: "Markel", logo: "📈", connected: false },
  { id: "berkshire", name: "Berkshire Hathaway", logo: "🏛️", connected: false },
  { id: "zurich", name: "Zurich", logo: "🏔️", connected: false },
];

const amsSystemsList: AMSSystem[] = [
  { id: "applied-epic", name: "Applied Epic", logo: ((appliedEpicLogo as any).src || appliedEpicLogo) as string, connected: true, description: "Enterprise agency management with integrated analytics" },
  { id: "hawksoft", name: "HawkSoft", logo: ((hawksoftLogo as any).src || hawksoftLogo) as string, connected: false, description: "Cloud-based agency management for P&C agencies" },
  { id: "ams360", name: "AMS 360", logo: ((ams360Logo as any).src || ams360Logo) as string, connected: false, description: "Vertafore's comprehensive agency management solution" },
  { id: "qq-catalyst", name: "QQ Catalyst", logo: ((qqCatalystLogo as any).src || qqCatalystLogo) as string, connected: false, description: "Integrated management system for insurance professionals" },
  { id: "ezlynx", name: "EZLynx", logo: ((ezlynxLogo as any).src || ezlynxLogo) as string, connected: false, description: "Rating, management, and consumer engagement platform" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.4, ease: "easeOut" as const } }),
};

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 group hover:border-primary/30 transition-all duration-300">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.04] -translate-y-6 translate-x-6" style={{ background: `hsl(var(--primary))` }} />
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = ["deployment", "carriers", "ams", "workflow", "general", "system"].includes(searchParams.get("tab") || "")
    ? (searchParams.get("tab") as string)
    : "deployment";
  const { settings: workflowSettings, updateSettings: updateWorkflowSettings, resetToDefaults, DEFAULT_SETTINGS } = useWorkflowSettings();
  const [carrierCredentials, setCarrierCredentials] = useState(carriers);
  const [amsSystems, setAmsSystems] = useState(amsSystemsList);
  
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierCredential | null>(null);
  const [credentialForm, setCredentialForm] = useState<CarrierCredentialData>({ username: "", password: "", enterpriseId: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [isAMSConfigOpen, setIsAMSConfigOpen] = useState(false);
  const [selectedAMS, setSelectedAMS] = useState<AMSSystem | null>(null);
  const [amsConnectionType, setAmsConnectionType] = useState<"sdk" | "ui">("sdk");
  const [amsSDKForm, setAmsSDKForm] = useState({ clientId: "", clientKey: "" });
  const [amsUIForm, setAmsUIForm] = useState({ username: "", password: "", enterpriseId: "" });
  const [showAMSPassword, setShowAMSPassword] = useState(false);
  const [showAMSKey, setShowAMSKey] = useState(false);

  const openCredentialModal = (carrier: CarrierCredential, editing: boolean = false) => {
    setSelectedCarrier(carrier);
    setIsEditing(editing);
    if (editing && carrier.credentials) {
      setCredentialForm({ username: carrier.credentials.username, password: "", enterpriseId: carrier.credentials.enterpriseId });
    } else {
      setCredentialForm({ username: "", password: "", enterpriseId: "" });
    }
    setShowPassword(false);
    setIsCredentialModalOpen(true);
  };

  const handleCredentialSubmit = () => {
    if (!selectedCarrier) return;
    if (!credentialForm.username.trim() || !credentialForm.password.trim()) {
      toast({ title: "Validation Error", description: "Username and password are required", variant: "destructive" });
      return;
    }
    setCarrierCredentials(prev => prev.map(c => c.id === selectedCarrier.id ? { ...c, connected: true, lastSync: "Just now", credentials: { username: credentialForm.username, password: "••••••••", enterpriseId: credentialForm.enterpriseId } } : c));
    toast({ title: isEditing ? "Credentials Updated" : "Connected", description: `${selectedCarrier.name} ${isEditing ? "credentials updated" : "connected"} successfully` });
    setIsCredentialModalOpen(false);
    setSelectedCarrier(null);
    setCredentialForm({ username: "", password: "", enterpriseId: "" });
  };

  const handleCarrierDisconnect = (carrierId: string) => {
    const carrier = carrierCredentials.find(c => c.id === carrierId);
    setCarrierCredentials(prev => prev.map(c => c.id === carrierId ? { ...c, connected: false, lastSync: undefined, credentials: undefined } : c));
    toast({ title: "Disconnected", description: `${carrier?.name} disconnected successfully` });
  };

  const handleAMSConnect = (amsId: string) => {
    setAmsSystems(prev => prev.map(a => a.id === amsId ? { ...a, connected: !a.connected } : a));
    const ams = amsSystems.find(a => a.id === amsId);
    toast({ title: ams?.connected ? "Disconnected" : "Connected", description: `${ams?.name} ${ams?.connected ? "disconnected" : "connected"} successfully` });
  };

  const openAMSConfigModal = (ams: AMSSystem) => {
    setSelectedAMS(ams);
    setAmsConnectionType(ams.connectionType || "sdk");
    setAmsSDKForm(ams.sdkCredentials || { clientId: "", clientKey: "" });
    setAmsUIForm(ams.uiCredentials || { username: "", password: "", enterpriseId: "" });
    setShowAMSPassword(false);
    setShowAMSKey(false);
    setIsAMSConfigOpen(true);
  };

  const handleAMSConfigSubmit = () => {
    if (!selectedAMS) return;
    if (amsConnectionType === "sdk") {
      if (!amsSDKForm.clientId.trim() || !amsSDKForm.clientKey.trim()) {
        toast({ title: "Validation Error", description: "Client ID and Client Key are required", variant: "destructive" });
        return;
      }
    } else {
      if (!amsUIForm.username.trim() || !amsUIForm.password.trim() || !amsUIForm.enterpriseId.trim()) {
        toast({ title: "Validation Error", description: "Username, Password, and Enterprise ID are required", variant: "destructive" });
        return;
      }
    }
    setAmsSystems(prev => prev.map(a => a.id === selectedAMS.id ? { ...a, connected: true, connectionType: amsConnectionType, sdkCredentials: amsConnectionType === "sdk" ? amsSDKForm : undefined, uiCredentials: amsConnectionType === "ui" ? { ...amsUIForm, password: "••••••••" } : undefined } : a));
    toast({ title: "AMS Configured", description: `${selectedAMS.name} connected via ${amsConnectionType === "sdk" ? "SDK" : "UI"} successfully` });
    setIsAMSConfigOpen(false);
    setSelectedAMS(null);
  };

  const connectedCarriers = carrierCredentials.filter(c => c.connected).length;
  const connectedAMS = amsSystems.filter(a => a.connected).length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Premium Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card p-8"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.06),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/[0.03] blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <SettingsIcon className="h-5 w-5 text-primary" />
              </div>
              <Badge variant="secondary" className="text-xs font-medium">Workspace</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1 max-w-lg">
              Configure carriers, AMS integrations, and workflow intelligence for your agency
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              <div className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-card" />
              <div className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-card" />
            </div>
            <span className="text-xs text-muted-foreground">All systems operational</span>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <StatCard icon={Building2} label="Connected Carriers" value={`${connectedCarriers} / ${carrierCredentials.length}`} color="bg-primary/10 text-primary" />
        <StatCard icon={FolderOpen} label="Active AMS" value={`${connectedAMS} / ${amsSystems.length}`} color="bg-accent text-accent-foreground" />
        <StatCard icon={FileText} label="Documents Synced" value="1,247" color="bg-primary/10 text-primary" />
        <StatCard icon={Activity} label="API Health" value="100%" color="bg-green-500/10 text-green-600" />
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.4 }}
      >
        <Tabs defaultValue={tabParam} className="space-y-6">
          <TabsList className="bg-muted/60 backdrop-blur-sm border border-border p-1 h-auto flex-wrap gap-0.5 rounded-xl">
            <TabsTrigger value="deployment" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <Cloud className="h-4 w-4" />
              <span>Deployment</span>
            </TabsTrigger>
            <TabsTrigger value="carriers" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <Building2 className="h-4 w-4" />
              <span>Carriers</span>
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">{connectedCarriers}</Badge>
            </TabsTrigger>
            <TabsTrigger value="ams" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <FolderOpen className="h-4 w-4" />
              <span>AMS Systems</span>
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">{connectedAMS}</Badge>
            </TabsTrigger>
            <TabsTrigger value="workflow" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <Sparkles className="h-4 w-4" />
              <span>Workflow</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <SettingsIcon className="h-4 w-4" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2 rounded-lg data-[state=active]:shadow-sm px-4 py-2.5">
              <Zap className="h-4 w-4" />
              <span>System</span>
            </TabsTrigger>
          </TabsList>

          {/* ======= DEPLOYMENT TAB ======= */}
          <TabsContent value="deployment" className="space-y-6">
            <DeploymentPanel />
          </TabsContent>

          {/* ======= CARRIERS TAB ======= */}
          <TabsContent value="carriers" className="space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Carrier Credentials</CardTitle>
                      <CardDescription>Connect to carrier portals for document retrieval and quoting</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="hidden sm:flex gap-1.5 text-xs font-normal px-3 py-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {connectedCarriers} active
                  </Badge>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {carrierCredentials.map((carrier, i) => (
                    <motion.div key={carrier.id} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                      <div className={`group relative rounded-xl border p-4 transition-all duration-200 ${
                        carrier.connected 
                          ? "border-primary/40 bg-primary/[0.03] shadow-sm" 
                          : "border-border hover:border-primary/20 hover:bg-muted/30"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                              {carrier.logo}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground">{carrier.name}</p>
                              {carrier.connected && carrier.credentials && (
                                <p className="text-xs text-muted-foreground truncate">{carrier.credentials.username}</p>
                              )}
                              {carrier.connected && carrier.lastSync && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  Synced {carrier.lastSync}
                                </p>
                              )}
                              {!carrier.connected && (
                                <p className="text-xs text-muted-foreground">Not connected</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {carrier.connected ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCredentialModal(carrier, true)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleCarrierDisconnect(carrier.id)}>
                                  Disconnect
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => openCredentialModal(carrier, false)}>
                                Connect
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {carrier.connected && carrier.credentials?.enterpriseId && (
                          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Enterprise ID: <span className="font-medium text-foreground">{carrier.credentials.enterpriseId}</span></span>
                            <Badge className="text-[10px] h-5 bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10">Active</Badge>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">API Configuration</CardTitle>
                    <CardDescription>Configure API access for carrier integrations</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">OAuth 2.0 Authentication</p>
                      <p className="text-xs text-muted-foreground">Secure token-based authentication for all carriers</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Auto-sync Documents</p>
                      <p className="text-xs text-muted-foreground">Automatically sync new documents daily</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ======= AMS TAB ======= */}
          <TabsContent value="ams" className="space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Agency Management Systems</CardTitle>
                    <CardDescription>Connect your AMS to automatically attach retrieved documents</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6 space-y-3">
                {amsSystems.map((ams, i) => (
                  <motion.div key={ams.id} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                    <div className={`rounded-xl border p-5 transition-all duration-200 ${
                      ams.connected 
                        ? "border-primary/40 bg-primary/[0.03] shadow-sm" 
                        : "border-border hover:border-primary/20 hover:bg-muted/30"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-xl border border-border bg-card flex items-center justify-center p-2 flex-shrink-0">
                            <img src={(ams as any).logo || ""} alt={`${ams.name} logo`} className="h-full w-full object-contain" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground">{ams.name}</p>
                              {ams.connected && (
                                <Badge className="text-[10px] h-5 bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{ams.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
                          {ams.connected ? (
                            <>
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openAMSConfigModal(ams)}>Configure</Button>
                              <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleAMSConnect(ams.id)}>Disconnect</Button>
                            </>
                          ) : (
                            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => openAMSConfigModal(ams)}>
                              Connect AMS
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {ams.connected && (
                        <div className="mt-4 pt-4 border-t border-border/60">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                              { label: "Connection", value: ams.connectionType === "ui" ? "UI Login" : "SDK", icon: ams.connectionType === "ui" ? Monitor : Code2 },
                              { label: "Last Sync", value: "2 hours ago", icon: Clock },
                              { label: "Documents", value: "1,247", icon: FileText },
                              { label: "Status", value: "Healthy", icon: CheckCircle2 },
                            ].map((stat) => (
                              <div key={stat.label} className="flex items-center gap-2">
                                <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                                  <p className="text-xs font-medium text-foreground">{stat.value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm border-amber-500/20 bg-amber-500/[0.02]">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground mb-2">Integration Notes</p>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2"><span className="text-amber-500 mt-1">•</span>Only one AMS can be active at a time for document attachment</li>
                      <li className="flex items-start gap-2"><span className="text-amber-500 mt-1">•</span>Ensure your AMS account has API access enabled</li>
                      <li className="flex items-start gap-2"><span className="text-amber-500 mt-1">•</span>Documents are attached to the client record matching the policy number</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AMS Configuration Dialog */}
            <Dialog open={isAMSConfigOpen} onOpenChange={setIsAMSConfigOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedAMS && <img src={(selectedAMS as any).logo || ""} alt="" className="h-8 w-8 object-contain" />}
                    Configure {selectedAMS?.name}
                  </DialogTitle>
                  <DialogDescription>Choose how to connect to {selectedAMS?.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  <RadioGroup value={amsConnectionType} onValueChange={(v) => setAmsConnectionType(v as "sdk" | "ui")} className="grid grid-cols-2 gap-3">
                    <Label htmlFor="ams-sdk" className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${amsConnectionType === "sdk" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <RadioGroupItem value="sdk" id="ams-sdk" className="sr-only" />
                      <Code2 className="h-6 w-6 text-primary" />
                      <span className="font-medium text-sm">Via SDK</span>
                      <span className="text-xs text-muted-foreground text-center">Client ID & Key</span>
                    </Label>
                    <Label htmlFor="ams-ui" className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${amsConnectionType === "ui" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <RadioGroupItem value="ui" id="ams-ui" className="sr-only" />
                      <Monitor className="h-6 w-6 text-primary" />
                      <span className="font-medium text-sm">Via UI</span>
                      <span className="text-xs text-muted-foreground text-center">Username & Password</span>
                    </Label>
                  </RadioGroup>
                  {amsConnectionType === "sdk" ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ams-client-id">Client ID</Label>
                        <Input id="ams-client-id" placeholder="Enter Client ID" value={amsSDKForm.clientId} onChange={(e) => setAmsSDKForm(prev => ({ ...prev, clientId: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ams-client-key">Client Key</Label>
                        <div className="relative">
                          <Input id="ams-client-key" type={showAMSKey ? "text" : "password"} placeholder="Enter Client Key" value={amsSDKForm.clientKey} onChange={(e) => setAmsSDKForm(prev => ({ ...prev, clientKey: e.target.value }))} />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowAMSKey(!showAMSKey)}>
                            {showAMSKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ams-username">Username</Label>
                        <Input id="ams-username" placeholder="Enter username" value={amsUIForm.username} onChange={(e) => setAmsUIForm(prev => ({ ...prev, username: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ams-password">Password</Label>
                        <div className="relative">
                          <Input id="ams-password" type={showAMSPassword ? "text" : "password"} placeholder="Enter password" value={amsUIForm.password} onChange={(e) => setAmsUIForm(prev => ({ ...prev, password: e.target.value }))} />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowAMSPassword(!showAMSPassword)}>
                            {showAMSPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ams-enterprise-id">Enterprise ID</Label>
                        <Input id="ams-enterprise-id" placeholder="Enter Enterprise ID" value={amsUIForm.enterpriseId} onChange={(e) => setAmsUIForm(prev => ({ ...prev, enterpriseId: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAMSConfigOpen(false)}>Cancel</Button>
                  <Button onClick={handleAMSConfigSubmit}>{selectedAMS?.connected ? "Update" : "Connect"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ======= WORKFLOW TAB ======= */}
          <TabsContent value="workflow" className="space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Workflow Intelligence</CardTitle>
                      <CardDescription>Configure smart recommendations and cross-pod suggestions</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { resetToDefaults(); toast({ title: "Settings Reset", description: "Workflow settings have been reset to defaults" }); }}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6 space-y-5">
                {/* Master Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">Enable Smart Recommendations</p>
                      <p className="text-xs text-muted-foreground">Show contextual suggestions based on workflow activity</p>
                    </div>
                  </div>
                  <Switch checked={workflowSettings.enableSmartRecommendations} onCheckedChange={(checked) => updateWorkflowSettings({ enableSmartRecommendations: checked })} />
                </div>

                {/* Document Retrieval Threshold */}
                <div className={`space-y-4 p-5 rounded-xl border border-border transition-opacity ${!workflowSettings.enableSmartRecommendations ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Download className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-foreground">Document Retrieval — Quote Recommendation</p>
                      <p className="text-xs text-muted-foreground">Suggest Quote Generation when invoice premium exceeds threshold</p>
                    </div>
                  </div>
                  <div className="space-y-3 pl-[52px]">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" />Premium Threshold</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">${workflowSettings.documentRetrievalPremiumThreshold.toLocaleString()}</span>
                        {workflowSettings.documentRetrievalPremiumThreshold !== DEFAULT_SETTINGS.documentRetrievalPremiumThreshold && (
                          <Badge variant="secondary" className="text-[10px] h-5">Modified</Badge>
                        )}
                      </div>
                    </div>
                    <Slider value={[workflowSettings.documentRetrievalPremiumThreshold]} onValueChange={([value]) => updateWorkflowSettings({ documentRetrievalPremiumThreshold: value })} min={1000} max={50000} step={500} />
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>$1,000</span><span>$50,000</span></div>
                  </div>
                </div>

                {/* Policy Comparison Threshold */}
                <div className={`space-y-4 p-5 rounded-xl border border-border transition-opacity ${!workflowSettings.enableSmartRecommendations ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <Scale className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-foreground">Policy Comparison — Quote Recommendation</p>
                      <p className="text-xs text-muted-foreground">Suggest Quote Generation when compared policy premium exceeds threshold</p>
                    </div>
                  </div>
                  <div className="space-y-3 pl-[52px]">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" />Premium Threshold</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">${workflowSettings.policyComparisonPremiumThreshold.toLocaleString()}</span>
                        {workflowSettings.policyComparisonPremiumThreshold !== DEFAULT_SETTINGS.policyComparisonPremiumThreshold && (
                          <Badge variant="secondary" className="text-[10px] h-5">Modified</Badge>
                        )}
                      </div>
                    </div>
                    <Slider value={[workflowSettings.policyComparisonPremiumThreshold]} onValueChange={([value]) => updateWorkflowSettings({ policyComparisonPremiumThreshold: value })} min={1000} max={50000} step={500} />
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>$1,000</span><span>$50,000</span></div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 rounded-xl bg-primary/[0.03] border border-primary/10">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-xs text-foreground">How it works</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        When premiums exceed your configured thresholds, the system will display recommendations 
                        to use the Quote Generation pod to find potentially better rates from competitive carriers.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ======= GENERAL TAB ======= */}
          <TabsContent value="general" className="space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <SettingsIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Workspace Settings</CardTitle>
                    <CardDescription>Manage your workspace preferences</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workspace" className="text-xs">Workspace Name</Label>
                    <Input id="workspace" placeholder="My Workspace" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region" className="text-xs">Region</Label>
                    <Input id="region" placeholder="Local" disabled />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm">Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ======= SYSTEM TAB ======= */}
          <TabsContent value="system" className="space-y-6">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">System Diagnostics</CardTitle>
                    <CardDescription>View system information and connected endpoints</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Status", value: "Connected", icon: Wifi, color: "text-green-600" },
                    { label: "Active Carriers", value: `${connectedCarriers} Connected`, icon: Building2, color: "text-foreground" },
                    { label: "Active AMS", value: `${connectedAMS} Connected`, icon: FolderOpen, color: "text-foreground" },
                    { label: "API Health", value: "Operational", icon: Activity, color: "text-green-600" },
                  ].map((item) => (
                    <div key={item.label} className="p-4 rounded-xl border border-border bg-muted/20">
                      <item.icon className="h-4 w-4 text-muted-foreground mb-2" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                      <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full h-10 text-sm gap-2">
                  <Activity className="h-4 w-4" />
                  Run Diagnostics
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Carrier Credential Modal */}
      <Dialog open={isCredentialModalOpen} onOpenChange={setIsCredentialModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-3xl">{selectedCarrier?.logo}</span>
              {isEditing ? "Edit" : "Connect to"} {selectedCarrier?.name}
            </DialogTitle>
            <DialogDescription>Enter your carrier portal credentials to enable document retrieval and quoting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="carrier-username" className="text-xs">Username / Email</Label>
              <Input id="carrier-username" type="email" placeholder="agent@agency.com" value={credentialForm.username} onChange={(e) => setCredentialForm(prev => ({ ...prev, username: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier-password" className="text-xs">Password</Label>
              <div className="relative">
                <Input id="carrier-password" type={showPassword ? "text" : "password"} placeholder={isEditing ? "Enter new password" : "••••••••"} value={credentialForm.password} onChange={(e) => setCredentialForm(prev => ({ ...prev, password: e.target.value }))} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier-enterprise-id" className="text-xs">Enterprise ID (Optional)</Label>
              <Input id="carrier-enterprise-id" placeholder="ENT-12345" value={credentialForm.enterpriseId} onChange={(e) => setCredentialForm(prev => ({ ...prev, enterpriseId: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Some carriers require an enterprise or agency ID for API access</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsCredentialModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCredentialSubmit} className="gap-2">
              <Key className="h-4 w-4" />
              {isEditing ? "Update Credentials" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
