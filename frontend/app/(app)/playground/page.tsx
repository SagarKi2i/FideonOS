'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function PlaygroundRedirectInner() {
  const sp = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const podId = sp.get('model') || sp.get('podId');
    if (podId) {
      router.replace(`/pod/${podId}?tab=run`);
    } else {
      router.replace('/my-models');
    }
  }, [sp, router]);

  return null;
}

export default function PlaygroundPage() {
  return (
    <Suspense>
      <PlaygroundRedirectInner />
    </Suspense>
  );
}
