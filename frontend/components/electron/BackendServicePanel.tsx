'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Server, Play, Square, RefreshCw } from 'lucide-react';

type ServiceStatus = {
  installed: boolean;
  running: boolean;
  output: string;
};

export function BackendServicePanel() {
  const { toast } = useToast();
  const [inElectron, setInElectron] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!window.electron?.service) return;
    const s = await window.electron.service.status();
    setStatus(s);
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await window.electron?.isElectron?.();
      setInElectron(!!ok);
      if (ok) await refresh();
    })();
  }, [refresh]);

  const run = async (action: 'install' | 'uninstall' | 'status') => {
    if (!window.electron?.service) return;
    setBusy(true);
    try {
      const fn = window.electron.service[action];
      const result = action === 'status' ? await fn() : await fn();
      if (action === 'status') {
        setStatus(result as ServiceStatus);
      } else {
        const r = result as { ok: boolean; output: string };
        toast({
          title: r.ok ? 'Success' : 'Failed',
          description: r.output?.slice(0, 200) || undefined,
          variant: r.ok ? 'default' : 'destructive',
        });
        await refresh();
      }
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!inElectron) {
    return (
      <Card className="mb-6 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Backend system service
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Open this page in the Electron app to install or check the FastAPI backend service (FNF-425–428).
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Backend system service
          </CardTitle>
          <div className="flex items-center gap-2">
            {status?.running ? (
              <StatusPill tone="success" dot size="sm">Running</StatusPill>
            ) : status?.installed ? (
              <StatusPill tone="warning" size="sm">Stopped</StatusPill>
            ) : (
              <StatusPill tone="neutral" size="sm">Not installed</StatusPill>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => run('status')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] text-muted-foreground">
          Registers the FastAPI backend as a Windows / macOS / Linux service with auto-start and crash recovery.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => run('install')}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Install &amp; start
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('uninstall')}>
            <Square className="h-3.5 w-3.5" />
            Uninstall
          </Button>
        </div>
        {status?.output ? (
          <pre className="text-[10px] bg-muted rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">
            {status.output.slice(0, 500)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
