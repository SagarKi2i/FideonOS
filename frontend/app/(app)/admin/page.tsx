'use client';

import { AdminGuard } from '@/components/AdminGuard';
import AdminDashboard from '@/views/AdminDashboard';

export default function AdminDashboardPage() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  );
}
