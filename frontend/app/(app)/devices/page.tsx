'use client';

import { AdminGuard } from '@/components/AdminGuard';
import Devices from '@/views/Devices';

export default function DevicesPage() {
  return (
    <AdminGuard>
      <Devices />
    </AdminGuard>
  );
}
