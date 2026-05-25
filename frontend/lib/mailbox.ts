'use client';
// In-platform email box — client helpers (inbound triage mailbox).
// Messages live in email_messages; each tenant has one inbound alias in
// email_aliases. Tables aren't in the generated types yet, so we use the
// loosely-typed `db` handle (same pattern as pods.ts).

import { getCurrentUser } from '@/lib/currentUser';
import { db, runPod } from '@/lib/pods';

export type EmailStatus = 'unread' | 'read' | 'triaged' | 'archived';

export interface EmailMessage {
  id: string;
  from_address: string | null;
  from_name: string | null;
  to_address: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: Array<{ name: string; size?: number; content_type?: string }>;
  status: EmailStatus;
  source: string;
  triaged_to: string | null;
  received_at: string;
}

const INBOUND_DOMAIN = 'in.fideon.app';

/** Ensure the current tenant has an inbound alias; returns it. */
export async function ensureAlias(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const { data: existing } = await db
      .from('email_aliases')
      .select('alias')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing?.alias) return existing.alias;
    const alias = `inbox-${user.id.replace(/-/g, '').slice(0, 8)}@${INBOUND_DOMAIN}`;
    const { data } = await db
      .from('email_aliases')
      .insert({ user_id: user.id, alias })
      .select('alias')
      .single();
    return data?.alias ?? alias;
  } catch {
    return null;
  }
}

export async function fetchEmails(
  status?: EmailStatus,
  limit = 100,
): Promise<EmailMessage[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    let q = db
      .from('email_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('received_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data } = await q;
    return (data ?? []) as EmailMessage[];
  } catch {
    return [];
  }
}

export async function setEmailStatus(id: string, status: EmailStatus): Promise<void> {
  try {
    await db.from('email_messages').update({ status }).eq('id', id);
  } catch {
    /* table may not exist yet */
  }
}

/** Triage an email into a pod (e.g. submission intake / document retrieval). */
export async function triageToPod(
  email: EmailMessage,
  slug: string,
): Promise<{ ok: boolean; needsReview?: boolean; error?: string }> {
  const res = await runPod(
    slug,
    {
      source: 'email',
      email: {
        from: email.from_address,
        subject: email.subject,
        body: email.body_text,
        attachments: email.attachments,
      },
    },
    'ui',
  );
  if (res.error) return { ok: false, error: res.error };
  try {
    await db
      .from('email_messages')
      .update({
        status: 'triaged',
        triaged_to: slug,
        triaged_run_id: res.run?.id ?? null,
      })
      .eq('id', email.id);
  } catch {
    /* */
  }
  return { ok: true, needsReview: res.needsReview };
}

/** Seed a sample inbound email for the current tenant (dev/demo, no provider). */
export async function seedSampleEmail(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const alias = await ensureAlias();
  const samples = [
    {
      from_address: 'broker@riverside-logistics.com',
      from_name: 'Riverside Logistics',
      subject: 'New submission — GL renewal',
      body_text:
        'Hi, please find attached our GL renewal application and 3-year loss runs for Riverside Logistics. Effective 06/01.',
      attachments: [
        { name: 'ACORD-125.pdf', size: 184320, content_type: 'application/pdf' },
        { name: 'loss-runs-3yr.pdf', size: 96000, content_type: 'application/pdf' },
      ],
    },
    {
      from_address: 'documents@travelers.com',
      from_name: 'Travelers',
      subject: 'Policy documents ready — ABC Hardware',
      body_text:
        'The renewal proposal and endorsement for policy PA-2026-44821 are available.',
      attachments: [
        { name: 'renewal-proposal.pdf', size: 120000, content_type: 'application/pdf' },
      ],
    },
  ];
  const s = samples[Math.floor(Math.random() * samples.length)];
  try {
    await db.from('email_messages').insert({
      user_id: user.id,
      ...s,
      to_address: alias,
      snippet: s.body_text.slice(0, 180),
      status: 'unread',
      source: 'seed',
      received_at: new Date().toISOString(),
    });
  } catch {
    /* */
  }
}
