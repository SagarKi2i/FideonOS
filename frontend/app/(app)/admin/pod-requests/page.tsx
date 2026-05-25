'use client';

import { AdminGuard } from '@/components/AdminGuard';
import AdminPodRequests from '@/views/AdminPodRequests';

export default function AdminPodRequestsPage() {
  return (
    <AdminGuard>
      <AdminPodRequests />
    </AdminGuard>
  );
}
