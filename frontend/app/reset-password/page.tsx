'use client';
import { Suspense } from "react";
import ResetPasswordView from "./ResetPasswordView";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ResetPasswordView />
    </Suspense>
  );
}
