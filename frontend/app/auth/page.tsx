import { Suspense } from 'react';
import Auth from '@/views/Auth';
import { Loader2 } from 'lucide-react';

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <Auth />
    </Suspense>
  );
}
