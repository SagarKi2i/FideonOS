// Multi-client loss run datasets used by LossRunReportingDashboard.

export type PolicyRow = {
  id: string;
  insured: string;
  carrier: string;
  policyNumber: string;
  effective: string;
  expiration: string;
  lob: string;
  claims: number;
  paid: number;
  outstanding: number;
  recoveries: number;
  incurred: number;
};

export type YearlyTrendRow = { year: string; incurred: number; paid: number; premium: number; frequency: number };
export type CauseRow = { name: string; value: number; color: string };
export type TopLoss = {
  id: string; date: string; insured: string; carrier: string; lob: string;
  cause: string; incurred: number; status: "Open" | "Closed"; severity: "Large" | "Medium" | "Small";
};

export type ClientDataset = {
  id: string;
  name: string;
  dba?: string;
  fein: string;
  industry: string;
  hq: string;
  locations: number;
  employees: number;
  brokerOfRecord: string;
  reportPeriod: string;
  runDate: string;
  policies: PolicyRow[];
  yearlyTrend: YearlyTrendRow[];
  causeBreakdown: CauseRow[];
  topLosses: TopLoss[];
  narrative: {
    concentration: string;
    drivers: string;
    outlook: string;
    recommendation: string;
    riskScore: string;
    riskTone: "success" | "warning";
    confidence: string;
  };
};

const C = (a: number) => `hsl(var(--primary) / ${a})`;

/* ------------------------------ APEX ------------------------------ */
const apex: ClientDataset = {
  id: "apex",
  name: "Apex Manufacturing Co.",
  dba: "Apex Mfg.",
  fein: "84-2719033",
  industry: "Precision Metal Fabrication (NAICS 332710)",
  hq: "Riverside, CA",
  locations: 4,
  employees: 187,
  brokerOfRecord: "Apex Manufacturing Co.",
  reportPeriod: "06/01/2021 – 06/01/2026",
  runDate: "04/19/2026",
  policies: [
    { id: "wc-26", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   policyNumber: "HFD-WC-552108", effective: "06/01/2025", expiration: "06/01/2026", lob: "Workers' Comp",     claims: 1, paid: 14_200,  outstanding: 6_800,  recoveries: 0,     incurred: 21_000  },
    { id: "wc-25", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   policyNumber: "HFD-WC-552108", effective: "06/01/2024", expiration: "06/01/2025", lob: "Workers' Comp",     claims: 2, paid: 47_300,  outstanding: 12_400, recoveries: 0,     incurred: 59_700  },
    { id: "wc-24", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   policyNumber: "HFD-WC-552108", effective: "06/01/2023", expiration: "06/01/2024", lob: "Workers' Comp",     claims: 4, paid: 198_400, outstanding: 64_200, recoveries: 0,     incurred: 262_600 },
    { id: "wc-23", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   policyNumber: "HFD-WC-552108", effective: "06/01/2022", expiration: "06/01/2023", lob: "Workers' Comp",     claims: 3, paid: 86_500,  outstanding: 0,      recoveries: 0,     incurred: 86_500  },
    { id: "wc-22", insured: "Apex Manufacturing Co.", carrier: "Travelers",      policyNumber: "TRV-WC-118822", effective: "06/01/2021", expiration: "06/01/2022", lob: "Workers' Comp",     claims: 2, paid: 38_100,  outstanding: 0,      recoveries: 0,     incurred: 38_100  },
    { id: "au-26", insured: "Apex Manufacturing Co.", carrier: "Liberty Mutual", policyNumber: "LBM-AUT-441903", effective: "06/01/2025", expiration: "06/01/2026", lob: "Commercial Auto",   claims: 1, paid: 18_900,  outstanding: 7_500,  recoveries: 1_200, incurred: 25_200  },
    { id: "au-25", insured: "Apex Manufacturing Co.", carrier: "Liberty Mutual", policyNumber: "LBM-AUT-441903", effective: "06/01/2024", expiration: "06/01/2025", lob: "Commercial Auto",   claims: 5, paid: 142_300, outstanding: 38_400, recoveries: 8_100, incurred: 172_600 },
    { id: "au-24", insured: "Apex Manufacturing Co.", carrier: "Liberty Mutual", policyNumber: "LBM-AUT-441903", effective: "06/01/2023", expiration: "06/01/2024", lob: "Commercial Auto",   claims: 3, paid: 64_700,  outstanding: 0,      recoveries: 4_300, incurred: 60_400  },
    { id: "au-23", insured: "Apex Manufacturing Co.", carrier: "Progressive",    policyNumber: "PRG-CA-771042", effective: "06/01/2022", expiration: "06/01/2023", lob: "Commercial Auto",   claims: 2, paid: 41_800,  outstanding: 0,      recoveries: 0,     incurred: 41_800  },
    { id: "au-22", insured: "Apex Manufacturing Co.", carrier: "Progressive",    policyNumber: "PRG-CA-771042", effective: "06/01/2021", expiration: "06/01/2022", lob: "Commercial Auto",   claims: 1, paid: 12_400,  outstanding: 0,      recoveries: 0,     incurred: 12_400  },
    { id: "gl-26", insured: "Apex Manufacturing Co.", carrier: "Travelers",      policyNumber: "TRV-GL-660145", effective: "06/01/2025", expiration: "06/01/2026", lob: "General Liability", claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "gl-25", insured: "Apex Manufacturing Co.", carrier: "Travelers",      policyNumber: "TRV-GL-660145", effective: "06/01/2024", expiration: "06/01/2025", lob: "General Liability", claims: 1, paid: 18_700,  outstanding: 5_400,  recoveries: 0,     incurred: 24_100  },
    { id: "gl-24", insured: "Apex Manufacturing Co.", carrier: "Travelers",      policyNumber: "TRV-GL-660145", effective: "06/01/2023", expiration: "06/01/2024", lob: "General Liability", claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "gl-23", insured: "Apex Manufacturing Co.", carrier: "Travelers",      policyNumber: "TRV-GL-660145", effective: "06/01/2022", expiration: "06/01/2023", lob: "General Liability", claims: 1, paid: 9_200,   outstanding: 0,      recoveries: 0,     incurred: 9_200   },
    { id: "pr-26", insured: "Apex Manufacturing Co.", carrier: "Chubb",          policyNumber: "CHB-PR-880421", effective: "06/01/2025", expiration: "06/01/2026", lob: "Property",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "pr-25", insured: "Apex Manufacturing Co.", carrier: "Chubb",          policyNumber: "CHB-PR-880421", effective: "06/01/2024", expiration: "06/01/2025", lob: "Property",          claims: 1, paid: 32_500,  outstanding: 0,      recoveries: 0,     incurred: 32_500  },
    { id: "pr-24", insured: "Apex Manufacturing Co.", carrier: "Chubb",          policyNumber: "CHB-PR-880421", effective: "06/01/2023", expiration: "06/01/2024", lob: "Property",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "cy-26", insured: "Apex Manufacturing Co.", carrier: "Beazley",        policyNumber: "BZL-CY-330918", effective: "06/01/2025", expiration: "06/01/2026", lob: "Cyber Liability",   claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "cy-25", insured: "Apex Manufacturing Co.", carrier: "Beazley",        policyNumber: "BZL-CY-330918", effective: "06/01/2024", expiration: "06/01/2025", lob: "Cyber Liability",   claims: 1, paid: 22_400,  outstanding: 4_200,  recoveries: 0,     incurred: 26_600  },
    { id: "um-26", insured: "Apex Manufacturing Co.", carrier: "AIG",            policyNumber: "AIG-UMB-99214", effective: "06/01/2025", expiration: "06/01/2026", lob: "Umbrella",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "um-25", insured: "Apex Manufacturing Co.", carrier: "AIG",            policyNumber: "AIG-UMB-99214", effective: "06/01/2024", expiration: "06/01/2025", lob: "Umbrella",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
  ],
  yearlyTrend: [
    { year: "2021", incurred: 50_500,  paid: 50_500,  premium: 318_400, frequency: 3 },
    { year: "2022", incurred: 51_000,  paid: 51_000,  premium: 342_700, frequency: 3 },
    { year: "2023", incurred: 410_700, paid: 349_600, premium: 376_900, frequency: 8 },
    { year: "2024", incurred: 295_500, paid: 225_300, premium: 412_500, frequency: 9 },
    { year: "2025", incurred: 46_200,  paid: 33_100,  premium: 438_900, frequency: 2 },
  ],
  causeBreakdown: [
    { name: "Workers Injury",  value: 467_900, color: C(1)    },
    { name: "Auto Collision",  value: 312_400, color: C(0.78) },
    { name: "Property / Fire", value: 32_500,  color: C(0.58) },
    { name: "Cyber Incident",  value: 26_600,  color: C(0.42) },
    { name: "Premises / GL",   value: 33_300,  color: C(0.28) },
  ],
  topLosses: [
    { id: "CLM-2023-7821", date: "2023-08-12", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   lob: "Workers' Comp",   cause: "Forklift back injury — Plant 2",    incurred: 168_400, status: "Open",   severity: "Large"  },
    { id: "CLM-2024-5512", date: "2024-04-21", insured: "Apex Manufacturing Co.", carrier: "Liberty Mutual", lob: "Commercial Auto", cause: "Multi-vehicle collision — I-15",    incurred: 142_900, status: "Open",   severity: "Large"  },
    { id: "CLM-2024-7740", date: "2024-09-03", insured: "Apex Manufacturing Co.", carrier: "Liberty Mutual", lob: "Commercial Auto", cause: "Rear-end collision — delivery van", incurred:  98_300, status: "Closed", severity: "Medium" },
    { id: "CLM-2023-6618", date: "2023-11-14", insured: "Apex Manufacturing Co.", carrier: "The Hartford",   lob: "Workers' Comp",   cause: "Repetitive motion — assembly line", incurred:  62_400, status: "Closed", severity: "Medium" },
    { id: "CLM-2025-0118", date: "2025-01-22", insured: "Apex Manufacturing Co.", carrier: "Chubb",          lob: "Property",        cause: "Electrical fire — paint booth",     incurred:  32_500, status: "Closed", severity: "Medium" },
  ],
  narrative: {
    concentration: "Workers' Comp and Commercial Auto",
    drivers: "the 2023 forklift back-injury and 2024 multi-vehicle collision (~94% of incurred)",
    outlook: "Frequency dropped 9 → 2 after the 2024 loss-control program rollout.",
    recommendation: "Retain & Re-Price",
    riskScore: "5.4 / 10",
    riskTone: "warning",
    confidence: "92%",
  },
};

/* ----------------------------- RIVER GLEN ----------------------------- */
const riverGlen: ClientDataset = {
  id: "river-glen",
  name: "River Glen Apartments LLC",
  fein: "47-3092841",
  industry: "Multifamily Real Estate (NAICS 531110)",
  hq: "Asheville, NC",
  locations: 6,
  employees: 42,
  brokerOfRecord: "River Glen Apartments LLC",
  reportPeriod: "07/01/2021 – 07/01/2026",
  runDate: "04/19/2026",
  policies: [
    { id: "pr-26", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", policyNumber: "INIGO-PR-44021", effective: "07/01/2025", expiration: "07/01/2026", lob: "Property",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "pr-25", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", policyNumber: "INIGO-PR-44021", effective: "07/01/2024", expiration: "07/01/2025", lob: "Property",          claims: 2, paid: 287_400, outstanding: 92_500, recoveries: 18_200, incurred: 361_700 },
    { id: "pr-24", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", policyNumber: "INIGO-PR-44021", effective: "07/01/2023", expiration: "07/01/2024", lob: "Property",          claims: 1, paid: 64_300,  outstanding: 0,      recoveries: 0,     incurred: 64_300  },
    { id: "pr-23", insured: "River Glen Apartments LLC", carrier: "Zurich",         policyNumber: "ZUR-PR-118341",  effective: "07/01/2022", expiration: "07/01/2023", lob: "Property",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
    { id: "gl-26", insured: "River Glen Apartments LLC", carrier: "Travelers",       policyNumber: "TRV-GL-330918",  effective: "07/01/2025", expiration: "07/01/2026", lob: "General Liability", claims: 1, paid: 14_800,  outstanding: 5_200,  recoveries: 0,     incurred: 20_000  },
    { id: "gl-25", insured: "River Glen Apartments LLC", carrier: "Travelers",       policyNumber: "TRV-GL-330918",  effective: "07/01/2024", expiration: "07/01/2025", lob: "General Liability", claims: 3, paid: 48_200,  outstanding: 8_400,  recoveries: 0,     incurred: 56_600  },
    { id: "gl-24", insured: "River Glen Apartments LLC", carrier: "Travelers",       policyNumber: "TRV-GL-330918",  effective: "07/01/2023", expiration: "07/01/2024", lob: "General Liability", claims: 2, paid: 21_400,  outstanding: 0,      recoveries: 0,     incurred: 21_400  },
    { id: "um-25", insured: "River Glen Apartments LLC", carrier: "AIG",             policyNumber: "AIG-UMB-77182",  effective: "07/01/2024", expiration: "07/01/2025", lob: "Umbrella",          claims: 0, paid: 0,       outstanding: 0,      recoveries: 0,     incurred: 0       },
  ],
  yearlyTrend: [
    { year: "2021", incurred: 12_400,  paid: 12_400,  premium: 184_200, frequency: 1 },
    { year: "2022", incurred: 0,       paid: 0,       premium: 198_700, frequency: 0 },
    { year: "2023", incurred: 85_700,  paid: 85_700,  premium: 224_500, frequency: 3 },
    { year: "2024", incurred: 418_300, paid: 335_600, premium: 268_900, frequency: 5 },
    { year: "2025", incurred: 20_000,  paid: 14_800,  premium: 312_400, frequency: 1 },
  ],
  causeBreakdown: [
    { name: "Hurricane / Wind", value: 287_400, color: C(1)    },
    { name: "Water Damage",     value: 138_600, color: C(0.78) },
    { name: "Slip & Fall",      value: 78_000,  color: C(0.58) },
    { name: "Fire",             value: 32_400,  color: C(0.42) },
  ],
  topLosses: [
    { id: "CLM-2024-9012", date: "2024-09-26", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", lob: "Property",          cause: "Hurricane Helene — wind/roof", incurred: 287_400, status: "Open",   severity: "Large"  },
    { id: "CLM-2024-9120", date: "2024-10-14", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", lob: "Property",          cause: "Water damage — burst riser",   incurred:  74_300, status: "Closed", severity: "Medium" },
    { id: "CLM-2024-7180", date: "2024-06-08", insured: "River Glen Apartments LLC", carrier: "Travelers",       lob: "General Liability", cause: "Slip & fall — pool deck",      incurred:  38_400, status: "Open",   severity: "Medium" },
    { id: "CLM-2023-4421", date: "2023-11-02", insured: "River Glen Apartments LLC", carrier: "Lloyd's (Inigo)", lob: "Property",          cause: "Kitchen fire — Unit 214",      incurred:  64_300, status: "Closed", severity: "Medium" },
  ],
  narrative: {
    concentration: "Property (CAT-driven)",
    drivers: "Hurricane Helene 2024 ($287K) and a burst-riser water loss",
    outlook: "Non-CAT frequency stable; current term clean post-mitigation upgrades.",
    recommendation: "Retain with CAT Re-Tier",
    riskScore: "6.1 / 10",
    riskTone: "warning",
    confidence: "89%",
  },
};

/* ----------------------------- LEAH'S PANTRY ----------------------------- */
const leahs: ClientDataset = {
  id: "leahs",
  name: "Leah's Pantry, Inc.",
  fein: "82-4419027",
  industry: "Specialty Food Manufacturing (NAICS 311999)",
  hq: "Oakland, CA",
  locations: 2,
  employees: 64,
  brokerOfRecord: "Leah's Pantry, Inc.",
  reportPeriod: "03/16/2021 – 03/16/2026",
  runDate: "04/19/2026",
  policies: [
    { id: "wc-26", insured: "Leah's Pantry, Inc.", carrier: "The Hartford", policyNumber: "72WEC DD2216", effective: "03/16/2025", expiration: "03/16/2026", lob: "Workers' Comp",     claims: 0, paid: 0,      outstanding: 0, recoveries: 0, incurred: 0      },
    { id: "wc-25", insured: "Leah's Pantry, Inc.", carrier: "The Hartford", policyNumber: "72WEC DD2216", effective: "03/16/2024", expiration: "03/16/2025", lob: "Workers' Comp",     claims: 1, paid: 8_400,  outstanding: 0, recoveries: 0, incurred: 8_400  },
    { id: "wc-24", insured: "Leah's Pantry, Inc.", carrier: "The Hartford", policyNumber: "72WEC DD2216", effective: "03/16/2023", expiration: "03/16/2024", lob: "Workers' Comp",     claims: 0, paid: 0,      outstanding: 0, recoveries: 0, incurred: 0      },
    { id: "gl-26", insured: "Leah's Pantry, Inc.", carrier: "Hanover",      policyNumber: "HAN-GL-22041", effective: "03/16/2025", expiration: "03/16/2026", lob: "General Liability", claims: 0, paid: 0,      outstanding: 0, recoveries: 0, incurred: 0      },
    { id: "gl-25", insured: "Leah's Pantry, Inc.", carrier: "Hanover",      policyNumber: "HAN-GL-22041", effective: "03/16/2024", expiration: "03/16/2025", lob: "General Liability", claims: 0, paid: 0,      outstanding: 0, recoveries: 0, incurred: 0      },
    { id: "pr-26", insured: "Leah's Pantry, Inc.", carrier: "Hanover",      policyNumber: "HAN-PR-22042", effective: "03/16/2025", expiration: "03/16/2026", lob: "Property",          claims: 0, paid: 0,      outstanding: 0, recoveries: 0, incurred: 0      },
  ],
  yearlyTrend: [
    { year: "2021", incurred: 0,     paid: 0,     premium: 92_400,  frequency: 0 },
    { year: "2022", incurred: 0,     paid: 0,     premium: 98_700,  frequency: 0 },
    { year: "2023", incurred: 0,     paid: 0,     premium: 104_200, frequency: 0 },
    { year: "2024", incurred: 8_400, paid: 8_400, premium: 112_800, frequency: 1 },
    { year: "2025", incurred: 0,     paid: 0,     premium: 121_400, frequency: 0 },
  ],
  causeBreakdown: [
    { name: "Workers Injury", value: 8_400, color: C(1) },
  ],
  topLosses: [
    { id: "CLM-2024-3318", date: "2024-07-22", insured: "Leah's Pantry, Inc.", carrier: "The Hartford", lob: "Workers' Comp", cause: "Kitchen burn — hot oil splash", incurred: 8_400, status: "Closed", severity: "Small" },
  ],
  narrative: {
    concentration: "minimal — book is essentially clean",
    drivers: "a single small kitchen-burn WC claim",
    outlook: "Loss-free across 4 of 5 years with strong premium growth.",
    recommendation: "Retain & Grow",
    riskScore: "2.1 / 10",
    riskTone: "success",
    confidence: "97%",
  },
};

export const CLIENT_DATASETS: ClientDataset[] = [apex, riverGlen, leahs];

// ───── Customer-book derived stats ─────
// Roll up the per-customer policies into the book-level facts a broker
// needs to scan: next renewal date, account loss ratio, open claims,
// total premium. Used by the customer-list panel above the per-customer
// dashboard.

export interface CustomerBookRow {
  id: string;
  name: string;
  industry: string;
  hq: string;
  carriers: number;
  policies: number;
  totalIncurred: number;
  openClaims: number;
  largeOpen: number;
  totalPremium5yr: number;
  lossRatioPct: number;
  nextRenewalISO: string;   // earliest future expiration across policies
  daysToRenewal: number;
  status: "renewal_due" | "clean" | "attention";
  riskScore: string;
  recommendation: string;
}

function parseUS(date: string): Date {
  // dataset uses MM/DD/YYYY
  const [m, d, y] = date.split("/").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

export function buildCustomerBook(today = new Date()): CustomerBookRow[] {
  return CLIENT_DATASETS.map((c) => {
    const carriers = new Set(c.policies.map((p) => p.carrier)).size;
    const totalIncurred = c.policies.reduce((s, p) => s + p.incurred, 0);
    const openClaims = c.topLosses.filter((l) => l.status === "Open").length;
    const largeOpen = c.topLosses.filter((l) => l.status === "Open" && l.severity === "Large").length;
    const totalPremium = c.yearlyTrend.reduce((s, y) => s + y.premium, 0);
    const lossRatio = totalPremium ? (totalIncurred / totalPremium) * 100 : 0;

    // Next renewal = earliest expiration after today across all policies.
    const futureExp = c.policies
      .map((p) => parseUS(p.expiration))
      .filter((d) => d.getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    const next = futureExp[0] ?? parseUS(c.policies[c.policies.length - 1].expiration);
    const days = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status: CustomerBookRow["status"] = "clean";
    if (days <= 90) status = "renewal_due";
    if (largeOpen > 0 || lossRatio > 60) status = "attention";

    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      hq: c.hq,
      carriers,
      policies: c.policies.length,
      totalIncurred,
      openClaims,
      largeOpen,
      totalPremium5yr: totalPremium,
      lossRatioPct: +lossRatio.toFixed(1),
      nextRenewalISO: next.toISOString(),
      daysToRenewal: days,
      status,
      riskScore: c.narrative.riskScore,
      recommendation: c.narrative.recommendation,
    };
  });
}

export function getClientDataset(id: string): ClientDataset {
  return CLIENT_DATASETS.find((c) => c.id === id) ?? apex;
}
