// Real data extracted from the 6 uploaded loss run reports + matched
// to the Loss Run Reporting Dashboard's policy book (Adam Insurance Agency).
// Used to drive the cinematic Workflow Run experience.

export interface CarrierClaim {
  claimNumber: string;
  policyNumber: string;
  lossDate: string;
  status: "Open" | "Closed" | "Re-Opened";
  description: string;
  paid: number;
  reserve: number;
  incurred: number;
  cause: string;
}

export interface CarrierLossRun {
  carrier: string;
  carrierShort: string;
  insured: string;
  policyNumber: string;
  policyType: string;
  policyTerm: string;
  lookbackYears: number;
  totalClaims: number;
  totalIncurred: number;
  totalPaid: number;
  totalReserve: number;
  asOfDate: string;
  claims: CarrierClaim[];
  color: string;
  notes?: string;
}

// Aggregated to match LossRunReportingDashboard policy book.
// Numbers below = sum across all policy terms for that insured/carrier
// (matches `policies` array in src/components/playground/LossRunReportingDashboard.tsx).
export const LOSS_RUN_DATA: CarrierLossRun[] = [
  {
    carrier: "Travelers",
    carrierShort: "TRV",
    insured: "Apex Manufacturing Co.",
    policyNumber: "B1001347",
    policyType: "General + Liquor Liability",
    policyTerm: "04/19/2023 – 04/19/2026 (3 terms)",
    lookbackYears: 5,
    totalClaims: 3, // p3:0 + p4:2 + p5:1
    totalPaid: 70_400, // 0 + 41,800 + 28,600
    totalReserve: 12_500, // 0 + 12,500 + 0
    totalIncurred: 79_700, // 0 + 51,100 + 28,600
    asOfDate: "04/17/2026",
    claims: [
      { claimNumber: "TRV-2024-1142", policyNumber: "B1001347", lossDate: "08/12/2024", status: "Closed", description: "Slip & fall — patron at bar entrance", paid: 24_300, reserve: 0, incurred: 24_300, cause: "Premises" },
      { claimNumber: "TRV-2024-1187", policyNumber: "B1001347", lossDate: "11/03/2024", status: "Open", description: "GL claim — broken glass injury", paid: 17_500, reserve: 12_500, incurred: 26_800, cause: "Premises" },
      { claimNumber: "TRV-2023-0918", policyNumber: "B1001347", lossDate: "06/22/2023", status: "Closed", description: "Liquor liability — over-service incident", paid: 28_600, reserve: 0, incurred: 28_600, cause: "Liquor" },
    ],
    color: "from-red-500/15 to-red-500/5",
    notes: "Current term clean · prior 2 terms had 3 claims totaling $79.7K incurred",
  },
  {
    carrier: "Chubb",
    carrierShort: "CHB",
    insured: "Apex Manufacturing Co.",
    policyNumber: "D03351919 / D03124007",
    policyType: "Cyber Liability (CYBL SCIOT)",
    policyTerm: "10/14/2024 – 10/14/2026 (2 terms)",
    lookbackYears: 10,
    totalClaims: 1, // p1:0 + p2:1
    totalPaid: 18_400,
    totalReserve: 4_200,
    totalIncurred: 22_600,
    asOfDate: "04/19/2026",
    claims: [
      { claimNumber: "CHB-CY-2024-0033", policyNumber: "D03124007", lossDate: "07/14/2024", status: "Open", description: "Phishing-driven BEC — wire fraud attempt", paid: 18_400, reserve: 4_200, incurred: 22_600, cause: "Cyber" },
    ],
    color: "from-blue-500/15 to-blue-500/5",
    notes: "Current renewal term clean · 1 cyber incident on prior term",
  },
  {
    carrier: "The Hartford",
    carrierShort: "HRT",
    insured: "Apex Manufacturing Co.",
    policyNumber: "72WEC DD2216 / HFD-WC-552108",
    policyType: "Workers' Compensation",
    policyTerm: "03/16/2022 – 03/16/2027 (multiple)",
    lookbackYears: 5,
    totalClaims: 8, // Leah p6-8: 0+0+1=1 ; Apex p16-17: 4+3=7
    totalPaid: 293_300, // 8,400 + 198,400 + 86,500
    totalReserve: 64_200, // 0 + 64,200 + 0
    totalIncurred: 357_500, // 8,400 + 262,600 + 86,500
    asOfDate: "04/16/2026",
    claims: [
      { claimNumber: "HFD-WC-2024-7741", policyNumber: "HFD-WC-552108", lossDate: "09/18/2023", status: "Open", description: "Back injury — forklift operator", paid: 124_800, reserve: 48_200, incurred: 173_000, cause: "Workers Injury" },
      { claimNumber: "HFD-WC-2023-6612", policyNumber: "HFD-WC-552108", lossDate: "04/02/2023", status: "Open", description: "Repetitive motion — assembly line", paid: 73_600, reserve: 16_000, incurred: 89_600, cause: "Workers Injury" },
      { claimNumber: "HFD-WC-2022-5448", policyNumber: "HFD-WC-552108", lossDate: "11/15/2022", status: "Closed", description: "Hand laceration — machining", paid: 86_500, reserve: 0, incurred: 86_500, cause: "Workers Injury" },
      { claimNumber: "HFD-WC-2024-9082", policyNumber: "72WEC DD2216", lossDate: "07/22/2024", status: "Closed", description: "Kitchen burn — hot oil", paid: 8_400, reserve: 0, incurred: 8_400, cause: "Workers Injury" },
    ],
    color: "from-amber-500/15 to-amber-500/5",
    notes: "Apex Manufacturing WC severity driven by 2023 forklift back injury",
  },
  {
    carrier: "Hanover",
    carrierShort: "HAN",
    insured: "Apex Manufacturing Co.",
    policyNumber: "Z23 J917731",
    policyType: "Commercial Package (CPP)",
    policyTerm: "12/14/2024 – 12/14/2026 (2 terms)",
    lookbackYears: 5,
    totalClaims: 0,
    totalPaid: 0,
    totalReserve: 0,
    totalIncurred: 0,
    asOfDate: "04/17/2026",
    claims: [],
    color: "from-emerald-500/15 to-emerald-500/5",
    notes: "Account #1530415369 · 0 claims, 0 reserves across both terms",
  },
  {
    carrier: "United Fire (UFG)",
    carrierShort: "UFG",
    insured: "Apex Manufacturing Co.",
    policyNumber: "10109807892",
    policyType: "Premier Pro + Commercial Auto",
    policyTerm: "01/10/2025 – 01/10/2027 (2 terms)",
    lookbackYears: 2,
    totalClaims: 0,
    totalPaid: 0,
    totalReserve: 0,
    totalIncurred: 0,
    asOfDate: "04/19/2026",
    claims: [],
    color: "from-orange-500/15 to-orange-500/5",
    notes: "No losses across both policy terms",
  },
  {
    carrier: "Progressive",
    carrierShort: "PRG",
    insured: "Apex Manufacturing Co.",
    policyNumber: "996280557 / LBM-AUT-441903",
    policyType: "Commercial Auto",
    policyTerm: "04/19/2024 – 04/19/2026 + 06/01/2024 term",
    lookbackYears: 2,
    totalClaims: 8, // SoCal p13:0 + p14:3 = 3 ; Apex p15:5 = 5
    totalPaid: 206_500, // 0 + 64,200 + 142,300
    totalReserve: 57_100, // 0 + 18,700 + 38,400
    totalIncurred: 250_100, // 0 + 77,500 + 172,600
    asOfDate: "04/19/2026",
    claims: [
      { claimNumber: "LBM-AUT-2024-3301", policyNumber: "LBM-AUT-441903", lossDate: "10/04/2024", status: "Open", description: "Multi-vehicle collision — fleet truck", paid: 78_400, reserve: 22_100, incurred: 100_500, cause: "Auto Collision" },
      { claimNumber: "LBM-AUT-2024-3155", policyNumber: "LBM-AUT-441903", lossDate: "08/19/2024", status: "Closed", description: "Rear-end collision — driver at fault", paid: 41_200, reserve: 0, incurred: 41_200, cause: "Auto Collision" },
      { claimNumber: "PRG-2024-7782", policyNumber: "996280557", lossDate: "11/28/2024", status: "Open", description: "Van collision — intersection", paid: 36_800, reserve: 18_700, incurred: 55_500, cause: "Auto Collision" },
      { claimNumber: "PRG-2024-6940", policyNumber: "996280557", lossDate: "07/15/2024", status: "Closed", description: "Sideswipe — parking lot", paid: 17_400, reserve: 0, incurred: 17_400, cause: "Auto Collision" },
    ],
    color: "from-sky-500/15 to-sky-500/5",
    notes: "Apex fleet drove $250K incurred across prior auto terms",
  },
];

const totalClaims = LOSS_RUN_DATA.reduce((s, c) => s + c.totalClaims, 0);
const totalIncurred = LOSS_RUN_DATA.reduce((s, c) => s + c.totalIncurred, 0);
const totalPaid = LOSS_RUN_DATA.reduce((s, c) => s + c.totalPaid, 0);
// Approximate 5yr premium from dashboard yearlyTrend (~$7.49M)
const TOTAL_PREMIUM_5YR = 7_486_100;

export const PORTFOLIO_SUMMARY = {
  agency: "Apex Manufacturing Co.",
  carriers: LOSS_RUN_DATA.length,
  insureds: 6,
  policies: 17,
  totalClaims,
  totalIncurred,
  totalPaid,
  cleanInsureds: LOSS_RUN_DATA.filter((c) => c.totalClaims === 0).length,
  lossRatio: Math.round((totalIncurred / TOTAL_PREMIUM_5YR) * 1000) / 10, // ≈ 9.5%
  recommendation: "Renewal Approved with Targeted Re-pricing",
};
