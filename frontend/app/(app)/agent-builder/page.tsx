'use client';

import { AdminGuard } from '@/components/AdminGuard';
import AgentBuilder from '@/views/AgentBuilder';

export default function AgentBuilderPage() {
  return (
    <AdminGuard>
      <AgentBuilder />
    </AdminGuard>
  );
}
