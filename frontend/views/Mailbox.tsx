'use client';
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  MailOpen,
  Paperclip,
  FileText,
  Clock,
  Star,
  StarOff,
  ArrowLeft,
  Download,
  Building2,
  Search,
  Reply,
  Forward,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EmailAttachment {
  name: string;
  type: string;
  size: string;
}

interface Email {
  id: string;
  from: string;
  fromEmail: string;
  carrier: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  attachments: EmailAttachment[];
  tags: string[];
}

const sampleEmails: Email[] = [
  {
    id: "1",
    from: "Progressive Commercial",
    fromEmail: "underwriting@progressive.com",
    carrier: "Progressive",
    subject: "Policy Renewal - Commercial Auto #PA-2026-44821",
    preview: "Your commercial auto policy is up for renewal. Please review the attached documents...",
    body: `Dear Agent,

Your client's Commercial Auto policy #PA-2026-44821 is approaching its renewal date of March 15, 2026. Please find attached the renewal proposal with updated premium and coverage details.

Key Changes:
• Premium adjusted to $12,450/yr (3.2% increase)
• Fleet discount applied for 5+ vehicles
• Added hired/non-owned auto coverage
• Umbrella eligibility confirmed

Please review the attached renewal documents and confirm acceptance by March 1, 2026.

Best regards,
Progressive Commercial Underwriting`,
    date: "2026-02-08",
    read: false,
    starred: true,
    attachments: [
      { name: "PA-2026-44821_Renewal.pdf", type: "pdf", size: "2.4 MB" },
      { name: "Coverage_Schedule.pdf", type: "pdf", size: "890 KB" },
    ],
    tags: ["Renewal", "Auto"],
  },
  {
    id: "2",
    from: "Travelers Insurance",
    fromEmail: "submissions@travelers.com",
    carrier: "Travelers",
    subject: "New Business Quote - BOP Package #TRV-BOP-88192",
    preview: "We're pleased to provide the following quote for your client's Business Owners Policy...",
    body: `Dear Agent,

Thank you for the submission. We are pleased to offer a competitive quote for the Business Owners Policy (BOP) for ABC Hardware LLC.

Quote Summary:
• Annual Premium: $8,750
• Property Coverage: $500,000
• General Liability: $1,000,000/$2,000,000
• Business Income: 12 months actual loss sustained
• Equipment Breakdown included

This quote is valid for 30 days. Please see the attached proposal and application for binding.

Sincerely,
Travelers Underwriting Team`,
    date: "2026-02-07",
    read: false,
    starred: false,
    attachments: [
      { name: "TRV-BOP-88192_Quote.pdf", type: "pdf", size: "1.8 MB" },
      { name: "BOP_Application.pdf", type: "pdf", size: "1.2 MB" },
      { name: "Coverage_Comparison.xlsx", type: "xlsx", size: "340 KB" },
    ],
    tags: ["New Business", "BOP"],
  },
  {
    id: "3",
    from: "Hartford Underwriting",
    fromEmail: "claims@thehartford.com",
    carrier: "Hartford",
    subject: "Claim Status Update - WC Claim #HF-CLM-2026-1193",
    preview: "This is to inform you that the workers' compensation claim has been reviewed...",
    body: `Dear Agent,

This is an update regarding Workers' Compensation Claim #HF-CLM-2026-1193 for your insured, Delta Construction Inc.

Claim Status: Under Medical Review
• Date of Loss: January 22, 2026
• Claimant: John Martinez
• Injury: Lower back strain
• Reserve: $35,000
• Medical payments to date: $4,200

The independent medical examination is scheduled for February 20, 2026. Updated reserve and status reports are attached.

Please contact us if you have any questions.

Hartford Claims Department`,
    date: "2026-02-06",
    read: true,
    starred: false,
    attachments: [
      { name: "HF-CLM-2026-1193_Status.pdf", type: "pdf", size: "560 KB" },
    ],
    tags: ["Claims", "Workers Comp"],
  },
  {
    id: "4",
    from: "Chubb Commercial Lines",
    fromEmail: "cpl@chubb.com",
    carrier: "Chubb",
    subject: "Endorsement Issued - Cyber Liability #CB-CYB-55210",
    preview: "The requested endorsement to add ransomware coverage has been processed...",
    body: `Dear Agent,

The endorsement to policy #CB-CYB-55210 has been processed and is effective February 1, 2026.

Endorsement Details:
• Added: Ransomware Extortion Coverage - $250,000 sublimit
• Added: Social Engineering Fraud - $100,000 sublimit
• Additional Premium: $1,850 (prorated)
• New Annual Premium: $14,200

The updated policy documents and endorsement forms are attached. Please deliver to your insured.

Thank you,
Chubb Commercial Lines`,
    date: "2026-02-05",
    read: true,
    starred: true,
    attachments: [
      { name: "CB-CYB-55210_Endorsement.pdf", type: "pdf", size: "1.1 MB" },
      { name: "Updated_Dec_Page.pdf", type: "pdf", size: "420 KB" },
    ],
    tags: ["Endorsement", "Cyber"],
  },
  {
    id: "5",
    from: "Liberty Mutual",
    fromEmail: "renewals@libertymutual.com",
    carrier: "Liberty Mutual",
    subject: "Non-Renewal Notice - GL Policy #LM-GL-2025-7743",
    preview: "We regret to inform you that the following general liability policy will not be renewed...",
    body: `Dear Agent,

Please be advised that General Liability policy #LM-GL-2025-7743 for Apex Roofing LLC will not be renewed at its expiration date of April 1, 2026.

Reason: Adverse loss experience (3 claims in 24 months totaling $187,000)

This notice is provided 60 days in advance per state requirements. We recommend securing replacement coverage promptly.

The loss run report and non-renewal notice letter for your client are attached.

Liberty Mutual Underwriting`,
    date: "2026-02-04",
    read: true,
    starred: false,
    attachments: [
      { name: "LM-GL-7743_NonRenewal.pdf", type: "pdf", size: "780 KB" },
      { name: "Loss_Run_Report.pdf", type: "pdf", size: "1.5 MB" },
    ],
    tags: ["Non-Renewal", "GL"],
  },
  {
    id: "6",
    from: "Nationwide E&S",
    fromEmail: "surplus@nationwide.com",
    carrier: "Nationwide",
    subject: "Surplus Lines Quote - Liquor Liability #NW-SL-29104",
    preview: "Please find attached the surplus lines quote for the restaurant liquor liability...",
    body: `Dear Agent,

We have completed our review of the submission for Happy Hour Restaurant Group. Please find the surplus lines quote below.

Quote Details:
• Coverage: Liquor Liability
• Limit: $1,000,000 per occurrence / $2,000,000 aggregate
• Annual Premium: $6,200
• Deductible: $5,000 per claim
• Surplus Lines Tax: $310

Special Conditions:
• Alcohol sales must not exceed 60% of total revenue
• Security staff required after 10 PM
• Annual liquor license verification

Quote valid for 15 days. See attached for full terms.

Nationwide Excess & Surplus`,
    date: "2026-02-03",
    read: true,
    starred: false,
    attachments: [
      { name: "NW-SL-29104_Quote.pdf", type: "pdf", size: "2.1 MB" },
    ],
    tags: ["Surplus Lines", "Liquor"],
  },
];

const tagTone: Record<string, "info" | "success" | "warning" | "primary" | "danger" | "neutral"> = {
  Renewal:        "info",
  "New Business": "success",
  Claims:         "warning",
  Endorsement:    "primary",
  "Non-Renewal":  "danger",
  "Surplus Lines":"info",
  Auto:           "neutral",
  BOP:            "neutral",
  Liquor:         "neutral",
};

export default function Mailbox() {
  const [emails, setEmails] = useState<Email[]>(sampleEmails);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const unreadCount = emails.filter((e) => !e.read).length;
  const starredCount = emails.filter((e) => e.starred).length;
  const withAttachmentsCount = emails.filter((e) => e.attachments.length > 0).length;

  const filteredEmails = (
    filter === "all"
      ? emails
      : filter === "unread"
        ? emails.filter((e) => !e.read)
        : filter === "starred"
          ? emails.filter((e) => e.starred)
          : emails.filter((e) => e.attachments.length > 0)
  ).filter((e) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      e.from.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      e.preview.toLowerCase().includes(q)
    );
  });

  const initialsOf = (name: string) =>
    name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  const openEmail = (email: Email) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
    );
    setSelectedEmail({ ...email, read: true });
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((em) => (em.id === id ? { ...em, starred: !em.starred } : em))
    );
    if (selectedEmail?.id === id) {
      setSelectedEmail((prev) => prev ? { ...prev, starred: !prev.starred } : null);
    }
  };

  const getFileIcon = (type: string) => {
    return <FileText className="h-4 w-4 text-red-500" />;
  };

  const filterTabs: Array<{ key: string; label: string; count: number }> = [
    { key: "all",         label: "All",        count: emails.length },
    { key: "unread",      label: "Unread",     count: unreadCount },
    { key: "starred",     label: "Starred",    count: starredCount },
    { key: "attachments", label: "Attachments",count: withAttachmentsCount },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Mailbox"
        title="Carrier communications"
        description="Renewal notices, quotes, endorsements and policy documents — all in one place."
        icon={Mail}
        actions={
          <>
            <StatusPill tone={unreadCount > 0 ? "primary" : "neutral"} dot pulse={unreadCount > 0}>
              {unreadCount} unread
            </StatusPill>
            <Button variant="primary" size="sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI summarize
            </Button>
          </>
        }
      />

      {/* Toolbar — search + filter pills */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages, carriers…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/40 border border-border">
          {filterTabs.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors whitespace-nowrap",
                filter === f.key
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="text-[10.5px] font-bold tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 min-h-[680px]">
        {/* Email List */}
        <Card className="overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] font-semibold">Inbox</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{filteredEmails.length}</span>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {filteredEmails.length === 0 ? (
              <EmptyState
                variant="inline"
                title="No messages match"
                description="Try a different filter or search term."
              />
            ) : (
              filteredEmails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => openEmail(email)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border transition-colors group",
                    selectedEmail?.id === email.id
                      ? "bg-accent border-l-[3px] border-l-primary"
                      : "hover:bg-muted/50 border-l-[3px] border-l-transparent",
                    !email.read && selectedEmail?.id !== email.id && "bg-primary/[0.025]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar bubble */}
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-accent/60 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                      {initialsOf(email.from)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[13px] truncate", !email.read ? "font-bold text-foreground" : "font-medium text-foreground/80")}>
                          {email.from}
                        </span>
                        {!email.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        <span className="ml-auto text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className={cn("text-[13px] truncate mt-0.5", !email.read ? "font-semibold text-foreground" : "text-foreground/85")}>
                        {email.subject}
                      </p>
                      <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{email.preview}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {email.tags.map((tag) => (
                          <StatusPill key={tag} tone={tagTone[tag] ?? "neutral"} size="sm">
                            {tag}
                          </StatusPill>
                        ))}
                        {email.attachments.length > 0 && (
                          <span className="flex items-center gap-0.5 text-[10.5px] text-muted-foreground">
                            <Paperclip className="h-3 w-3" />
                            {email.attachments.length}
                          </span>
                        )}
                        <button
                          onClick={(e) => toggleStar(email.id, e)}
                          className="ml-auto text-muted-foreground hover:text-warning transition-colors"
                          aria-label={email.starred ? "Unstar" : "Star"}
                        >
                          {email.starred ? <Star className="h-3.5 w-3.5 fill-warning text-warning" /> : <StarOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </Card>

        {/* Email Detail */}
        <Card className="flex flex-col overflow-hidden">
          {selectedEmail ? (
            <>
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <Button variant="ghost" size="xs" className="lg:hidden -ml-2" onClick={() => setSelectedEmail(null)}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </Button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedEmail.tags.map((tag) => (
                      <StatusPill key={tag} tone={tagTone[tag] ?? "neutral"} size="sm">{tag}</StatusPill>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm">
                      <Reply className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm">
                      <Forward className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <h2 className="font-display text-[20px] font-bold text-foreground tracking-tight leading-tight">
                  {selectedEmail.subject}
                </h2>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent to-accent/60 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                    {initialsOf(selectedEmail.from)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px]">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{selectedEmail.from}</span>
                      <span className="text-muted-foreground truncate">&lt;{selectedEmail.fromEmail}&gt;</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(selectedEmail.date).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 py-5">
                  <pre className="whitespace-pre-wrap text-[14px] text-foreground/90 font-sans leading-[1.65]">
                    {selectedEmail.body}
                  </pre>

                  {selectedEmail.attachments.length > 0 && (
                    <div className="mt-7 pt-5 border-t border-border">
                      <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-3">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attachments ({selectedEmail.attachments.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedEmail.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 hover:border-border-strong transition-all group cursor-pointer"
                          >
                            {getFileIcon(att.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold truncate text-foreground">{att.name}</p>
                              <p className="text-[11px] text-muted-foreground">{att.size}</p>
                            </div>
                            <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <EmptyState
              variant="inline"
              icon={MailOpen}
              title="Select a message"
              description="Choose an email from the inbox to read it here."
              className="flex-1 justify-center"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
