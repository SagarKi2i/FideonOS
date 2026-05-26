'use client';

import { AdminGuard } from '@/components/AdminGuard';
import AdminCarriers from '@/views/AdminCarriers';

export default function AdminCarriersPage() {
  return (
    <AdminGuard>
      <AdminCarriers />
    </AdminGuard>
  );
}
