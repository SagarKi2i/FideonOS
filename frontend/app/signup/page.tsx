'use client';
import { Suspense } from "react";
import SignupView from "./SignupView";
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <SignupView />
    </Suspense>
  );
}
