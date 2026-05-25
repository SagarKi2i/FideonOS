'use client';

import { AdminGuard } from '@/components/AdminGuard';
import DeviceDetails from '@/views/DeviceDetails';

export default function DeviceDetailsPage() {
  return (
    <AdminGuard>
      <DeviceDetails />
    </AdminGuard>
  );
}
