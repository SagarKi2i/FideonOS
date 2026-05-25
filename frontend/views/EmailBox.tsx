'use client';
// EmailBox — in-platform inbound email box. Inbound emails (submissions, carrier
// docs) land here via the email-inbound webhook; the broker reads them and
// triages each into a pod/workflow (Submission Intake, Document Retrieval).

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  Inbox,
  Archive,
  CheckCheck,
  Loader2,
  Paperclip,
  Copy,
  Send,
  FileSearch,
  Sparkles,
} from 'lucide-react';
import {
  ensureAlias,
  fetchEmails,
  setEmailStatus,
  triageToPod,
  seedSampleEmail,
  type EmailMessage,
  type EmailStatus,
} from '@/lib/mailbox';

const TABS: { key: EmailStatus | 'all'; label: string; icon: typeof Inbox }[] = [
  { key: 'unread', label: 'Unread', icon: Inbox },
  { key: 'all', label: 'All', icon: Mail },
  { key: 'triaged', label: 'Triaged', icon: CheckCheck },
  { key: 'archived', label: 'Archived', icon: Archive },
];

const TRIAGE_TARGETS = [
  { slug: 'carrier-submission-intake', label: 'Submission Intake', icon: Send },
  { slug: 'document-retrieval', label: 'Document Retrieval', icon: FileSearch },
];

export default function EmailBox() {
  const { toast } = useToast();
  const [alias, setAlias] = useState<string | null>(null);
  const [tab, setTab] = useState<EmailStatus | 'all'>('unread');
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selected, setSelected] = useState<EmailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async (t = tab) => {
    setLoading(true);
    setEmails(await fetchEmails(t === 'all' ? undefined : t));
    setLoading(false);
  };

  useEffect(() => {
    ensureAlias().then(setAlias);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (m: EmailMessage) => {
    setSelected(m);
    if (m.status === 'unread') {
      await setEmailStatus(m.id, 'read');
      load();
    }
  };

  const archive = async (m: EmailMessage) => {
    await setEmailStatus(m.id, 'archived');
    setSelected(null);
    load();
  };

  const triage = async (m: EmailMessage, slug: string, label: string) => {
    setBusy(true);
    const res = await triageToPod(m, slug);
    setBusy(false);
    if (!res.ok) {
      toast({ title: 'Triage failed', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: `Sent to ${label}`,
      description: res.needsReview ? 'Flagged for review.' : 'Run saved.',
    });
    setSelected(null);
    load();
  };

  const seed = async () => {
    await seedSampleEmail();
    load();
    toast({ title: 'Sample email delivered' });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Mailbox"
        title="Email box"
        description="Inbound submissions and carrier documents land here. Read them and triage each into an agent."
        icon={Mail}
        actions={
          <Button variant="outline" size="sm" onClick={seed}>
            <Sparkles className="h-3.5 w-3.5" />
            Deliver sample
          </Button>
        }
      />

      {alias && (
        <Card className="mb-4 p-3 flex items-center gap-2 bg-accent/30 border-primary/20">
          <Mail className="h-4 w-4 text-primary shrink-0" />
          <span className="text-[12.5px] text-muted-foreground">
            Forward or send mail to your inbound address:
          </span>
          <code className="text-[12.5px] font-mono text-foreground">{alias}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              navigator.clipboard.writeText(alias);
              toast({ title: 'Copied' });
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </Card>
      )}

      <div className="flex items-center gap-1.5 mb-4">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setSelected(null);
              setTab(t.key);
            }}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : emails.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No messages"
              description="Use 'Deliver sample' to drop a test email, or send one to your inbound address."
            />
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-auto">
              {emails.map((m) => (
                <button
                  key={m.id}
                  onClick={() => open(m)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors',
                    selected?.id === m.id && 'bg-accent/60',
                    m.status === 'unread' && 'font-medium',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] truncate">
                      {m.from_name || m.from_address}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(m.received_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-foreground/90 truncate">{m.subject}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">{m.snippet}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {m.status === 'triaged' && (
                      <StatusPill tone="success" size="sm">
                        triaged → {m.triaged_to}
                      </StatusPill>
                    )}
                    {m.attachments?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground">
                        <Paperclip className="h-2.5 w-2.5" />
                        {m.attachments.length}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground py-16">
              Select a message to read
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-[18px] font-semibold">{selected.subject}</h2>
                <p className="text-[12.5px] text-muted-foreground mt-1">
                  From{' '}
                  <span className="text-foreground">
                    {selected.from_name || selected.from_address}
                  </span>{' '}
                  · {new Date(selected.received_at).toLocaleString()}
                </p>
              </div>
              {selected.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.attachments.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-[11.5px]"
                    >
                      <Paperclip className="h-3 w-3" />
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-[13.5px] whitespace-pre-wrap leading-relaxed text-foreground/90">
                {selected.body_text}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <span className="text-[12px] text-muted-foreground mr-1">Triage to:</span>
                {TRIAGE_TARGETS.map((t) => (
                  <Button
                    key={t.slug}
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => triage(selected, t.slug, t.label)}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <t.icon className="h-3.5 w-3.5" />
                    )}
                    {t.label}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => archive(selected)}>
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
