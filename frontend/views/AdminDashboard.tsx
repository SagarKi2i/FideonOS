'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, CheckCircle, XCircle, Clock, AlertTriangle, Activity, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ModelAllocationSection } from '@/components/admin/ModelAllocationSection';
import { PodActivationRequests } from '@/components/admin/PodActivationRequests';
import { InviteUsers } from '@/components/admin/InviteUsers';

// Shape of GET /api/admin/stats (AdminStatsResponse).
interface AdminStats {
  total_devices: number;
  active_devices: number;
  pending_devices: number;
  total_runs_today: number;
  total_runs_week: number;
  pending_approvals: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    total_devices: 0,
    active_devices: 0,
    pending_devices: 0,
    total_runs_today: 0,
    total_runs_week: 0,
    pending_approvals: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  async function fetchDashboardStats() {
    try {
      const data = (await adminApi.stats()) as AdminStats;
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const suspendedDevices = Math.max(
    stats.total_devices - stats.active_devices - stats.pending_devices,
    0,
  );

  const statCards: Array<{
    title: string;
    value: number;
    icon: typeof Server;
    description: string;
    color?: string;
    trend?: string;
  }> = [
    {
      title: 'Total Devices',
      value: stats.total_devices,
      icon: Server,
      description: 'Registered devices',
    },
    {
      title: 'Active',
      value: stats.active_devices,
      icon: CheckCircle,
      description: 'Approved & active',
      color: 'text-green-500',
    },
    {
      title: 'Suspended',
      value: suspendedDevices,
      icon: XCircle,
      description: 'Suspended devices',
      color: 'text-gray-500',
    },
    {
      title: 'Pending Approvals',
      value: stats.pending_devices,
      icon: Clock,
      description: 'Awaiting approval',
      color: 'text-yellow-500',
    },
    {
      title: 'Runs Today',
      value: stats.total_runs_today,
      icon: Activity,
      description: 'Agent runs today',
    },
    {
      title: 'Runs This Week',
      value: stats.total_runs_week,
      icon: TrendingUp,
      description: 'Last 7 days',
    },
    {
      title: 'Pending Approvals (HITL)',
      value: stats.pending_approvals,
      icon: AlertTriangle,
      description: 'Runs awaiting review',
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="min-h-screen p-8 relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 bg-gradient-subtle opacity-50 -z-10" />
      <div className="fixed top-20 right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float -z-10" />
      <div className="fixed bottom-20 left-20 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float animation-delay-2000 -z-10" />

      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-2">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Monitor and manage your private AI tenant infrastructure
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <Card
            key={stat.title}
            className="border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-premium hover:shadow-glow transition-all duration-300 animate-scale-in hover:-translate-y-1"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color || 'text-primary'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
              {stat.trend && (
                <div className="flex items-center mt-2 text-xs text-green-500">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {stat.trend}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and detailed views */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-premium">
          <CardHeader>
            <CardTitle>Device Status Distribution</CardTitle>
            <CardDescription>Current device connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Active</span>
                  <span className="text-sm text-muted-foreground">
                    {stats.total_devices > 0
                      ? Math.round((stats.active_devices / stats.total_devices) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    stats.total_devices > 0
                      ? (stats.active_devices / stats.total_devices) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Suspended</span>
                  <span className="text-sm text-muted-foreground">
                    {stats.total_devices > 0
                      ? Math.round((suspendedDevices / stats.total_devices) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    stats.total_devices > 0
                      ? (suspendedDevices / stats.total_devices) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-premium">
          <CardHeader>
            <CardTitle>Quick Actions Required</CardTitle>
            <CardDescription>Items needing attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.pending_devices > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-yellow-500 mr-3" />
                    <span className="text-sm font-medium">Pending Device Approvals</span>
                  </div>
                  <span className="text-sm font-bold">{stats.pending_devices}</span>
                </div>
              )}
              {stats.pending_approvals > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-orange-500 mr-3" />
                    <span className="text-sm font-medium">Runs Awaiting Review</span>
                  </div>
                  <span className="text-sm font-bold">{stats.pending_approvals}</span>
                </div>
              )}
              {stats.pending_devices === 0 && stats.pending_approvals === 0 && (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span>All systems operational</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invite Users */}
      <div className="mt-6 animate-fade-in">
        <InviteUsers />
      </div>

      {/* Pod Activation Requests */}
      <div className="mt-6 animate-fade-in">
        <PodActivationRequests />
      </div>

      {/* Model Allocation */}
      <div className="mt-6 animate-fade-in">
        <ModelAllocationSection />
      </div>
    </div>
  );
}
