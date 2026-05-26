'use client';

import { AdminGuard } from '@/components/AdminGuard';
import AdminAmsTargets from '@/views/AdminAmsTargets';

export default function AdminAmsTargetsPage() {
  return (
    <AdminGuard>
      <AdminAmsTargets />
    </AdminGuard>
  );
}
