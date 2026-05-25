// AMS catalog — the 5 agency management systems Fideon supports directly.
// Each entry describes the connection method, what scopes are read/written,
// and what the auth model looks like.

export type AmsStatus = "live" | "beta" | "available" | "coming-soon";

export interface AmsSystem {
  id: string;
  name: string;
  vendor: string;
  /** Tagline shown on the card. */
  tagline: string;
  /** Auth method: oauth (delegated), apiKey (per-tenant key), sftp (file drop). */
  auth: "oauth" | "apiKey" | "sftp";
  /** Connection status across Fideon's tenant base. */
  status: AmsStatus;
  /** Scopes Fideon reads. */
  reads: string[];
  /** Scopes Fideon writes back. */
  writes: string[];
  /** Typical setup time. */
  setupMinutes: number;
}

export const AMS_SYSTEMS: AmsSystem[] = [
  {
    id: "applied-epic",
    name: "Applied Epic",
    vendor: "Applied Systems",
    tagline: "The most common AMS in mid-to-large brokerages.",
    auth: "oauth",
    status: "live",
    reads: ["Accounts", "Policies", "Activities", "Attachments", "Loss runs", "Carriers", "Producers"],
    writes: ["Attachments", "Activities", "Policy endorsements (proposed)"],
    setupMinutes: 10,
  },
  {
    id: "ams360",
    name: "AMS360",
    vendor: "Vertafore",
    tagline: "Cloud-native AMS popular with independent agencies.",
    auth: "oauth",
    status: "live",
    reads: ["Customers", "Policies", "Activities", "Documents", "Loss runs", "Producers"],
    writes: ["Documents", "Activities", "Suspense items"],
    setupMinutes: 8,
  },
  {
    id: "ezlynx",
    name: "EZLynx",
    vendor: "Applied Systems",
    tagline: "Personal-lines-leaning, fast for SMB agencies.",
    auth: "apiKey",
    status: "live",
    reads: ["Clients", "Policies", "Comparative rater quotes", "Documents"],
    writes: ["Documents", "Notes", "Quote requests"],
    setupMinutes: 6,
  },
  {
    id: "hawksoft",
    name: "Hawksoft",
    vendor: "Hawksoft",
    tagline: "Independent-agency favorite for personal + commercial.",
    auth: "apiKey",
    status: "beta",
    reads: ["Clients", "Policies", "Suspenses", "Attachments"],
    writes: ["Attachments", "Suspenses"],
    setupMinutes: 12,
  },
  {
    id: "qqcatalyst",
    name: "QQCatalyst",
    vendor: "Vertafore",
    tagline: "Browser-based AMS for small commercial + personal.",
    auth: "apiKey",
    status: "beta",
    reads: ["Accounts", "Policies", "Documents"],
    writes: ["Documents", "Notes"],
    setupMinutes: 10,
  },
];
