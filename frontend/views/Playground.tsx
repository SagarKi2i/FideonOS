'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  ShoppingCart,
  Cloud,
  HardDrive,
  MessageSquare,
  Wifi,
  WifiOff,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamChat } from "@/lib/aiChat";
import { getMockInsuranceResponse } from "@/lib/insuranceMocks";
import PolicyComparisonUI from "@/components/playground/PolicyComparisonUI";
import ACORDParserUI from "@/components/playground/ACORDParserUI";
import ClaimsFNOLUI from "@/components/playground/ClaimsFNOLUI";
import DocumentRetrievalUI from "@/components/playground/DocumentRetrievalUI";
import GenericPromptUI from "@/components/playground/GenericPromptUI";
import QuoteGenerationUI from "@/components/playground/QuoteGenerationUI";
import SubmissionIntakeUI from "@/components/playground/SubmissionIntakeUI";
import ClaimsAdjudicationUI from "@/components/playground/ClaimsAdjudicationUI";
import LossRunReportingDashboard from "@/components/playground/LossRunReportingDashboard";
import { SendToReviewButton } from "@/components/playground/SendToReviewButton";
import LocalModelManager from "@/components/LocalModelManager";
import {
  isElectron,
  checkOllamaStatus,
  checkNetworkStatus,
  generateWithOllama,
  getOllamaModelName,
  listOllamaModels,
} from "@/lib/ollama";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface ActivatedModel {
  id: string;
  model_id: string;
  model_name: string;
  domain: string;
}

export default function Playground() {
  const { toast } = useToast();
  const router = useRouter();
  const [models, setModels] = useState<ActivatedModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState("");
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [useLocalModel, setUseLocalModel] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [ollamaReady, setOllamaReady] = useState(false);

  useEffect(() => {
    checkAccess();
    checkElectronAndOllama();
    const interval = setInterval(async () => {
      const online = await checkNetworkStatus();
      setIsOnline(online);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkElectronAndOllama = async () => {
    const electron = await isElectron();
    setIsElectronApp(electron);
    if (electron) {
      const status = await checkOllamaStatus();
      setOllamaReady(status.running);
      const online = await checkNetworkStatus();
      setIsOnline(online);
      if (!online && status.running) setUseLocalModel(true);
    }
  };

  const checkAccess = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }

      const { data: roles } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", user.id);

      const isAdmin = (roles as any[])?.some(r => r.role === "admin");
      if (isAdmin) {
        toast({
          title: "Access denied",
          description: "Playground is only available for user accounts",
          variant: "destructive",
        });
        router.push("/dashboard");
        return;
      }
      loadActivatedModels(user.id);
    } catch (error) {
      console.error("Error checking access:", error);
      router.push("/auth");
    }
  };

  const loadActivatedModels = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("activated_models")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      setModels(data || []);
      if (data && data.length > 0) setSelectedModel(data[0].model_id);
    } catch (error) {
      console.error("Error loading models:", error);
      toast({ title: "Error", description: "Failed to load activated models", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (data: any) => {
    if (!selectedModel) {
      toast({ title: "Missing information", description: "Please select an agent", variant: "destructive" });
      return;
    }

    const selectedModelData = models.find(m => m.model_id === selectedModel);
    const isInsuranceModel = selectedModelData?.domain === "insurance";

    setIsRunning(true);
    setResult("");

    try {
      if (useLocalModel && isElectronApp) {
        if (!ollamaReady) {
          toast({ title: "Ollama not ready", description: "Please ensure Ollama is running to use local models", variant: "destructive" });
          setIsRunning(false);
          return;
        }
        const ollamaModels = await listOllamaModels();
        const ollamaModelName = getOllamaModelName(selectedModel);
        const modelInstalled = ollamaModels.some(m => m.name.startsWith(ollamaModelName.split(":")[0]));
        if (!modelInstalled) {
          toast({ title: "Model not installed", description: "Download the model first from the Local Model Manager", variant: "destructive" });
          setIsRunning(false);
          return;
        }
        const prompt = data.type === "generic" ? data.prompt : JSON.stringify(data, null, 2);
        const systemPrompt = `You are an AI assistant specialized in ${selectedModelData?.model_name}. Provide detailed and helpful responses.`;
        await generateWithOllama(ollamaModelName, prompt, systemPrompt, (chunk) => setResult(prev => prev + chunk));
        setIsRunning(false);
      } else if (isInsuranceModel) {
        const contextPrompt = data.type === "generic" ? data.prompt : JSON.stringify(data, null, 2);
        const mockResponse = getMockInsuranceResponse(selectedModel, contextPrompt);
        let currentIndex = 0;
        const streamInterval = setInterval(() => {
          if (currentIndex < mockResponse.length) {
            const chunk = mockResponse.slice(currentIndex, currentIndex + 5);
            setResult((prev) => prev + chunk);
            currentIndex += 5;
          } else {
            clearInterval(streamInterval);
            setIsRunning(false);
          }
        }, 20);
      } else {
        const messages = [{ role: "user" as const, content: data.type === "generic" ? data.prompt : JSON.stringify(data, null, 2) }];
        await streamChat({
          messages,
          onDelta: (delta) => setResult((prev) => prev + delta),
          onDone: () => setIsRunning(false),
          onError: (error) => {
            console.error("Streaming error:", error);
            toast({ title: "Error", description: typeof error === "string" ? error : "Failed to run prompt", variant: "destructive" });
            setIsRunning(false);
          },
        });
      }
    } catch (error: any) {
      console.error("Error running prompt:", error);
      toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
      setIsRunning(false);
    }
  };

  const selectedModelData = models.find(m => m.model_id === selectedModel);
  const modelName = selectedModelData?.model_name || "";

  const renderModelUI = () => {
    if (!selectedModel) return null;
    switch (selectedModel) {
      case "policy-comparison":
        return <PolicyComparisonUI modelId={selectedModel} onRun={handleRun} isRunning={isRunning} result={result} />;
      case "acord-parser":
        return <ACORDParserUI modelId={selectedModel} onRun={handleRun} isRunning={isRunning} result={result} />;
      case "claims-fnol":
        return <ClaimsFNOLUI onRun={handleRun} isRunning={isRunning} result={result} />;
      case "document-retrieval":
        return <DocumentRetrievalUI onRun={handleRun} isRunning={isRunning} result={result} />;
      case "quote-generation":
        return <QuoteGenerationUI onRun={handleRun} isRunning={isRunning} result={result} />;
      case "loss-run-reporting":
        return <LossRunReportingDashboard />;
      case "carrier-submission-intake":
      case "carrier-submission-triage":
        return <SubmissionIntakeUI onRun={handleRun} isRunning={isRunning} result={result} />;
      case "carrier-claims-intake":
      case "carrier-claims-adjudication":
      case "carrier-fraud-detection":
      case "carrier-subrogation":
        return <ClaimsAdjudicationUI onRun={handleRun} isRunning={isRunning} result={result} />;
      default:
        return <GenericPromptUI modelName={modelName} modelId={selectedModel} onRun={handleRun} isRunning={isRunning} result={result} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader
          eyebrow="Playground"
          title="Test your AI agents"
          description="Run agents on real data, refine prompts, then send results to the review queue."
          icon={MessageSquare}
        />
        <EmptyState
          icon={ShoppingCart}
          title="No agents activated yet"
          description="Activate an agent from the marketplace to start running it here."
          action={
            <Button variant="primary" size="lg" onClick={() => router.push("/marketplace")}>
              <Sparkles className="h-4 w-4" />
              Browse marketplace
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Playground"
        title="Test your AI agents"
        description="Pick an activated agent, give it real data, and watch the response stream back."
        icon={MessageSquare}
        actions={
          <>
            <StatusPill tone={isOnline ? "success" : "warning"} dot pulse={!isOnline}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? "Online" : "Offline"}
            </StatusPill>
            {isElectronApp && ollamaReady && (
              <StatusPill tone="primary" dot>
                <HardDrive className="h-3 w-3" />
                Ollama ready
              </StatusPill>
            )}
          </>
        }
      />

      {/* Agent picker — sticky toolbar style */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-eyebrow text-muted-foreground mb-1.5">Active agent</p>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-11 text-[14px] font-semibold bg-background w-full max-w-md">
                  <SelectValue placeholder="Choose an agent" />
                  <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.model_id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.model_name}</span>
                        <span className="text-[11px] text-muted-foreground capitalize">· {model.domain}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {selectedModelData && (
                <StatusPill tone="primary" className="capitalize">
                  {selectedModelData.domain}
                </StatusPill>
              )}

              {isElectronApp && ollamaReady && (
                <div
                  className={cn(
                    "flex items-center gap-2 h-10 px-3 rounded-lg border transition-colors",
                    useLocalModel
                      ? "bg-accent border-primary/30 text-primary"
                      : "bg-muted/40 border-border text-muted-foreground"
                  )}
                >
                  {useLocalModel ? <HardDrive className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
                  <span className="text-[12.5px] font-medium">{useLocalModel ? "Local" : "Cloud"}</span>
                  <Switch
                    checked={useLocalModel}
                    onCheckedChange={setUseLocalModel}
                    className="ml-1"
                  />
                </div>
              )}
            </div>
          </div>

          {!isOnline && isElectronApp && ollamaReady && (
            <p className="text-[12px] text-muted-foreground mt-3 flex items-center gap-1.5">
              <WifiOff className="h-3 w-3" />
              You're offline — local models will be used automatically.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Model-specific UI */}
      <div className="space-y-4">
        {renderModelUI()}

        {result && !isRunning && selectedModelData && (
          <div className="flex justify-end">
            <SendToReviewButton
              podModelId={selectedModel}
              podModelName={selectedModelData.model_name}
              domain={selectedModelData.domain}
              result={result}
            />
          </div>
        )}

        {isElectronApp && (
          <LocalModelManager activatedModels={models} />
        )}
      </div>
    </div>
  );
}
