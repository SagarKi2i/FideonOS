'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function OtpPage() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [isStepUp, setIsStepUp] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("otp_email");
    if (!stored) {
      router.replace("/auth");
      return;
    }
    setEmail(stored);
    setIsStepUp(sessionStorage.getItem("otp_step_up") === "true");
    inputRef.current?.focus();
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const fn = isStepUp ? authApi.verifyStepUp : authApi.verifyOtp;
      const data = await fn(email, otp) as any;

      // Backend detected geo anomaly — show step-up screen with new OTP
      if (data?.step_up_required) {
        setOtp("");
        setIsStepUp(true);
        sessionStorage.setItem("otp_step_up", "true");
        toast({
          title: "Security check required",
          description: data.message,
          variant: "destructive",
        });
        inputRef.current?.focus();
        return;
      }

      sessionStorage.removeItem("otp_email");
      sessionStorage.removeItem("otp_step_up");
      await refreshUser();
      router.replace("/today");
    } catch (error: any) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await authApi.resendOtp(email);
      toast({ title: "Code resent", description: "Check your inbox for the new code." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[380px] space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {isStepUp ? "Security verification required" : "Check your email"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isStepUp
              ? <>We detected a login from an unusual location. Enter the code sent to <strong>{email}</strong> to continue.</>
              : <>We sent a 6-digit verification code to <strong>{email}</strong></>
            }
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-[0.5em] font-mono"
            required
          />
          <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
          </Button>
        </form>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Didn't receive it?</span>
          <button type="button" onClick={handleResend} disabled={resending}
            className="text-foreground hover:underline underline-offset-4 disabled:opacity-50">
            {resending ? "Sending..." : "Resend code"}
          </button>
        </div>

        <button type="button" onClick={() => {
            sessionStorage.removeItem("otp_email");
            sessionStorage.removeItem("otp_step_up");
            router.push("/auth");
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </button>
      </div>
    </div>
  );
}
