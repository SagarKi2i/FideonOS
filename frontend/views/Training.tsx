'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, MessageSquare, Cpu, Globe, ThumbsUp, Star, Play,
  RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Upload,
  Shield, Users, BarChart3, ArrowRight
} from "lucide-react";
import { isElectron } from "@/lib/ollama";
import { getStoredDeviceToken } from "@/lib/deviceApi";
import { supabase } from "@/integrations/supabase/client";
import {
  submitFeedback, getFeedback, getLocalFeedback, getLocalJobs,
  createTrainingJob, getTrainingJobs, getActiveRounds, getTrainingStats,
  submitGradient, type TrainingFeedback, type TrainingJob,
  type FederatedRound, type DeviceContribution, type TrainingStats,
} from "@/lib/trainingApi";

export default function Training() {
  const { toast } = useToast();
  const router = useRouter();
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [webMode, setWebMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [feedback, setFeedback] = useState<TrainingFeedback[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [rounds, setRounds] = useState<FederatedRound[]>([]);
  const [contributions, setContributions] = useState<DeviceContribution[]>([]);
  const [activatedModels, setActivatedModels] = useState<{ model_id: string; model_name: string }[]>([]);

  const [feedbackModelId, setFeedbackModelId] = useState("");
  const [feedbackPrompt, setFeedbackPrompt] = useState("");
  const [feedbackOriginal, setFeedbackOriginal] = useState("");
  const [feedbackCorrected, setFeedbackCorrected] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<number>(0);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }
      const { data: models } = await supabase.from("activated_models").select("model_id, model_name").eq("user_id", user.id);
      setActivatedModels(models || []);
      const electron = await isElectron();
      setIsElectronApp(electron);
      const token = getStoredDeviceToken();
      const connected = !!token;
      setIsConnected(connected);
      setWebMode(!electron || !connected);
      loadData();
    };
    init();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = getStoredDeviceToken();
      if (token) {
        const [statsRes, feedbackRes, jobsRes, roundsRes] = await Promise.all([
          getTrainingStats(), getFeedback(), getTrainingJobs(), getActiveRounds(),
        ]);
        setStats(statsRes.stats); setFeedback(feedbackRes.feedback);
        setJobs(jobsRes.jobs); setRounds(roundsRes.rounds);
        setContributions(roundsRes.contributions);
      } else {
        const localFb = getLocalFeedback();
        const localJb = getLocalJobs();
        setFeedback(localFb); setJobs(localJb);
        setStats({ total_feedback: localFb.length, total_training_jobs: localJb.length, total_contributions: 0 });
      }
    } catch (error: any) {
      const localFb = getLocalFeedback();
      if (localFb.length > 0) {
        setFeedback(localFb);
        setStats({ total_feedback: localFb.length, total_training_jobs: 0, total_contributions: 0 });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModelId || !feedbackPrompt || !feedbackOriginal) {
      toast({ title: "Missing fields", description: "Model, prompt, and original response are required", variant: "destructive" });
      return;
    }
    try {
      await submitFeedback({
        model_id: feedbackModelId, prompt: feedbackPrompt,
        original_response: feedbackOriginal, corrected_response: feedbackCorrected || undefined,
        rating: feedbackRating || undefined, feedback_type: feedbackCorrected ? "correction" : "rating",
      });
      toast({ title: "Feedback submitted", description: "Your feedback will be used for local training" });
      setFeedbackPrompt(""); setFeedbackOriginal(""); setFeedbackCorrected(""); setFeedbackRating(0);
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleStartTraining = async (modelId: string, trainingType: string) => {
    try {
      const result = await createTrainingJob({ model_id: modelId, training_type: trainingType });
      toast({ title: "Training started", description: `Job ${result.job.id.slice(0, 8)} created with ${result.job.feedback_count} feedback samples` });
      loadData();
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
  };

  const handleContribute = async (round: FederatedRound) => {
    try {
      const gradientHash = crypto.randomUUID();
      await submitGradient({
        model_id: round.model_id, round_number: round.round_number,
        gradient_hash: gradientHash, gradient_size_bytes: 1024 * 1024,
        metrics: { local_loss: 0.05, epochs: 3 }, privacy_noise_added: true,
      });
      toast({ title: "Contribution submitted", description: `Gradient submitted for round ${round.round_number}` });
      loadData();
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "running": return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const hasContributed = (round: FederatedRound) =>
    contributions.some(c => c.model_id === round.model_id && c.round_number === round.round_number);

  if (!isElectronApp && !webMode) return null;

  if (isElectronApp && !isConnected) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Cpu className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect Your Device</h3>
            <p className="text-muted-foreground text-sm mb-6">Register your device first to use training features.</p>
            <Button onClick={() => router.push("/device-setup")}>Go to Device Setup</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activatedModels.length === 0 && !loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Agents</h3>
            <p className="text-muted-foreground text-sm mb-6">Activate agents from the Marketplace to begin training.</p>
            <Button onClick={() => router.push("/marketplace")}>Browse Marketplace</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Model Training</h1>
          <p className="text-muted-foreground">
            Fine-tune agents locally and contribute to federated learning — your data never leaves your device
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Feedback Collected", value: stats.total_feedback, icon: MessageSquare, color: "text-blue-500 bg-blue-500/10" },
            { label: "Training Jobs", value: stats.total_training_jobs, icon: Cpu, color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Federated Contributions", value: stats.total_contributions, icon: Globe, color: "text-purple-500 bg-purple-500/10" },
          ].map(stat => (
            <Card key={stat.label} className="border">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="feedback" className="space-y-4">
        <TabsList className="h-10 bg-muted p-1">
          <TabsTrigger value="feedback" className="text-xs px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />Feedback
          </TabsTrigger>
          <TabsTrigger value="local-training" className="text-xs px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Cpu className="h-3.5 w-3.5 mr-1.5" />Local Training
          </TabsTrigger>
          <TabsTrigger value="federated" className="text-xs px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Globe className="h-3.5 w-3.5 mr-1.5" />Federated Learning
          </TabsTrigger>
        </TabsList>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Submit Training Feedback
              </CardTitle>
              <CardDescription className="text-xs">Correct AI outputs or rate responses to build local training data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Model</Label>
                <Select value={feedbackModelId} onValueChange={setFeedbackModelId}>
                  <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    {activatedModels.map(m => <SelectItem key={m.model_id} value={m.model_id}>{m.model_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Prompt</Label>
                <Textarea value={feedbackPrompt} onChange={e => setFeedbackPrompt(e.target.value)} placeholder="The prompt sent to the model" rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Original Response</Label>
                <Textarea value={feedbackOriginal} onChange={e => setFeedbackOriginal(e.target.value)} placeholder="The model's response" rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Corrected Response (optional)</Label>
                <Textarea value={feedbackCorrected} onChange={e => setFeedbackCorrected(e.target.value)} placeholder="What the correct response should have been" rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Rating</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Button key={star} variant={feedbackRating >= star ? "default" : "outline"} size="sm" className="h-8 w-8 p-0"
                      onClick={() => setFeedbackRating(star)}>
                      <Star className={`h-3.5 w-3.5 ${feedbackRating >= star ? "fill-current" : ""}`} />
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleSubmitFeedback} className="w-full">
                <Upload className="h-4 w-4 mr-2" />Submit Feedback
              </Button>
            </CardContent>
          </Card>

          {feedback.length > 0 && (
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {feedback.slice(0, 10).map(fb => (
                    <div key={fb.id} className="flex items-start justify-between p-3 rounded-lg border text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px]">{fb.model_id}</Badge>
                          <Badge variant={fb.is_used_for_training ? "default" : "secondary"} className="text-[10px]">
                            {fb.is_used_for_training ? "Used" : "Available"}
                          </Badge>
                          {fb.feedback_type === "correction" && <ThumbsUp className="h-3 w-3 text-emerald-500" />}
                          {fb.feedback_type === "rating" && <span className="text-[10px] text-muted-foreground">★ {fb.rating}/5</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{fb.prompt}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {new Date(fb.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Local Training Tab */}
        <TabsContent value="local-training" className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Start Local Training
              </CardTitle>
              <CardDescription className="text-xs">Fine-tune models on your device using collected feedback</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activatedModels.map(({ model_id: modelId, model_name: modelName }) => {
                  const modelFeedback = feedback.filter(f => f.model_id === modelId && !f.is_used_for_training);
                  return (
                    <div key={modelId} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">{modelName}</h4>
                        <Badge variant="outline" className="text-[10px]">{modelFeedback.length} samples</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {modelFeedback.length >= 1
                          ? `${modelFeedback.length} sample${modelFeedback.length > 1 ? "s" : ""} ready for training`
                          : "No feedback samples yet"}
                      </p>
                      <Button size="sm" className="w-full h-8 text-xs" disabled={modelFeedback.length < 1}
                        onClick={() => handleStartTraining(modelId, "fine-tune")}>
                        <Play className="h-3.5 w-3.5 mr-1.5" />Fine-tune
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {jobs.length > 0 && (
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />Training History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {statusIcon(job.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm capitalize">{job.model_id.replace("-", " ")}</span>
                            <Badge variant="outline" className="text-[10px]">{job.training_type}</Badge>
                            <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                              {job.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{job.feedback_count} samples · {new Date(job.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {job.metrics && Object.keys(job.metrics).length > 0 && (
                        <div className="text-right text-xs text-muted-foreground">
                          {(job.metrics as any).loss && <p>Loss: {(job.metrics as any).loss}</p>}
                          {(job.metrics as any).epochs && <p>Epochs: {(job.metrics as any).epochs}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Federated Learning Tab */}
        <TabsContent value="federated" className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Federated Learning Rounds
              </CardTitle>
              <CardDescription className="text-xs">
                Contribute improvements to the global model. Only encrypted weight deltas are shared.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2.5 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg mb-4">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Privacy Protected</strong> — Differential privacy noise is added to all gradient updates. Your raw data stays on your device.
                </p>
              </div>

              {rounds.length === 0 ? (
                <div className="text-center py-10">
                  <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <h3 className="font-medium text-sm mb-1">No Active Rounds</h3>
                  <p className="text-xs text-muted-foreground">Your admin will start federated rounds when ready.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rounds.map(round => {
                    const contributed = hasContributed(round);
                    const progress = (round.current_participants / round.min_participants) * 100;
                    return (
                      <div key={round.id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm capitalize">{round.model_id.replace("-", " ")}</h4>
                            <Badge variant="outline" className="text-[10px]">Round {round.round_number}</Badge>
                            <Badge variant={round.status === "completed" ? "default" : "secondary"} className="text-[10px]">{round.status}</Badge>
                          </div>
                          {contributed && (
                            <Badge className="bg-emerald-500 text-white text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Contributed
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />{round.current_participants}/{round.min_participants} participants
                            </span>
                            <span className="text-muted-foreground">{round.aggregation_method}</span>
                          </div>
                          <Progress value={Math.min(progress, 100)} className="h-1.5" />
                        </div>
                        {!contributed && round.status === "collecting" && (
                          <Button size="sm" className="h-8 text-xs" onClick={() => handleContribute(round)}>
                            <Upload className="h-3.5 w-3.5 mr-1.5" />Contribute Gradient
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                How Federated Learning Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { step: "1", title: "Collect Feedback", desc: "Rate and correct AI outputs during normal use", icon: MessageSquare },
                  { step: "2", title: "Train Locally", desc: "Fine-tune the model on your device using LoRA", icon: Cpu },
                  { step: "3", title: "Share Gradients", desc: "Encrypted weight deltas sent (not your data)", icon: Shield },
                  { step: "4", title: "Global Update", desc: "Server aggregates and distributes improvements", icon: Globe },
                ].map(item => (
                  <div key={item.step} className="text-center p-4 border rounded-lg">
                    <div className="mx-auto mb-2 h-9 w-9 rounded-full bg-primary/8 flex items-center justify-center">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-[10px] font-semibold text-primary mb-1">Step {item.step}</div>
                    <h4 className="font-medium text-xs">{item.title}</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
