'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { getApiUrl } from "@/lib/apiBase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import fideonLogo from "@/assets/fideon-logo.png";
import { ArrowRight, Loader2, ShieldCheck, Plug, Lock, Eye, EyeOff } from "lucide-react";

function safeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('/auth')) return null;
  return path;
}

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotSent, setForgotSent] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'));

  // Check if already authenticated
  useEffect(() => {
    fetch(`${getApiUrl()}/api/auth/me`, { credentials: "include" })
      .then((r) => {
        if (r.ok) router.replace(redirectTo ?? '/today');
      })
      .catch(() => {});
  }, [router, redirectTo]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = (await authApi.login(email, password)) as { logged_in?: boolean } | undefined;
      // OTP-bypassed accounts (e.g. the seeded test admin) are already signed in —
      // skip the OTP page. Everyone else gets a code and goes to /auth/otp.
      if (res?.logged_in) {
        await refreshUser();
        router.push(redirectTo ?? "/today");
        return;
      }
      // Store email in sessionStorage so OTP page knows who to verify
      sessionStorage.setItem("otp_email", email);
      router.push("/auth/otp");
    } catch (error: any) {
      toast({ title: "Unable to sign in", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setForgotSent(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: ShieldCheck, label: "Purpose-built insurance agents",               desc: "Quotes, renewals, claims, submissions, loss runs — handled by agents that know your workflows" },
    { icon: Lock,        label: "Model Risk Management built in",               desc: "Every decision confidence-scored, reviewable, audited — pass any compliance review" },
    { icon: Plug,        label: "Optional: extend to Claude, ChatGPT, Copilot", desc: "Power users can call the same agents from their AI assistant via MCP" },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding panel */}
      <div className="relative hidden lg:flex lg:w-[520px] xl:w-[560px] bg-gradient-premium flex-col justify-between p-12 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: 'radial-gradient(80% 50% at 0% 0%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(60% 50% at 100% 100%, rgba(255,255,255,0.10), transparent 55%)' }} aria-hidden />
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center p-1">
            <img src={typeof fideonLogo === "object" ? (fideonLogo as any).src : fideonLogo} alt="Fideon" className="h-8 w-8 object-contain" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-primary-foreground">Fideon OS</span>
        </div>
        <div className="space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-medium text-primary-foreground/50 uppercase tracking-widest">The intelligent operating system for insurance</p>
            <h1 className="text-4xl xl:text-[2.75rem] font-bold leading-[1.15] text-primary-foreground">
              AI agents that<br />run your day &mdash;<br />
              <span className="opacity-90">quotes, renewals,</span><br />
              <span className="opacity-90">claims, submissions.</span>
            </h1>
            <p className="text-[14px] text-primary-foreground/70 leading-relaxed max-w-md pt-1">
              Fideon OS is purpose-built for brokers, MGAs, and carriers. Every decision is confidence-scored, reviewable, audited.
            </p>
          </div>
          <div className="space-y-3">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.07] backdrop-blur-sm">
                <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <f.icon className="h-4.5 w-4.5 text-primary-foreground/80" />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-foreground">{f.label}</p>
                  <p className="text-xs text-primary-foreground/50">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs text-primary-foreground/40">
          <span>Enterprise-grade security</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/40" />
          <span>SOC 2 compliant</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/40" />
          <span>50+ years expertise</span>
        </div>
      </div>

      {/* Right — Sign in form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 bg-background">
        <div className="w-full max-w-[380px] space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <img src={typeof fideonLogo === "object" ? (fideonLogo as any).src : fideonLogo} alt="Fideon" className="h-full w-full object-contain" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">Fideon OS</span>
          </div>

          {mode === "login" ? (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm">Sign in to access your AI workspace</p>
              </div>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    onClick={() => setMode("forgot")}>
                    Forgot password?
                  </button>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Reset password</h2>
                <p className="text-muted-foreground text-sm">Enter your email to receive a reset link</p>
              </div>
              {forgotSent ? (
                <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  If an account exists for <strong>{email}</strong>, a reset link has been sent.
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Work email</Label>
                    <Input id="reset-email" type="email" placeholder="you@company.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                  </Button>
                </form>
              )}
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => { setMode("login"); setForgotSent(false); }}>
                Back to sign in
              </button>
            </>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <span className="text-foreground">Contact your admin for an invite.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
