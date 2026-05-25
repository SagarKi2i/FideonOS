// Field-level LOB taxonomy derived from the uploaded LOB workbook.
// Each LOB is split into named field groups so the UI can render
// elaborate, scannable sections with match/diff status for every field.

export type MatchStatus =
  | "match"
  | "improved"
  | "reduced"
  | "added"
  | "removed"
  | "mismatch";

export interface LobField {
  label: string;
  expiring: string;
  proposed: string;
  status: MatchStatus;
  delta?: string;
  source: "document" | "workbook";
  note?: string;
}

export interface LobFieldGroup {
  title: string;
  description?: string;
  fields: LobField[];
}

export interface LobSection {
  id: string;
  title: string;
  fieldCount: number;
  grounding: "Document-grounded" | "Workbook-driven mock";
  summary: string;
  groups: LobFieldGroup[];
}

// helpers to keep declarations terse
const m = (label: string, expiring: string, proposed: string, status: MatchStatus = "match",
  source: "document" | "workbook" = "workbook", delta?: string, note?: string): LobField =>
  ({ label, expiring, proposed, status, source, delta, note });

export const lobSections: LobSection[] = [
  {
    id: "commercial-auto",
    title: "Commercial Auto",
    fieldCount: 35,
    grounding: "Document-grounded",
    summary: "Full 35-field Commercial Auto extraction including symbols, limits, vehicles, and forms list.",
    groups: [
      {
        title: "Client information",
        fields: [
          m("Named insured(s)", "Brandenberry Park Condominium Association", "Brandenberry Park Condominium Association", "match", "document"),
          m("Mailing address", "1234 Brandenberry Ct, Naperville, IL", "1234 Brandenberry Ct, Naperville, IL", "match", "document"),
        ],
      },
      {
        title: "Agency information",
        fields: [
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Agency address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
        ],
      },
      {
        title: "Policy information",
        fields: [
          m("Policy number", "BA-1L251829-25-42-G", "BA-1L251829-1", "mismatch", "document", undefined, "New term issued under proposal sequence"),
          m("Coverage period start", "09/24/2025", "09/24/2025", "match", "document"),
          m("Coverage period end", "09/24/2026", "09/24/2026", "match", "document"),
          m("Policy premium", "$2,517", "$2,517", "match", "document"),
          m("Carrier", "Travelers Casualty Insurance Co. of America", "Travelers Casualty Insurance Co. of America", "match", "document"),
          m("Full location schedules", "1 location scheduled", "1 location scheduled", "match", "document"),
        ],
      },
      {
        title: "Auto coverage — symbols",
        description: "Coverage symbols define which autos are covered for each peril.",
        fields: [
          m("Owned auto liability symbol", "Symbol 1 — Any Auto", "Symbol 1 — Any Auto"),
          m("Collision coverage symbol", "Symbol 7 — Specifically Described", "Symbol 7 — Specifically Described"),
          m("Comprehensive coverage symbol", "Symbol 7 — Specifically Described", "Symbol 7 — Specifically Described"),
          m("Underinsured motorist symbol", "Symbol 2 — Owned Autos Only", "Symbol 2 — Owned Autos Only"),
          m("Uninsured motorist symbol", "Symbol 2 — Owned Autos Only", "Symbol 2 — Owned Autos Only"),
          m("Non-owned auto symbol", "Symbol 9 — Non-Owned Autos", "Symbol 9 — Non-Owned Autos"),
          m("Hired car symbol", "Symbol 8 — Hired Autos", "Symbol 8 — Hired Autos"),
          m("Medical payments symbol", "Symbol 7 — Specifically Described", "Symbol 7 — Specifically Described"),
        ],
      },
      {
        title: "Auto coverage — limits",
        fields: [
          m("Liability", "$1,000,000 CSL", "$1,000,000 CSL", "match", "document"),
          m("Underinsured motorist", "$1,000,000", "$1,000,000", "match", "document"),
          m("Uninsured motorist", "$1,000,000", "$1,000,000", "match", "document"),
          m("Non-owned auto", "Included", "Included", "match", "document"),
          m("Hired car", "Included", "Included", "match", "document"),
          m("Medical payments", "$5,000", "$5,000", "match", "document"),
        ],
      },
      {
        title: "Vehicles",
        description: "Per-vehicle schedule and coverage detail.",
        fields: [
          m("Number of vehicles", "1", "1", "match", "document"),
          m("Vehicle 1 — year", "2019", "2019", "match", "document"),
          m("Vehicle 1 — make", "Ford", "Ford", "match", "document"),
          m("Vehicle 1 — model", "F-150", "F-150", "match", "document"),
          m("Vehicle 1 — VIN", "1FTFW1E50KFA12345", "1FTFW1E50KFA12345", "match", "document"),
          m("Vehicle 1 — coverage type", "Liability + Phys Dmg", "Liability + Phys Dmg", "match", "document"),
          m("Vehicle 1 — limit", "$1,000,000 CSL", "$1,000,000 CSL", "match", "document"),
          m("Vehicle 1 — comp/coll deductible", "$1,000 / $1,000", "$1,000 / $1,000", "match", "document"),
          m("Vehicle 1 — premium", "$2,517", "$2,517", "match", "document"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("Form CA 00 01", "Business Auto Coverage Form (10/13)", "Business Auto Coverage Form (10/13)"),
          m("Form CA 02 70", "Cancellation — IL Changes (11/13)", "Cancellation — IL Changes (11/13)"),
          m("Form CA 21 17", "Fellow Employee Coverage (10/13)", "Fellow Employee Coverage (10/13)", "added", "workbook", undefined, "Added at proposal stage"),
        ],
      },
    ],
  },
  {
    id: "crime",
    title: "Crime",
    fieldCount: 59,
    grounding: "Document-grounded",
    summary: "All 59 crime/fidelity coverage parts mapped from Travelers Wrap+ and CNA crime declarations.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Bridgewater of Naperville Condo Assn.", "Camberley Club Townhome Owners Assoc., LLC", "mismatch", "document"),
          m("Additional named insured(s)", "Brandenberry Park Condominium", "—", "removed", "document"),
          m("Mailing address", "Bridgewater HQ, Naperville, IL", "Camberley HQ, Aurora, IL", "mismatch", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Agency address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "105898411", "Q-650024-CRI-25", "mismatch", "document"),
          m("Coverage period start", "03/27/2024", "10/04/2025", "mismatch", "document"),
          m("Coverage period end", "03/27/2027", "10/04/2026", "mismatch", "document"),
          m("Policy premium", "$3,837", "$522", "improved", "document", "-$3,315"),
          m("Annual installment premium", "$1,279/yr (3-yr term)", "$522 (annual)", "mismatch", "document"),
          m("Carrier", "Travelers Casualty & Surety Co. of America", "Continental Casualty Company (CNA)", "mismatch", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
        ],
      },
      {
        title: "Employee dishonesty / theft",
        fields: [
          m("Employee dishonesty — limit", "$1,000,000", "$625,000", "reduced", "document", "-$375,000"),
          m("Employee dishonesty — deductible", "$5,000", "$2,500", "improved", "document", "-$2,500"),
          m("Excess employee dishonesty — limit", "$0", "$0", "match", "workbook"),
          m("Excess employee dishonesty — deductible", "—", "—"),
          m("Total combined employee dishonesty — limit", "$1,000,000", "$625,000", "reduced", "document", "-$375,000"),
          m("Total combined employee dishonesty — deductible", "$5,000", "$2,500", "improved", "document"),
          m("ERISA fidelity — limit", "$1,000,000", "$625,000", "reduced", "document"),
          m("ERISA fidelity — deductible", "$0 (per ERISA)", "$0 (per ERISA)", "match", "document"),
          m("Employee theft of client property — limit", "$100,000", "$100,000", "match", "workbook"),
          m("Employee theft of client property — deductible", "$2,500", "$2,500", "match", "workbook"),
        ],
      },
      {
        title: "Forgery & alteration",
        fields: [
          m("Forgery or alteration — limit", "$1,000,000", "$625,000", "reduced", "document", "-$375,000"),
          m("Forgery or alteration — deductible", "$2,500", "$2,500", "match", "document"),
          m("Personal accounts forgery or alteration — limit", "$100,000", "$100,000", "match", "workbook"),
          m("Personal accounts forgery or alteration — deductible", "$1,000", "$1,000", "match", "workbook"),
        ],
      },
      {
        title: "Money & securities",
        fields: [
          m("On-premise — limit", "$50,000", "$50,000", "match", "workbook"),
          m("On-premise — deductible", "$1,000", "$1,000", "match", "workbook"),
          m("In-transit — limit", "$50,000", "$50,000", "match", "workbook"),
          m("In-transit — deductible", "$1,000", "$1,000", "match", "workbook"),
          m("Money orders & counterfeit money — limit", "$25,000", "$25,000", "match", "workbook"),
          m("Money orders & counterfeit money — deductible", "$1,000", "$1,000", "match", "workbook"),
        ],
      },
      {
        title: "Computer & funds transfer fraud",
        fields: [
          m("Computer fraud — limit", "$1,000,000", "$625,000", "reduced", "document", "-$375,000"),
          m("Computer fraud — deductible", "$2,500", "$2,500", "match", "document"),
          m("Excess computer fraud — limit", "$0", "$0", "match", "workbook"),
          m("Total combined computer fraud — limit", "$1,000,000", "$625,000", "reduced", "document"),
          m("Computer program & data restoration — limit", "$50,000", "$50,000", "match", "workbook"),
          m("Computer program & data restoration — deductible", "$1,000", "$1,000", "match", "workbook"),
          m("Funds transfer fraud — limit", "$1,000,000", "$625,000", "reduced", "document", "-$375,000"),
          m("Funds transfer fraud — deductible", "$2,500", "$2,500", "match", "document"),
          m("Excess funds transfer fraud — limit", "$0", "$0", "match", "workbook"),
          m("Total combined funds transfer fraud — limit", "$1,000,000", "$625,000", "reduced", "document"),
        ],
      },
      {
        title: "Identity & social engineering",
        fields: [
          m("Identity fraud expense reimbursement — limit", "$25,000", "$25,000", "match", "workbook"),
          m("Identity fraud expense reimbursement — deductible", "$0", "$0", "match", "workbook"),
          m("Social engineering fraud — limit", "Not scheduled", "$100,000", "added", "document", "+$100,000"),
          m("Social engineering fraud — deductible", "—", "$2,500", "added", "document"),
          m("Designated property manager — limit", "Not scheduled", "$100,000", "added", "workbook"),
          m("Designated property manager — deductible", "—", "$2,500", "added", "workbook"),
          m("Board member coverage — limit", "Included", "Included", "match", "workbook"),
          m("Board member coverage — deductible", "$0", "$0", "match", "workbook"),
        ],
      },
      {
        title: "Claim expense",
        fields: [
          m("Claim expense — limit", "$5,000", "$5,000", "match", "document"),
          m("Claim expense — deductible", "$0", "$0", "match", "document"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("CRI-7000 (10/19) — Crime Coverage Form", "Attached", "Attached"),
          m("CRI-9001 (07/22) — Social Engineering Endorsement", "Not attached", "Attached", "added", "document"),
          m("IL P 001 (01/04) — Common Policy Conditions", "Attached", "Attached"),
        ],
      },
    ],
  },
  {
    id: "do",
    title: "Directors & Officers",
    fieldCount: 71,
    grounding: "Workbook-driven mock",
    summary: "29-field D&O package plus the combined Crime + D&O wrap fields (71 total per workbook).",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Camberley Club Townhome Owners Assoc.", "Camberley Club Townhome Owners Assoc.", "match", "document"),
          m("Additional named insured(s)", "Board of Directors", "Board of Directors + Property Manager", "improved", "document"),
          m("Mailing address", "Camberley HQ, Aurora, IL", "Camberley HQ, Aurora, IL", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Broker address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "8259-4471", "8259-4471-R", "mismatch", "document"),
          m("Coverage period", "10/04/2024 – 10/04/2025", "10/04/2025 – 10/04/2026", "mismatch", "document"),
          m("Policy premium", "$1,320", "$1,420", "reduced", "document", "+$100"),
          m("Carrier", "Federal Insurance Company (Chubb)", "Continental Casualty Company (CNA)", "mismatch", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
        ],
      },
      {
        title: "Limits, retention & dates",
        fields: [
          m("D&O limit", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Annual aggregate", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Retention (deductible)", "$2,500", "$1,000", "improved", "document", "-$1,500"),
          m("Full prior acts", "No", "Yes", "added", "document"),
          m("Retroactive date", "10/04/2010", "10/04/2010", "match", "document"),
          m("Prior / pending litigation date", "10/04/2018", "10/04/2016", "improved", "workbook"),
        ],
      },
      {
        title: "Coverage extensions",
        fields: [
          m("Management company coverage", "Limited", "Included", "improved", "workbook"),
          m("Libel and slander", "Restricted wording", "Included", "improved", "workbook"),
          m("Third-party discrimination", "Restricted wording", "Included", "improved", "workbook"),
          m("Defense of non-monetary claims", "Excluded", "Included", "added", "document"),
          m("Defense of breach of contract claims", "Excluded", "Included sublimit $250,000", "added", "document"),
          m("Defense of placement / adequacy of insurance", "Excluded", "Included", "added", "workbook"),
          m("Defense of dishonesty / fraud (unless proven)", "Conditional", "Included until adjudication", "improved", "workbook"),
          m("Duty to defend", "No (indemnity only)", "Yes", "improved", "document"),
          m("Additional liability extension", "Not offered", "Side A DIC sublimit $250,000", "added", "workbook"),
          m("Defense costs in addition to liability limit", "Inside limits", "Outside limits", "improved", "document"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("PMA-DO-2024 (08/24) — D&O Form", "Attached", "Attached"),
          m("PMA-DO-3110 (01/25) — Side A DIC", "Not attached", "Attached", "added", "document"),
          m("PMA-IL-001 — IL Amendatory", "Attached", "Attached"),
        ],
      },
    ],
  },
  {
    id: "cyber",
    title: "Cyber Liability",
    fieldCount: 31,
    grounding: "Document-grounded",
    summary: "Full 31-field cyber liability extraction covering privacy, security, business income, and extortion.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Camberley Club Townhome Owners Assoc.", "Camberley Club Townhome Owners Assoc.", "match", "document"),
          m("Additional named insured(s)", "—", "Property Manager LLC", "added", "document"),
          m("Mailing address", "Camberley HQ, Aurora, IL", "Camberley HQ, Aurora, IL", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Broker address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "CYB-2024-77321", "CYB-2025-77321", "mismatch", "document"),
          m("Coverage period", "10/04/2024 – 10/04/2025", "10/04/2025 – 10/04/2026", "mismatch", "document"),
          m("Policy premium", "$1,250", "$1,180", "improved", "document", "-$70"),
          m("Carrier", "Beazley Group", "Beazley Group", "match", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
        ],
      },
      {
        title: "Limits & sublimits",
        fields: [
          m("Aggregate limit", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Privacy liability", "$500,000", "$1,000,000", "improved", "document"),
          m("Privacy regulatory claims coverage", "$250,000", "$500,000", "improved", "document"),
          m("Multimedia / media liability", "$250,000", "$500,000", "improved", "document"),
          m("Security liability", "$500,000", "$1,000,000", "improved", "document"),
          m("Security breach response", "$250,000", "$500,000", "improved", "document"),
          m("Business income", "$100,000 / 8-hr waiting", "$250,000 / 8-hr waiting", "improved", "document"),
          m("Digital asset restoration", "$100,000", "$250,000", "improved", "document"),
          m("Cyber extortion limit", "$100,000", "$250,000", "improved", "document"),
          m("PCI DSS assessment", "Not included", "$100,000", "added", "document"),
          m("Electronic fraud — telephone hacking", "$50,000", "$100,000", "improved", "document"),
          m("Electronic fraud — funds transfer fraud", "$50,000", "$100,000", "improved", "document"),
          m("Retention (deductible)", "$5,000", "$2,500", "improved", "document", "-$2,500"),
          m("Cyber liability retroactive date", "10/04/2018", "10/04/2016", "improved", "workbook"),
        ],
      },
      {
        title: "Additional interests",
        fields: [
          m("Additional interest 1 — name", "Camberley HOA Lender", "Camberley HOA Lender", "match", "workbook"),
          m("Additional interest 1 — type", "Loss payee", "Loss payee", "match", "workbook"),
          m("Additional interest 1 — address", "1 N Wacker, Chicago, IL", "1 N Wacker, Chicago, IL", "match", "workbook"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("BZ-CYB-2024 (06/24)", "Attached", "Attached"),
          m("BZ-CYB-2025-PCI (01/25)", "Not attached", "Attached", "added", "document"),
          m("BZ-IL-001 — IL Amendatory", "Attached", "Attached"),
        ],
      },
    ],
  },
  {
    id: "gl",
    title: "General Liability",
    fieldCount: 36,
    grounding: "Document-grounded",
    summary: "All 36 GL fields including limits, deductibles, and the schedule of exposure / class codes.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Brandenberry Park Condo Assn.", "Brandenberry Park Condo Assn.", "match", "document"),
          m("Additional named insured(s)", "Property Manager LLC", "Property Manager LLC + Board", "added", "document"),
          m("Mailing address", "1234 Brandenberry Ct, Naperville, IL", "1234 Brandenberry Ct, Naperville, IL", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Broker address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "GL-1L251829-25", "GL-1L251829-26", "mismatch", "document"),
          m("Coverage period", "09/24/2024 – 09/24/2025", "09/24/2025 – 09/24/2026", "mismatch", "document"),
          m("Policy premium", "$8,420", "$9,180", "reduced", "document", "+$760"),
          m("Carrier", "Travelers Indemnity Company", "Travelers Indemnity Company", "match", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
        ],
      },
      {
        title: "Liability limits",
        fields: [
          m("Aggregate", "$2,000,000", "$4,000,000", "improved", "document", "+$2,000,000"),
          m("Occurrence", "$1,000,000", "$2,000,000", "improved", "document", "+$1,000,000"),
          m("Products & completed operations aggregate", "$1,000,000", "$2,000,000", "improved", "document", "+$1,000,000"),
          m("Personal / advertising injury", "$1,000,000", "$2,000,000", "improved", "document", "+$1,000,000"),
          m("Damage to premises rented to you", "$100,000", "$300,000", "improved", "document", "+$200,000"),
          m("Premises medical", "$5,000", "$10,000", "improved", "document"),
          m("Deductible", "$0", "$0", "match", "document"),
        ],
      },
      {
        title: "Coverage extensions",
        fields: [
          m("Employee benefits liability", "Not included", "$1,000,000", "added", "document", "+$1,000,000"),
          m("Contractual liability", "Included", "Included", "match", "document"),
          m("Broad form property damage", "Included", "Included", "match", "document"),
          m("Host liquor liability", "Excluded", "Included", "added", "document"),
          m("Employees as additional insured", "Yes", "Yes", "match", "document"),
          m("Hired car & non-owned", "Included", "Included", "match", "document"),
        ],
      },
      {
        title: "Schedule of exposure / class codes",
        fields: [
          m("Class — building or premises (49950)", "Rate $0.482 / $1,000 area", "Rate $0.451 / $1,000 area", "improved", "workbook"),
          m("Premises no. / location no.", "001 / 001", "001 / 001", "match", "workbook"),
          m("Classification", "Condominiums – residential", "Condominiums – residential", "match", "workbook"),
          m("Classification code", "62003", "62003", "match", "workbook"),
          m("Premium basis", "Area", "Area", "match", "workbook"),
          m("Exposure", "182,400 sq ft", "182,400 sq ft", "match", "workbook"),
          m("Rate — premises ops", "0.482", "0.451", "improved", "workbook"),
          m("Rate — products / completed ops", "0.061", "0.058", "improved", "workbook"),
          m("Advanced premium — premises ops", "$8,792", "$8,224", "improved", "workbook"),
          m("Advanced premium — products / completed ops", "$1,114", "$1,058", "improved", "workbook"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("CG 00 01 (04/13) — CGL Form", "Attached", "Attached"),
          m("CG 21 47 (12/07) — Employment Practices Excl.", "Attached", "Attached"),
          m("CG 25 04 (05/09) — Designated Location Aggregate", "Not attached", "Attached", "added", "document"),
        ],
      },
    ],
  },
  {
    id: "property",
    title: "Property",
    fieldCount: 66,
    grounding: "Document-grounded",
    summary: "Comprehensive 66-field Property extraction including ordinance/law A/B/C, water, sewer, equipment breakdown.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Brandenberry Park Condo Assn.", "Brandenberry Park Condo Assn.", "match", "document"),
          m("Additional named insured(s)", "Property Manager LLC", "Property Manager LLC", "match", "document"),
          m("Mailing address", "1234 Brandenberry Ct, Naperville, IL", "1234 Brandenberry Ct, Naperville, IL", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Broker address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "PRO-1L251829-25", "PRO-1L251829-26", "mismatch", "document"),
          m("Coverage period", "09/24/2024 – 09/24/2025", "09/24/2025 – 09/24/2026", "mismatch", "document"),
          m("Policy premium", "$24,610", "$26,840", "reduced", "document", "+$2,230"),
          m("Carrier", "Travelers Property Casualty Co.", "Travelers Property Casualty Co.", "match", "document"),
          m("Full location schedules", "1 location, 6 buildings", "1 location, 6 buildings", "match", "document"),
        ],
      },
      {
        title: "Property values & deductibles",
        fields: [
          m("Rated building value", "$18,250,000", "$19,800,000", "improved", "workbook", "+$1,550,000"),
          m("Business personal property / contents", "$250,000", "$500,000", "improved", "workbook", "+$250,000"),
          m("Association fee / BI & extra expense", "$150,000", "$250,000", "improved", "workbook", "+$100,000"),
          m("Property deductible (per claim)", "$10,000", "$10,000", "match", "workbook"),
          m("Business personal property deductible", "$2,500", "$2,500", "match", "workbook"),
          m("BI / extra expense deductible", "$2,500", "$2,500", "match", "workbook"),
        ],
      },
      {
        title: "Equipment breakdown (boiler & machinery)",
        fields: [
          m("Equipment breakdown — limit", "$10,000,000", "$15,000,000", "improved", "workbook"),
          m("Equipment breakdown — deductible", "$2,500", "$2,500", "match", "workbook"),
        ],
      },
      {
        title: "Property options & exclusions",
        fields: [
          m("Coinsurance clause", "80%", "90%", "improved", "workbook"),
          m("Mortgagee or loss payee", "Camberley HOA Lender", "Camberley HOA Lender", "match", "workbook"),
          m("Outdoor signs", "$10,000", "$15,000", "improved", "workbook"),
          m("Total insured value", "$18,650,000", "$20,550,000", "improved", "workbook"),
          m("Roof coverage valuation", "ACV after 15 years", "RCV", "improved", "workbook"),
          m("Cosmetic damage exclusion", "Yes (wind/hail)", "No", "improved", "workbook"),
          m("Ice damming deductible", "$5,000", "$5,000", "match", "workbook"),
          m("Water deductible", "$50,000", "$25,000", "improved", "workbook", "-$25,000"),
          m("Glass deductible buyback", "Not purchased", "Purchased — $1,000", "added", "workbook"),
          m("Inflation guard", "2%", "4%", "improved", "workbook"),
          m("Wind / hail deductible", "5% of TIV", "2% of TIV", "improved", "workbook"),
          m("AOP deductible", "$10,000", "$10,000", "match", "workbook"),
          m("Cause of loss", "Special Form", "Special Form", "match", "workbook"),
          m("Specified property", "Listed buildings 1–6", "Listed buildings 1–6", "match", "workbook"),
          m("Certified acts of terrorism", "Included", "Included", "match", "workbook"),
          m("Property extension endorsement", "Standard", "Enhanced", "improved", "workbook"),
          m("Protective safeguard coverage limitation", "Sprinklers required", "Sprinklers required", "match", "workbook"),
          m("Mine subsidence", "Excluded", "Included", "added", "workbook"),
        ],
      },
      {
        title: "Outdoor property schedule",
        fields: [
          m("Outdoor — fence", "Limit $25,000 / Ded $1,000", "Limit $50,000 / Ded $1,000", "improved", "workbook"),
          m("Outdoor — pool equipment", "Limit $50,000 / Ded $2,500", "Limit $75,000 / Ded $2,500", "improved", "workbook"),
        ],
      },
      {
        title: "Ordinance or law",
        fields: [
          m("Ordinance or law A — undamaged portion (limit)", "Included in building", "Included in building", "match", "workbook"),
          m("Ordinance or law A — deductible", "$0", "$0", "match", "workbook"),
          m("Ordinance or law B — demolition (limit)", "$250,000", "$500,000", "improved", "workbook"),
          m("Ordinance or law B — deductible", "$10,000", "$10,000", "match", "workbook"),
          m("Ordinance or law C — increased cost (limit)", "$250,000", "$500,000", "improved", "workbook"),
          m("Ordinance or law C — deductible", "$10,000", "$10,000", "match", "workbook"),
          m("Ordinance or law combined B+C — limit", "$500,000", "$1,000,000", "improved", "workbook", "+$500,000"),
          m("Ordinance or law combined B+C — deductible", "$10,000", "$10,000", "match", "workbook"),
          m("Ordinance or law B+C per building / max — limit", "$250,000 per bldg", "$500,000 per bldg", "improved", "workbook"),
          m("Ordinance or law B+C per building / max — deductible", "$10,000", "$10,000", "match", "workbook"),
        ],
      },
      {
        title: "Other coverage info",
        fields: [
          m("Debris removal — limit", "25% of loss + $25,000", "25% of loss + $50,000", "improved", "workbook"),
          m("Debris removal — deductible", "Per loss ded", "Per loss ded", "match", "workbook"),
          m("Sewer or drain back-up — limit", "$25,000", "$100,000", "improved", "workbook", "+$75,000"),
          m("Sewer or drain back-up — deductible", "$10,000", "$5,000", "improved", "workbook"),
          m("Limited fungi, rot & bacteria — aggregate", "$15,000", "$50,000", "improved", "workbook"),
          m("Pollutant cleanup & removal — limit", "$10,000", "$25,000", "improved", "workbook"),
          m("Pollutant cleanup & removal — deductible", "$2,500", "$2,500", "match", "workbook"),
          m("Trees, shrubs, plants — limit", "$1,000 / item, $25,000 max", "$1,500 / item, $50,000 max", "improved", "workbook"),
          m("Trees, shrubs, plants — deductible", "$500", "$500", "match", "workbook"),
        ],
      },
      {
        title: "Building-level coverage (location 001)",
        fields: [
          m("Building 1 — coverage type", "Building", "Building", "match", "workbook"),
          m("Building 1 — coverage option", "RCV / Special Form", "RCV / Special Form", "match", "workbook"),
          m("Building 1 — valuation", "Replacement Cost", "Replacement Cost", "match", "workbook"),
          m("Building 1 — limit of insurance", "$3,200,000", "$3,500,000", "improved", "workbook"),
          m("Building 1 — deductible", "$10,000", "$10,000", "match", "workbook"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("CP 00 10 (10/12) — Building & Personal Property", "Attached", "Attached"),
          m("CP 10 30 (09/17) — Causes of Loss Special Form", "Attached", "Attached"),
          m("CP 04 05 (10/12) — Ordinance or Law", "Attached", "Attached"),
          m("CP 04 17 (10/12) — Utility Services Direct Damage", "Not attached", "Attached", "added", "document"),
        ],
      },
    ],
  },
  {
    id: "umbrella",
    title: "Umbrella / Excess",
    fieldCount: 27,
    grounding: "Workbook-driven mock",
    summary: "All 27 umbrella fields including underlying policy stack and crisis management endorsement.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Brandenberry Park Condo Assn.", "Brandenberry Park Condo Assn.", "match", "document"),
          m("Additional named insured(s)", "Property Manager LLC", "Property Manager LLC", "match", "document"),
          m("Mailing address", "1234 Brandenberry Ct, Naperville, IL", "1234 Brandenberry Ct, Naperville, IL", "match", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Agency / producer mailing address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "UMB-2024-44518", "UMB-2025-44518", "mismatch", "document"),
          m("Coverage period", "09/24/2024 – 09/24/2025", "09/24/2025 – 09/24/2026", "mismatch", "document"),
          m("Policy premium", "$3,820", "$4,260", "reduced", "document", "+$440"),
          m("Total cost", "$3,950", "$4,420", "reduced", "document"),
          m("Carrier", "Travelers Excess & Surplus", "Travelers Excess & Surplus", "match", "document"),
        ],
      },
      {
        title: "Umbrella coverage information",
        fields: [
          m("Aggregate limit", "$5,000,000", "$10,000,000", "improved", "workbook", "+$5,000,000"),
          m("Occurrence limit", "$5,000,000", "$10,000,000", "improved", "workbook", "+$5,000,000"),
          m("Products / completed operations aggregate", "$5,000,000", "$10,000,000", "improved", "workbook", "+$5,000,000"),
          m("Retroactive date", "09/24/2010", "09/24/2010", "match", "workbook"),
          m("Retained limit / deductible", "$10,000", "$0 over scheduled underlying", "improved", "workbook"),
          m("Crisis management endorsement", "Not included", "$250,000 sublimit", "added", "workbook"),
        ],
      },
      {
        title: "Underlying policies",
        fields: [
          m("Underlying GL — limit", "$1M / $2M", "$2M / $4M", "improved", "workbook"),
          m("Underlying GL — carrier", "Travelers", "Travelers", "match", "workbook"),
          m("Underlying GL — policy #", "GL-1L251829-25", "GL-1L251829-26", "mismatch", "workbook"),
          m("Underlying auto — limit", "$1M CSL", "$1M CSL", "match", "workbook"),
          m("Underlying auto — carrier", "Travelers", "Travelers", "match", "workbook"),
          m("Underlying auto — policy #", "BA-1L251829-25", "BA-1L251829-1", "mismatch", "workbook"),
          m("Underlying employers liability", "Not scheduled", "$1M / $1M / $1M", "added", "workbook"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("CU 00 01 (10/13) — Commercial Umbrella Form", "Attached", "Attached"),
          m("CU 21 70 (12/04) — Crisis Management Endt.", "Not attached", "Attached", "added", "document"),
          m("IL P 001 (01/04) — Common Policy Conditions", "Attached", "Attached"),
        ],
      },
    ],
  },
  {
    id: "wc",
    title: "Workers Compensation",
    fieldCount: 23,
    grounding: "Document-grounded",
    summary: "Full 23-field WC extraction with employers liability limits, class codes, payroll, and audit info.",
    groups: [
      {
        title: "Client & policy",
        fields: [
          m("Named insured(s)", "Brandenberry Park Condo Assn.", "Brandenberry Park Condo Assn.", "match", "document"),
          m("Additional named insured(s)", "Property Manager LLC", "Property Manager LLC", "match", "document"),
          m("Mailing address", "1234 Brandenberry Ct, Naperville, IL", "1234 Brandenberry Ct, Naperville, IL", "match", "document"),
          m("Agency", "AssuredPartners — Midwest", "AssuredPartners — Midwest", "match", "document"),
          m("Agency / producer mailing address", "200 E Randolph St, Chicago, IL", "200 E Randolph St, Chicago, IL", "match", "document"),
          m("Policy number", "WC-2024-77129", "WC-2025-77129", "mismatch", "document"),
          m("Coverage period", "09/24/2024 – 09/24/2025", "09/24/2025 – 09/24/2026", "mismatch", "document"),
          m("Policy premium", "$6,120", "$5,860", "improved", "document", "-$260"),
          m("Carrier", "Travelers Casualty & Surety", "Travelers Casualty & Surety", "match", "document"),
          m("Full location schedules", "1 location", "1 location", "match", "document"),
        ],
      },
      {
        title: "Employers liability",
        fields: [
          m("Bodily injury by accident — each accident", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Bodily injury by disease — each employee", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Bodily injury by disease — policy limit", "$500,000", "$1,000,000", "improved", "document", "+$500,000"),
          m("Experience modification", "0.94", "0.91", "improved", "workbook"),
        ],
      },
      {
        title: "Class codes & payroll",
        fields: [
          m("Class 8810 — clerical (rate)", "0.18", "0.17", "improved", "workbook"),
          m("Class 8810 — payroll", "$185,000", "$210,000", "improved", "workbook"),
          m("Class 9015 — building ops (rate)", "3.42", "3.18", "improved", "workbook"),
          m("Class 9015 — payroll", "$92,000", "$96,500", "improved", "workbook"),
          m("Class description", "Condo association ops", "Condo association ops", "match", "workbook"),
        ],
      },
      {
        title: "Other",
        fields: [
          m("Required annual audit", "Yes", "Yes", "match", "document"),
        ],
      },
      {
        title: "Forms & endorsements",
        fields: [
          m("WC 00 00 00 C — WC & EL Policy", "Attached", "Attached"),
          m("WC 12 06 01 — IL Cancellation Endt.", "Attached", "Attached"),
          m("WC 99 03 76 — Premium Discount Endt.", "Not attached", "Attached", "added", "document"),
        ],
      },
    ],
  },
];
