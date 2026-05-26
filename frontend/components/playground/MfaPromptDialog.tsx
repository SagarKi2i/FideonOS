'use client';

// MFA prompt modal for HIL flows (FNF-562).
//
// Mounted by DocumentRetrievalUI whenever a poll observes a run in
// `awaiting_mfa` status with a `metadata.mfa_prompt` payload. Three flavors:
// - email_otp:   broker reads OTP from email, types it into the input
// - email_link:  broker clicks magic link in email; worker auto-resumes via
//                test endpoint (no submit needed; submit is a no-op for
//                manual "I clicked it" confirmation)
// - captcha_hil: broker reads the carrier-issued captcha image and types
//                the characters; submit posts upper-cased response

import { useEffect, useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";

import { agentsApi, type DocRetrievalMfaPrompt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


interface Props {
  open: boolean;
  runId: string;
  prompt: DocRetrievalMfaPrompt;
  onClose: () => void;
}


export default function MfaPromptDialog({ open, runId, prompt, onClose }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
    }
  }, [open, runId]);

  const submit = async (responseOverride?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await agentsApi.postDocRetrievalMfaResponse(runId, responseOverride ?? code);
      onClose();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const isEmailLink = prompt.kind === "email_link";
  const isCaptcha = prompt.kind === "captcha_hil";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCaptcha ? <ShieldCheck className="h-4 w-4 text-primary" /> : <Mail className="h-4 w-4 text-primary" />}
            {isCaptcha ? "Solve the captcha" : isEmailLink ? "Check your email" : "Enter the code from email"}
          </DialogTitle>
          <DialogDescription>{prompt.instruction}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isCaptcha && prompt.captcha_image_url && (
            <div className="rounded-md border border-border bg-muted/20 p-3 flex items-center justify-center">
              <img
                src={prompt.captcha_image_url}
                alt="captcha"
                className="max-h-24 object-contain"
                onError={() => setError("Couldn't load captcha image")}
              />
            </div>
          )}

          {!isEmailLink && (
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {isCaptcha ? "Captcha characters" : "OTP code"}
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={isCaptcha ? "e.g. ABCD" : "e.g. 123456"}
                className="font-mono"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) void submit(); }}
              />
            </div>
          )}

          {isEmailLink && (
            <p className="text-[12.5px] text-muted-foreground">
              We'll resume automatically as soon as you open the link. If nothing happens
              within {prompt.submit_label ? `${prompt.submit_label}s` : "a minute or two"},
              click "I opened the link" to nudge the worker.
            </p>
          )}

          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          {isEmailLink ? (
            <Button onClick={() => submit("")} disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              I opened the link
            </Button>
          ) : (
            <Button onClick={() => submit()} disabled={submitting || !code.trim()}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {prompt.submit_label || "Submit"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
