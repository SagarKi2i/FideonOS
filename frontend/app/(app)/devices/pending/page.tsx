'use client';

import { AdminGuard } from '@/components/AdminGuard';
import PendingDevices from '@/views/PendingDevices';

export default function PendingDevicesPage() {
  return (
    <AdminGuard>
      <PendingDevices />
    </AdminGuard>
  );
}
