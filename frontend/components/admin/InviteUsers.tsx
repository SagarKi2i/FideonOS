'use client';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Mail, Send, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface Invite {
  id: string;
  email: string;
  status: string;
  expires_at: string | null;
  invited_by: string | null;
  created_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'ACCEPTED') return <Badge className="bg-green-500/90 text-white text-xs">Accepted</Badge>;
  if (s === 'PENDING') return <Badge className="bg-amber-500/90 text-white text-xs">Pending</Badge>;
  return <Badge variant="destructive" className="text-xs">{status}</Badge>;
}

export function InviteUsers() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    try {
      const data = (await authApi.listInvites()) as { invites: Invite[] };
      setInvites(data.invites || []);
    } catch (error) {
      console.error('Error loading invites:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      toast({ title: 'Invalid email', description: 'Enter a valid email address.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      await authApi.sendInvite(trimmed);
      toast({ title: 'Invite sent', description: `An invite was sent to ${trimmed}.` });
      setEmail('');
      loadInvites();
    } catch (error) {
      toast({
        title: 'Failed to send invite',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-border/50 bg-background/95 backdrop-blur shadow-premium">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Invite Users
        </CardTitle>
        <CardDescription>Send a signup invite link to a new user&apos;s email</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row sm:items-center mb-6">
          <Input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || !email.trim()}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {sending ? 'Sending…' : 'Send Invite'}
          </Button>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading invites…</p>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Mail className="h-8 w-8 mb-2 text-primary/50" />
            <p>No invites yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => {
              const expired =
                invite.expires_at != null && new Date(invite.expires_at) <= new Date();
              return (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{invite.email}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {invite.created_at && (
                          <>Invited {new Date(invite.created_at).toLocaleDateString()}</>
                        )}
                        {invite.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {expired ? 'Expired' : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {invite.status.toUpperCase() === 'PENDING' && !expired && (
                      <CheckCircle2 className="h-4 w-4 text-amber-500" />
                    )}
                    {expired && invite.status.toUpperCase() === 'PENDING' ? (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        Expired
                      </Badge>
                    ) : (
                      statusBadge(invite.status)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
