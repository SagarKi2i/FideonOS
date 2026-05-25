// Policy comparison mock data for commercial LOBs.
// Mock values are inspired by real source documents (Travelers Auto, CNA Crime/D&O, etc.)
// and structured to match the LOB field schema used by the Fideon extraction engine.

export type FieldStatus = "match" | "improved" | "reduced" | "new" | "missing" | "neutral";

export interface FieldRow {
  label: string;
  a: string;
  b: string;
  status: FieldStatus;
  note?: string;
}

export interface FieldGroup {
  title: string;
  fields: FieldRow[];
}

export interface LOBComparison {
  lob: string;
  lobLabel: string;
  shortLabel: string;
  fieldsExtracted: number;
  policyA: {
    carrier: string;
    policyNumber: string;
    term: string;
    premium: number;
    insured: string;
    agency: string;
  };
  policyB: {
    carrier: string;
    policyNumber: string;
    term: string;
    premium: number;
    insured: string;
    agency: string;
  };
  groups: FieldGroup[];
  gaps: { severity: "high" | "medium" | "low"; title: string; detail: string }[];
  strengths: { side: "A" | "B"; title: string }[];
  recommendation: { winner: "A" | "B" | "tie"; score: number; rationale: string };
}

const auto: LOBComparison = {
  lob: "auto",
  lobLabel: "Commercial Auto",
  shortLabel: "Auto",
  fieldsExtracted: 35,
  policyA: {
    carrier: "Travelers Casualty Ins. Co. of America",
    policyNumber: "BA-1L251829-24-42-G",
    term: "09/24/2024 – 09/24/2025",
    premium: 2317,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "Travelers Casualty Ins. Co. of America",
    policyNumber: "BA-1L251829-25-42-G",
    term: "09/24/2025 – 09/24/2026",
    premium: 2517,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  groups: [
    {
      title: "Coverage Symbols",
      fields: [
        { label: "Owned Auto Liability Symbol", a: "1 — Any Auto", b: "1 — Any Auto", status: "match" },
        { label: "Collision Symbol", a: "2 — All Owned", b: "2 — All Owned", status: "match" },
        { label: "Comprehensive Symbol", a: "2 — All Owned", b: "2 — All Owned", status: "match" },
        { label: "Hired Car Symbol", a: "8 — Hired Autos", b: "8 — Hired Autos", status: "match" },
        { label: "Non-Owned Symbol", a: "9 — Non-Owned", b: "9 — Non-Owned", status: "match" },
        { label: "UM / UIM Symbol", a: "2 — All Owned", b: "2 — All Owned", status: "match" },
      ],
    },
    {
      title: "Limits of Liability",
      fields: [
        { label: "Liability — Combined Single Limit", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Medical Payments", a: "$5,000", b: "$5,000", status: "match" },
        { label: "Uninsured Motorist (IL)", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Underinsured Motorist (IL)", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Hired Car / Non-Owned Liability", a: "Included", b: "Included", status: "match" },
      ],
    },
    {
      title: "Vehicle Schedule",
      fields: [
        { label: "Number of Vehicles", a: "1", b: "1", status: "match" },
        { label: "Vehicle 1 — Year / Make / Model", a: "2011 Chevrolet Silverado", b: "2011 Chevrolet Silverado", status: "match" },
        { label: "Vehicle 1 — Cost New", a: "$34,310", b: "$34,310", status: "match" },
        { label: "Comprehensive Deductible", a: "$1,000", b: "$1,000", status: "match" },
        { label: "Collision Deductible", a: "$1,000", b: "$1,000", status: "match" },
        { label: "Roadside Assistance", a: "Included", b: "Included", status: "match" },
        { label: "Vehicle 1 — Premium", a: "$1,492.00", b: "$1,642.00", status: "reduced", note: "+$150 (10%) at renewal" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "Liability Premium", a: "$1,253.00", b: "$1,361.00", status: "reduced", note: "+8.6%" },
        { label: "Physical Damage Premium", a: "$259.00", b: "$281.00", status: "reduced", note: "+8.5%" },
        { label: "Miscellaneous", a: "$805.00", b: "$875.00", status: "reduced", note: "+8.7%" },
        { label: "Total Annual Premium", a: "$2,317.00", b: "$2,517.00", status: "reduced", note: "+$200 (8.6%)" },
      ],
    },
  ],
  gaps: [
    { severity: "low", title: "Symbol 1 grants broad liability — verify intent", detail: "Renewal retains Symbol 1 (Any Auto) which extends liability to non-owned and hired exposures. Confirm this matches insured's operations." },
    { severity: "medium", title: "No scheduled UMPD on Illinois state line", detail: "Illinois schedule shows blank UMPD — recommend election form on file before bind." },
  ],
  strengths: [
    { side: "B", title: "All limits, deductibles, and symbols held flat YoY" },
    { side: "A", title: "Lower total premium — $200 savings vs renewal" },
    { side: "B", title: "Driver schedule unchanged, carrier continuity preserved" },
  ],
  recommendation: { winner: "B", score: 91, rationale: "Renewal is structurally identical with no coverage erosion. Premium increase of 8.6% is in line with IL commercial auto market trend. Bind as-is once UM/UIM IL election form is on file." },
};

const crime: LOBComparison = {
  lob: "crime",
  lobLabel: "Crime / Fidelity",
  shortLabel: "Crime",
  fieldsExtracted: 59,
  policyA: {
    carrier: "Travelers Cas. & Surety Co. of America",
    policyNumber: "106957419-2024",
    term: "10/04/2024 – 10/04/2025",
    premium: 1425,
    insured: "Bridgewater of Naperville Condo Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "CNA — Continental Casualty Co.",
    policyNumber: "618694659",
    term: "10/04/2025 – 10/04/2026",
    premium: 522,
    insured: "Camberley Club Townhome Owners Assoc.",
    agency: "Ian H. Graham (Aon)",
  },
  groups: [
    {
      title: "Employee Theft & Fidelity",
      fields: [
        { label: "Employee Theft / Dishonesty", a: "$500,000", b: "$1,200,000", status: "improved", note: "+$700K (140%)" },
        { label: "ERISA Fidelity", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "Employee Theft of Client Property", a: "$10,000", b: "$25,000", status: "improved" },
        { label: "Designated Property Manager Coverage", a: "Included", b: "Included", status: "match" },
        { label: "Board Member Coverage", a: "Included", b: "Included", status: "match" },
      ],
    },
    {
      title: "Forgery, Premises & Computer",
      fields: [
        { label: "Forgery or Alteration", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "On-Premises (Money & Securities)", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "In-Transit", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "Money Orders & Counterfeit", a: "$25,000", b: "$250,000", status: "improved", note: "Counterfeit Coverage 10×" },
        { label: "Computer Fraud", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "Computer Program & Data Restoration", a: "$10,000", b: "$25,000", status: "improved" },
      ],
    },
    {
      title: "Funds Transfer & Social Engineering",
      fields: [
        { label: "Funds Transfer Fraud", a: "$500,000", b: "$1,200,000", status: "improved" },
        { label: "Social Engineering Fraud", a: "$50,000", b: "$100,000", status: "improved", note: "Sublimit doubled" },
        { label: "Personal Accounts Forgery", a: "$25,000", b: "Not Scheduled", status: "missing", note: "Removed at renewal" },
        { label: "Identity Fraud Reimbursement", a: "$25,000", b: "Not Scheduled", status: "missing" },
      ],
    },
    {
      title: "Retentions (Per Claim)",
      fields: [
        { label: "Employee Theft Retention", a: "$2,500", b: "$1,000", status: "improved", note: "Reduced retention" },
        { label: "Forgery Retention", a: "$2,500", b: "$1,000", status: "improved" },
        { label: "Computer Fraud Retention", a: "$2,500", b: "$1,000", status: "improved" },
        { label: "Funds Transfer Retention", a: "$2,500", b: "$1,000", status: "improved" },
        { label: "On-Premises / In-Transit Retention", a: "$1,000", b: "$0", status: "improved" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "Annual Crime Premium", a: "$1,425.00", b: "$522.00", status: "improved", note: "−$903 (−63%) with 2× limits" },
      ],
    },
  ],
  gaps: [
    { severity: "high", title: "Personal Accounts Forgery & Identity Fraud not on renewal", detail: "These two endorsements were carried on the prior Travelers form and are absent from CNA quote. Request quote with both reinstated." },
    { severity: "low", title: "Social Engineering sublimit capped at $100K", detail: "Industry benchmark for HOAs of this size is $250K. Negotiate uplift." },
  ],
  strengths: [
    { side: "B", title: "Employee theft limit increased to $1.2M (industry-leading for HOA)" },
    { side: "B", title: "Retentions cut in half across all coverage parts" },
    { side: "B", title: "63% premium reduction with broader coverage" },
    { side: "A", title: "Carried Identity Fraud + Personal Accounts Forgery" },
  ],
  recommendation: { winner: "B", score: 96, rationale: "CNA quote materially expands core fidelity limits while reducing retentions and total cost. Recommend bind contingent on adding Personal Accounts Forgery and Identity Fraud endorsements." },
};

const dno: LOBComparison = {
  lob: "dno",
  lobLabel: "Directors & Officers",
  shortLabel: "D&O",
  fieldsExtracted: 29,
  policyA: {
    carrier: "Federal Insurance Co. (Chubb)",
    policyNumber: "8245-9947-2024",
    term: "10/04/2024 – 10/04/2025",
    premium: 1845,
    insured: "Camberley Club Townhome Owners Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "CNA — Continental Casualty Co.",
    policyNumber: "618694659",
    term: "10/04/2025 – 10/04/2026",
    premium: 1320,
    insured: "Camberley Club Townhome Owners Assoc.",
    agency: "Ian H. Graham (Aon)",
  },
  groups: [
    {
      title: "Limits & Retention",
      fields: [
        { label: "Maximum Aggregate Limit of Liability", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Annual Aggregate", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Retention (Per Claim)", a: "$2,500", b: "$1,000", status: "improved", note: "Retention reduced 60%" },
        { label: "Defense Costs in Addition to Limit", a: "Yes", b: "Yes", status: "match", note: "Critical for HOA boards" },
        { label: "Duty to Defend", a: "Yes", b: "Yes", status: "match" },
      ],
    },
    {
      title: "Coverage Triggers",
      fields: [
        { label: "Full Prior Acts", a: "Yes", b: "Yes", status: "match" },
        { label: "Retroactive Date", a: "10/04/2014", b: "Full Prior Acts", status: "improved", note: "Removes retro limit" },
        { label: "Prior / Pending Litigation Date", a: "10/04/2014", b: "10/04/2025", status: "reduced", note: "Reset on new carrier" },
        { label: "Management Company Coverage", a: "Included", b: "Included", status: "match" },
      ],
    },
    {
      title: "Defense Coverage",
      fields: [
        { label: "Libel and Slander", a: "Included", b: "Included", status: "match" },
        { label: "Third-Party Discrimination", a: "Included", b: "Included", status: "match" },
        { label: "Defense of Non-Monetary Claims", a: "Included", b: "Included", status: "match" },
        { label: "Defense of Breach of Contract", a: "Excluded", b: "Included", status: "improved", note: "New affirmative coverage" },
        { label: "Defense of Placement / Adequacy of Insurance", a: "Excluded", b: "Included", status: "improved" },
        { label: "Defense of Dishonesty/Fraud (until proven)", a: "Included", b: "Included", status: "match" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "D&O Premium (Association Liability)", a: "$1,845.00", b: "$1,320.00", status: "improved", note: "−$525 (−28%)" },
      ],
    },
  ],
  gaps: [
    { severity: "high", title: "Prior & Pending Litigation date resets to 10/04/2025", detail: "Switching carriers loses 11 years of P&P date credit. Request P&P warranty matching expiring policy." },
    { severity: "low", title: "$1M aggregate may be light for buildings >100 units", detail: "Benchmark a $2M option — typical incremental cost is ~$400/yr." },
  ],
  strengths: [
    { side: "B", title: "Retention reduced from $2,500 → $1,000" },
    { side: "B", title: "Affirmative defense for breach of contract & insurance placement claims" },
    { side: "B", title: "Full Prior Acts replaces 2014 retro date" },
    { side: "A", title: "Carrier continuity preserves P&P litigation date" },
  ],
  recommendation: { winner: "B", score: 88, rationale: "CNA / IHG renewal is a significant coverage upgrade at lower cost. Address P&P date carryover via warranty before bind." },
};

const gl: LOBComparison = {
  lob: "gl",
  lobLabel: "General Liability",
  shortLabel: "GL",
  fieldsExtracted: 36,
  policyA: {
    carrier: "Travelers Indemnity Co.",
    policyNumber: "Y-630-1L251829-2024",
    term: "09/24/2024 – 09/24/2025",
    premium: 4180,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "Travelers Indemnity Co.",
    policyNumber: "Y-630-1L251829-2025",
    term: "09/24/2025 – 09/24/2026",
    premium: 4495,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  groups: [
    {
      title: "Limits of Liability",
      fields: [
        { label: "General Aggregate", a: "$2,000,000", b: "$2,000,000", status: "match" },
        { label: "Each Occurrence", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Products & Completed Ops Aggregate", a: "$2,000,000", b: "$2,000,000", status: "match" },
        { label: "Personal & Advertising Injury", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Damage to Premises Rented to You", a: "$300,000", b: "$300,000", status: "match" },
        { label: "Premises Medical (per person)", a: "$10,000", b: "$10,000", status: "match" },
        { label: "Per-Occurrence Deductible", a: "$0", b: "$0", status: "match" },
      ],
    },
    {
      title: "Coverage Extensions",
      fields: [
        { label: "Employee Benefits Liability", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Contractual Liability", a: "Included (Broad)", b: "Included (Broad)", status: "match" },
        { label: "Broad Form Property Damage", a: "Included", b: "Included", status: "match" },
        { label: "Host Liquor Liability", a: "Included", b: "Included", status: "match" },
        { label: "Employees as Additional Insured", a: "Included", b: "Included", status: "match" },
        { label: "Hired & Non-Owned Auto", a: "Endorsement Required", b: "Included by Endorsement", status: "improved", note: "Removed gap" },
      ],
    },
    {
      title: "Schedule of Exposures",
      fields: [
        { label: "Classification", a: "Condominiums – Residential", b: "Condominiums – Residential", status: "match" },
        { label: "Class Code", a: "62003", b: "62003", status: "match" },
        { label: "Premium Basis", a: "Per Unit", b: "Per Unit", status: "match" },
        { label: "Exposure", a: "286 units", b: "286 units", status: "match" },
        { label: "Rate — Premises/Ops (per unit)", a: "$11.45", b: "$12.55", status: "reduced", note: "+9.6%" },
        { label: "Advanced Premium — Premises/Ops", a: "$3,275", b: "$3,590", status: "reduced" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "Total GL Premium", a: "$4,180.00", b: "$4,495.00", status: "reduced", note: "+$315 (7.5%)" },
      ],
    },
  ],
  gaps: [
    { severity: "medium", title: "No standalone Assault & Battery sublimit listed", detail: "Recommend adding $500K A&B sublimit — common HOA exposure." },
    { severity: "low", title: "No Abuse & Molestation endorsement", detail: "If on-site staff or contractors interact with minors at pool/clubhouse, schedule A&M." },
  ],
  strengths: [
    { side: "B", title: "All key limits held flat YoY" },
    { side: "B", title: "Hired & Non-Owned Auto now built into GL" },
    { side: "A", title: "Lower per-unit GL rate ($11.45 vs $12.55)" },
  ],
  recommendation: { winner: "B", score: 89, rationale: "Renewal preserves all critical limits and adds HNOA. 7.5% rate uptick is acceptable; recommend binding with A&B and A&M endorsements quoted as options." },
};

const property: LOBComparison = {
  lob: "property",
  lobLabel: "Commercial Property",
  shortLabel: "Property",
  fieldsExtracted: 92,
  policyA: {
    carrier: "Lloyd's of London — Syndicate 1301 (Expiring)",
    policyNumber: "B1230AP00776A24",
    term: "10/01/2024 – 10/01/2025",
    premium: 46180,
    insured: "River Glen Condominium Association",
    agency: "Amwins Global Risks / EOS PAM",
  },
  policyB: {
    carrier: "Lloyd's of London — Lead Syndicate Inigo (A — Superior)",
    policyNumber: "B1230AP00776A25",
    term: "10/01/2025 – 05/27/2026",
    premium: 49497,
    insured: "River Glen Condominium Association",
    agency: "Amwins Global Risks / EOS PAM",
  },
  groups: [
    {
      title: "Program & Carrier Structure",
      fields: [
        { label: "Program Name", a: "EOS Property and Asset Management", b: "EOS Property and Asset Management", status: "match" },
        { label: "Lead Carrier / Syndicate", a: "Lloyd's Syndicate 1301", b: "Lloyd's — Lead Syndicate Inigo", status: "improved", note: "Lead changed to Inigo" },
        { label: "A.M. Best Rating", a: "A (Superior)", b: "A (Superior)", status: "match" },
        { label: "Cause of Loss Form", a: "Special Form", b: "Special Form", status: "match" },
        { label: "Per Occurrence Program Limit", a: "$500,000,000", b: "$500,000,000", status: "match" },
        { label: "First Named Insured", a: "EOS PAM 1 LP", b: "EOS PAM 1 LP", status: "match" },
        { label: "Participant", a: "River Glen Condominium Association", b: "River Glen Condominium Association", status: "match" },
        { label: "Policy Term", a: "10/01/2024 – 10/01/2025 (12 mo)", b: "10/01/2025 – 05/27/2026 (~8 mo)", status: "reduced", note: "Short-rated to align master program renewal" },
        { label: "U.M.R.", a: "B1230AP00776A24", b: "B1230AP00776A25", status: "match" },
      ],
    },
    {
      title: "Insured Values (Statement of Values)",
      fields: [
        { label: "Real Property", a: "$26,200,000", b: "$27,034,000", status: "improved", note: "+3.2% trended" },
        { label: "Business Personal Property", a: "$1,500,000", b: "$1,500,000", status: "match" },
        { label: "Other Value", a: "NIL", b: "NIL", status: "match" },
        { label: "Business Income / Rental", a: "$372,000", b: "$386,239", status: "improved" },
        { label: "Participant Total Insured Value", a: "$28,072,000", b: "$28,920,239", status: "improved", note: "+3.0%" },
        { label: "Valuation Basis", a: "Replacement Cost Blanket", b: "Replacement Cost Blanket", status: "match" },
        { label: "Co-Insurance", a: "NIL", b: "NIL", status: "match" },
        { label: "Rental Values", a: "As Scheduled", b: "As Scheduled", status: "match" },
      ],
    },
    {
      title: "CAT Sublimits — Earth Movement & Flood",
      fields: [
        { label: "Earth Movement Annual Aggregate", a: "$100,000,000", b: "$100,000,000", status: "match" },
        { label: "EQ — California / Alaska / Hawaii / PR", a: "No Coverage", b: "No Coverage", status: "match" },
        { label: "EQ — Pacific Northwest Zone", a: "$100,000,000 Agg", b: "$100,000,000 Agg", status: "match" },
        { label: "EQ — New Madrid Counties", a: "$100,000,000 Agg", b: "$100,000,000 Agg", status: "match" },
        { label: "Flood Annual Aggregate", a: "$100,000,000", b: "$100,000,000", status: "match" },
        { label: "Flood — SFHA (100-yr)", a: "$25,000,000", b: "$50,000,000", status: "improved", note: "Doubled SFHA sublimit" },
        { label: "Named Windstorm Per Occurrence", a: "$250,000,000", b: "$250,000,000", status: "match" },
      ],
    },
    {
      title: "Time Element & Business Income",
      fields: [
        { label: "Extended Period of Indemnity", a: "365 days", b: "365 days", status: "match" },
        { label: "Extra Expense", a: "Included", b: "Included", status: "match" },
        { label: "Ordinary Payroll", a: "90 days", b: "90 days", status: "match" },
        { label: "Ingress & Egress", a: "60 days / $5M / 5 mi", b: "60 days / $5M / 5 mi", status: "match" },
        { label: "Civil or Military Authority", a: "60 days / $5M / 5 mi", b: "60 days / $5M / 5 mi", status: "match" },
        { label: "Contingent Time Element", a: "$2,500,000 ($100K CAT)", b: "$2,500,000 ($100K CAT)", status: "match" },
        { label: "Service Interruption (PD & BI)", a: "$25,000,000", b: "$25,000,000", status: "match" },
        { label: "Impound Water (incl. Loss of Rents)", a: "$1,000,000 / 60 days", b: "$1,000,000 / 60 days", status: "match" },
      ],
    },
    {
      title: "Property Sublimits — Coverage Extensions",
      fields: [
        { label: "Accounts Receivable", a: "$5,000,000", b: "$5,000,000", status: "match" },
        { label: "Arson or Theft Reward", a: "$5,000,000", b: "$5,000,000", status: "match" },
        { label: "Newly Acquired Property", a: "$25,000,000", b: "$25,000,000", status: "match" },
        { label: "Backup of Sewers & Drains", a: "Included", b: "Included", status: "match" },
        { label: "Boiler & Machinery / Equipment Breakdown", a: "$100,000,000", b: "$100,000,000", status: "match" },
        { label: "Course of Construction — Hard Costs", a: "$5,000,000", b: "$5,000,000", status: "match" },
        { label: "Course of Construction — Soft Costs", a: "$500,000", b: "$500,000", status: "match" },
        { label: "COC — Off Premises Storage", a: "$250,000", b: "$250,000", status: "match" },
        { label: "Delay in Start-up (COC)", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Electronic Data Processing & Media", a: "$150,000,000", b: "$150,000,000", status: "match" },
        { label: "Emergency Evacuation Expense", a: "$250,000", b: "$250,000", status: "match" },
        { label: "Errors or Omissions", a: "$10,000,000", b: "$10,000,000", status: "match" },
        { label: "Expediting Expenses", a: "$10,000,000", b: "$10,000,000", status: "match" },
        { label: "Fine Arts (per item / per occ)", a: "$100,000 / $1,000,000", b: "$100,000 / $1,000,000", status: "match" },
        { label: "Fire Brigade & Extinguishing Expenses", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Fire Department Service Charge", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Fungus, Mold & Spores", a: "$2,500,000 / $5,000,000 Agg", b: "$2,500,000 / $5,000,000 Agg", status: "match" },
        { label: "Contractual Penalties", a: "$250,000", b: "$250,000", status: "match" },
        { label: "Decontamination Cost (Annual Agg)", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Debris Removal", a: "Greater of 25% of loss or $25M", b: "Greater of 25% of loss or $25M", status: "match" },
        { label: "Leasehold Interest", a: "$5,000,000", b: "$5,000,000", status: "match" },
        { label: "Limited Pollution Coverage (Agg)", a: "$2,500,000", b: "$2,500,000", status: "match" },
        { label: "Miscellaneous Unnamed Locations", a: "$10,000,000", b: "$10,000,000", status: "match" },
        { label: "Outdoor Property (per item / total)", a: "$250,000 / $2,500,000", b: "$250,000 / $2,500,000", status: "match" },
        { label: "Pairs or Sets", a: "$2,500,000", b: "$2,500,000", status: "match" },
        { label: "Professional Fees", a: "$2,500,000", b: "$2,500,000", status: "match" },
        { label: "Protection & Preservation of Property", a: "$2,500,000", b: "$2,500,000", status: "match" },
        { label: "Renovations (Non-Structural)", a: "$500,000", b: "$500,000", status: "match" },
        { label: "Personal Property of Others", a: "Included", b: "Included", status: "match" },
        { label: "Tax Credits", a: "$500,000", b: "$500,000", status: "match" },
        { label: "Transit (Per Conveyance)", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Valuable Papers & Records", a: "$10,000,000", b: "$10,000,000", status: "match" },
        { label: "Wind Driven Precipitation", a: "Included (subj. peril ded.)", b: "Included (subj. peril ded.)", status: "match" },
      ],
    },
    {
      title: "Ordinance or Law (Demolition & ICC)",
      fields: [
        { label: "Coverage A — Undamaged Portion", a: "Included", b: "Included", status: "match" },
        { label: "Coverage B — Demolition", a: "$150,000,000", b: "$150,000,000", status: "match" },
        { label: "Coverage C — Increased Cost of Construction", a: "$150,000,000", b: "$150,000,000", status: "match" },
        { label: "Coverage D — Time Element", a: "Included", b: "Included", status: "match" },
        { label: "Coverage E — Downsizing", a: "$5,000,000", b: "$5,000,000", status: "match" },
      ],
    },
    {
      title: "Deductibles (Per Occurrence)",
      fields: [
        { label: "All Other Perils", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Earth Movement (non-CA/AK/HI/PR)", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Earth Movement — CA/AK/HI/PR", a: "2% TIV per Unit", b: "2% TIV per Unit", status: "match" },
        { label: "Flood (non-SFHA)", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Flood — Building in SFHA", a: "$500,000 per building", b: "$500,000 per building", status: "match" },
        { label: "Flood — Personal Property in SFHA", a: "$500,000", b: "$500,000", status: "match" },
        { label: "Flood — Time Element in SFHA", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Windstorm or Hail — base", a: "$100,000 per occ.", b: "$100,000 per occ.", status: "match" },
        { label: "Named Windstorm — Tier One", a: "5% per Unit (min $100K)", b: "5% per Unit (min $100K)", status: "match" },
        { label: "Wind/Hail — Hail Zone 1 or 2", a: "3% per Unit (min $100K)", b: "3% per Unit (min $100K)", status: "match" },
        { label: "Equipment Breakdown", a: "$100,000", b: "$100,000", status: "match" },
        { label: "Service Interruption (PD & BI)", a: "48 hr Waiting Period", b: "48 hr Waiting Period", status: "match" },
        { label: "Ingress/Egress / Util / Civil Auth.", a: "48 hr Waiting Period", b: "48 hr Waiting Period", status: "match" },
        { label: "Contingent Time Element", a: "48 hr Waiting Period", b: "48 hr Waiting Period", status: "match" },
      ],
    },
    {
      title: "Endorsements & Special Provisions",
      fields: [
        { label: "Roof Age >15 yrs Settlement", a: "Replacement Cost", b: "Actual Cash Value (ACV)", status: "reduced", note: "Material reduction for aged roofs" },
        { label: "Roof Cosmetic Damage Exclusion", a: "Not Applied", b: "Applied", status: "reduced" },
        { label: "BI/EE Per-Location Schedule Required", a: "Recommended", b: "Mandatory — blank = no coverage", status: "reduced" },
        { label: "Communicable Disease (LMA5583B)", a: "Excluded", b: "Excluded", status: "match" },
        { label: "Cyber Loss / Data Exclusion (LMA5400)", a: "Applied", b: "Applied", status: "match" },
        { label: "Sanctions Limitation (LMA5390)", a: "Applied", b: "Applied", status: "match" },
        { label: "War & Civil War Exclusion (NMA2920)", a: "Applied", b: "Applied", status: "match" },
        { label: "Service of Suit USA (LMA5020B)", a: "Applied", b: "Applied", status: "match" },
        { label: "Hurricane Helene / Milton Losses", a: "N/A", b: "Warranted No Losses — Excluded", status: "reduced", note: "New post-2024 storm warranty" },
      ],
    },
    {
      title: "Premium, Taxes & Commission",
      fields: [
        { label: "Annual Premium", a: "$68,420.00", b: "$72,300.60", status: "reduced", note: "+5.7% rate increase" },
        { label: "Term Premium & Fees (short term)", a: "$45,180.00", b: "$48,083.06", status: "reduced" },
        { label: "Surplus Lines Tax (3%)", a: "$1,355.40", b: "$1,414.21", status: "reduced" },
        { label: "Total Amount Due (Taxes & Fees)", a: "$46,535.40", b: "$49,497.26", status: "reduced", note: "+$2,961.86 (6.4%)" },
        { label: "Commission %", a: "10%", b: "10%", status: "match" },
        { label: "Equipment Breakdown Standalone Cost", a: "$2,400 + 5% tax", b: "$2,500 + 5% tax", status: "reduced", note: "100MM Limit option" },
        { label: "Deposit / Minimum Earned", a: "30%", b: "35%", status: "reduced" },
        { label: "Notice of Cancellation (Non-Pay)", a: "10 days", b: "10 days", status: "match" },
        { label: "100% Fully Earned Loss Provision", a: "180 days / 10-day premium clear", b: "180 days / 10-day premium clear", status: "match" },
      ],
    },
  ],
  gaps: [
    { severity: "high", title: "Roof >15 years now settled at ACV", detail: "Material valuation downgrade for aged roofs. Request Schedule of Roof Ages and consider RC-on-Roof buyback or capital reserve earmark." },
    { severity: "high", title: "Roof Cosmetic Damage Exclusion now applies", detail: "Hail-related cosmetic dents on roof panels will not be covered — material exposure for any property in Hail Zones 1 or 2." },
    { severity: "high", title: "Hurricane Helene / Milton — Warranted No Losses", detail: "New 2025 warranty. Confirm with EOS PAM and insured that no FL/SE-coast losses fall in the warranty window or coverage may void." },
    { severity: "medium", title: "Short policy term (10/1/25 – 5/27/26)", detail: "Term aligned to master program but ~8 months. Plan renewal marketing now for May 2026 — re-rate exposure is concentrated." },
    { severity: "medium", title: "BI/EE coverage requires per-location schedule", detail: "Any blank Business Income value on the SOV = NO coverage at that location. Validate every River Glen site is scheduled with BI/EE." },
    { severity: "low", title: "Equipment Breakdown jurisdictional inspections excluded", detail: "Carrier does not provide jurisdictional inspections. If state requires, recommend standalone EB policy ($2,500 + tax for $100M)." },
  ],
  strengths: [
    { side: "B", title: "Flood SFHA sublimit doubled — $25M → $50M" },
    { side: "B", title: "Lead syndicate upgraded to Inigo (A Superior)" },
    { side: "B", title: "All 28 coverage extensions held flat — no sublimit erosion" },
    { side: "B", title: "Named Windstorm $250M and Program Limit $500M unchanged" },
    { side: "A", title: "Full 12-month term vs ~8-month renewal" },
    { side: "A", title: "RC settlement on roofs regardless of age" },
  ],
  recommendation: { winner: "B", score: 74, rationale: "Renewal preserves the $500M shared-limit program and doubles Flood SFHA, but introduces ACV-on-aged-roof, a cosmetic damage exclusion, and a 2024-storm warranty. Recommend binding only after: (1) confirming roof ages and pricing an RC buyback, (2) validating Helene/Milton no-loss warranty, and (3) ensuring every River Glen unit has a BI/EE value scheduled." },
};

const umbrella: LOBComparison = {
  lob: "umbrella",
  lobLabel: "Umbrella / Excess",
  shortLabel: "Umbrella",
  fieldsExtracted: 27,
  policyA: {
    carrier: "Travelers Excess & Surplus",
    policyNumber: "ZUP-15T87293-24",
    term: "09/24/2024 – 09/24/2025",
    premium: 3850,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "Travelers Excess & Surplus",
    policyNumber: "ZUP-15T87293-25",
    term: "09/24/2025 – 09/24/2026",
    premium: 4220,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  groups: [
    {
      title: "Umbrella Limits",
      fields: [
        { label: "Aggregate Limit", a: "$5,000,000", b: "$10,000,000", status: "improved", note: "Doubled" },
        { label: "Each Occurrence Limit", a: "$5,000,000", b: "$10,000,000", status: "improved" },
        { label: "Products / Completed Ops Aggregate", a: "$5,000,000", b: "$10,000,000", status: "improved" },
        { label: "Retained Limit / SIR", a: "$10,000", b: "$10,000", status: "match" },
        { label: "Crisis Management Endorsement", a: "$50,000", b: "$100,000", status: "improved" },
        { label: "Retroactive Date", a: "Not Applicable", b: "Not Applicable", status: "match" },
      ],
    },
    {
      title: "Schedule of Underlying Policies",
      fields: [
        { label: "Underlying GL Limits", a: "$1M / $2M agg", b: "$1M / $2M agg", status: "match" },
        { label: "Underlying GL Carrier / Policy", a: "Travelers Y-630-1L251829", b: "Travelers Y-630-1L251829", status: "match" },
        { label: "Underlying Auto Limits", a: "$1,000,000 CSL", b: "$1,000,000 CSL", status: "match" },
        { label: "Underlying Auto Carrier / Policy", a: "Travelers BA-1L251829", b: "Travelers BA-1L251829", status: "match" },
        { label: "Underlying Employer's Liability", a: "$500K / $500K / $500K", b: "$1M / $1M / $1M", status: "improved", note: "EL limits raised" },
        { label: "Underlying D&O / Association Liability", a: "$1,000,000", b: "$1,000,000", status: "match" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "Total Umbrella Premium", a: "$3,850.00", b: "$4,220.00", status: "reduced", note: "+$370 for $5M additional limit — strong rate-on-line" },
      ],
    },
  ],
  gaps: [
    { severity: "low", title: "No follow-form for D&O on the umbrella", detail: "If board wants $5M D&O tower, schedule a separate Side-A DIC excess." },
  ],
  strengths: [
    { side: "B", title: "Umbrella limit doubled to $10M for only +9.6% premium" },
    { side: "B", title: "Crisis Management sublimit doubled to $100K" },
    { side: "B", title: "Underlying Employer's Liability raised to $1M/$1M/$1M" },
  ],
  recommendation: { winner: "B", score: 95, rationale: "Best-value renewal in the program. Doubling limits at +$370/yr is exceptional. Bind." },
};

const wcNoPayroll: LOBComparison = {
  lob: "wc-no-payroll",
  lobLabel: "Workers Comp (No Payroll)",
  shortLabel: "WC (No Payroll)",
  fieldsExtracted: 23,
  policyA: {
    carrier: "Travelers Property Casualty",
    policyNumber: "UB-1L251829-A-24",
    term: "09/24/2024 – 09/24/2025",
    premium: 850,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "Travelers Property Casualty",
    policyNumber: "UB-1L251829-A-25",
    term: "09/24/2025 – 09/24/2026",
    premium: 850,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  groups: [
    {
      title: "Employers Liability Limits",
      fields: [
        { label: "BI by Accident — Each Accident", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "BI by Disease — Each Employee", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "BI by Disease — Policy Limit", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Experience Modification", a: "Not Applicable (No Payroll)", b: "Not Applicable (No Payroll)", status: "match" },
      ],
    },
    {
      title: "Class Codes",
      fields: [
        { label: "State", a: "Illinois", b: "Illinois", status: "match" },
        { label: "Class Code", a: "If-Any (No Payroll)", b: "If-Any (No Payroll)", status: "match" },
        { label: "Class Description", a: "Condominium Assoc. — No Direct Employees", b: "Condominium Assoc. — No Direct Employees", status: "match" },
        { label: "Estimated Payroll", a: "$0", b: "$0", status: "match" },
        { label: "Required Annual Audit", a: "Yes", b: "Yes", status: "match" },
      ],
    },
    {
      title: "Premium",
      fields: [
        { label: "Minimum Premium", a: "$850.00", b: "$850.00", status: "match" },
      ],
    },
  ],
  gaps: [
    { severity: "high", title: "If-Any policy assumes zero W-2 employees", detail: "If the association ever adds direct staff (concierge, maintenance), audit will reclass to payroll-rated and premium will materially increase." },
    { severity: "medium", title: "Volunteer board members not all states covered automatically", detail: "Confirm IL volunteer endorsement is on file for board members performing services." },
  ],
  strengths: [
    { side: "B", title: "EL limits stable at $1M/$1M/$1M" },
    { side: "B", title: "Premium held flat YoY" },
    { side: "A", title: "No prior-year audit balance due" },
  ],
  recommendation: { winner: "B", score: 93, rationale: "Standard 'if-any' WC for an HOA with no employees. Bind and monitor for any payroll exposure introduction." },
};

const wcWithPayroll: LOBComparison = {
  lob: "wc-with-payroll",
  lobLabel: "Workers Comp (With Payroll)",
  shortLabel: "WC (Payroll)",
  fieldsExtracted: 23,
  policyA: {
    carrier: "Travelers Property Casualty",
    policyNumber: "UB-2K879441-B-24",
    term: "09/24/2024 – 09/24/2025",
    premium: 18420,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  policyB: {
    carrier: "Travelers Property Casualty",
    policyNumber: "UB-2K879441-B-25",
    term: "09/24/2025 – 09/24/2026",
    premium: 21075,
    insured: "Brandenberry Park Condominium Assoc.",
    agency: "DCI Insurance",
  },
  groups: [
    {
      title: "Employers Liability Limits",
      fields: [
        { label: "BI by Accident — Each Accident", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "BI by Disease — Each Employee", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "BI by Disease — Policy Limit", a: "$1,000,000", b: "$1,000,000", status: "match" },
        { label: "Experience Modification", a: "0.92", b: "0.88", status: "improved", note: "Improved 4 pts — favorable claims" },
      ],
    },
    {
      title: "Class Codes & Payroll",
      fields: [
        { label: "Class 9015 — Building Operations / Mgmt.", a: "$285,000 payroll", b: "$298,500 payroll", status: "reduced", note: "+4.7% wage growth" },
        { label: "Rate per $100 — Class 9015", a: "$3.85", b: "$3.92", status: "reduced", note: "+1.8%" },
        { label: "Class 9014 — Janitorial", a: "$118,400 payroll", b: "$124,200 payroll", status: "reduced", note: "+4.9%" },
        { label: "Rate per $100 — Class 9014", a: "$5.25", b: "$5.42", status: "reduced", note: "+3.2%" },
        { label: "Class 9102 — Park / Grounds Maint.", a: "$72,500 payroll", b: "$78,000 payroll", status: "reduced", note: "+7.6%" },
        { label: "Rate per $100 — Class 9102", a: "$4.18", b: "$4.30", status: "reduced", note: "+2.9%" },
        { label: "Total Estimated Payroll", a: "$475,900", b: "$500,700", status: "reduced", note: "+5.2%" },
        { label: "Required Annual Audit", a: "Yes", b: "Yes", status: "match" },
      ],
    },
    {
      title: "Premium Build-Up",
      fields: [
        { label: "Manual Premium (pre-mod)", a: "$20,022", b: "$23,949", status: "reduced" },
        { label: "Experience Modifier", a: "× 0.92", b: "× 0.88", status: "improved", note: "Saves $2,873" },
        { label: "Schedule Credit", a: "−5%", b: "−7%", status: "improved" },
        { label: "Standard Premium", a: "$17,499", b: "$19,604", status: "reduced" },
        { label: "Expense Constant + Assessments", a: "$921", b: "$1,471", status: "reduced" },
        { label: "Total Annual Premium", a: "$18,420.00", b: "$21,075.00", status: "reduced", note: "+$2,655 (14.4%)" },
      ],
    },
  ],
  gaps: [
    { severity: "medium", title: "Janitorial class rate up 3.2%", detail: "Confirm whether outsourced janitorial vendor has its own WC certificate to remove payroll from policy." },
    { severity: "low", title: "No safety-credit discount disclosed", detail: "Travelers offers up to 5% safety program credit — verify HOA hasn't been evaluated." },
  ],
  strengths: [
    { side: "B", title: "Experience Mod improved from 0.92 → 0.88" },
    { side: "B", title: "Schedule credit increased from −5% → −7%" },
    { side: "B", title: "EL limits unchanged at $1M/$1M/$1M" },
    { side: "A", title: "Lower total premium (driven by lower payroll exposure)" },
  ],
  recommendation: { winner: "B", score: 86, rationale: "Renewal premium up 14% but driven by wage growth, not rate erosion. Improving Mod and schedule credit reflect strong loss history. Bind once janitorial contractor WC certificate is verified." },
};

export const POLICY_COMPARISON_DATA: Record<string, LOBComparison> = {
  auto, crime, dno, gl, property, umbrella,
  "wc-no-payroll": wcNoPayroll,
  "wc-with-payroll": wcWithPayroll,
};

export const LOB_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: "auto", label: "Commercial Auto", short: "Auto" },
  { value: "crime", label: "Crime / Fidelity", short: "Crime" },
  { value: "dno", label: "Directors & Officers", short: "D&O" },
  { value: "gl", label: "General Liability", short: "GL" },
  { value: "property", label: "Commercial Property", short: "Property" },
  { value: "umbrella", label: "Umbrella / Excess", short: "Umbrella" },
  { value: "wc-no-payroll", label: "Workers Comp (No Payroll)", short: "WC No-Payroll" },
  { value: "wc-with-payroll", label: "Workers Comp (With Payroll)", short: "WC Payroll" },
];
