// Carrier catalog. ~100 named carriers across the major lines of business,
// representative of the broader 500-carrier footprint Fideon supports.
//
// `status` reflects what Fideon has shipped:
//   - "live"        — full bidirectional integration (API/SFTP/portal scraper)
//   - "beta"        — read-only integration in pilot with select tenants
//   - "available"   — supported on request; Fideon ops will provision
//   - "roadmap"     — on the build list, not yet wired

export type CarrierStatus = "live" | "beta" | "available" | "roadmap";
export type CarrierLine = "commercial" | "personal" | "specialty" | "life-health" | "reinsurance";
export type ConnectionMethod = "api" | "portal" | "sftp" | "email";

export interface Carrier {
  id: string;
  name: string;
  /** Optional shorter display name. */
  shortName?: string;
  lines: CarrierLine[];
  status: CarrierStatus;
  /** How Fideon pulls/pushes data with this carrier. */
  method: ConnectionMethod;
  /** Optional category tag (e.g. "national broad-line", "MGA", "Lloyd's"). */
  segment?: string;
}

export const CARRIERS: Carrier[] = [
  // ─── National broad-line (commercial + personal) ───
  { id: "travelers",        name: "Travelers",                   lines: ["commercial","personal"], status: "live",      method: "api",    segment: "National broad-line" },
  { id: "hartford",         name: "The Hartford",                lines: ["commercial"],            status: "live",      method: "api",    segment: "National broad-line" },
  { id: "chubb",            name: "Chubb",                       lines: ["commercial","personal","specialty"], status: "live", method: "api", segment: "National broad-line" },
  { id: "liberty",          name: "Liberty Mutual",              lines: ["commercial","personal"], status: "live",      method: "api",    segment: "National broad-line" },
  { id: "zurich",           name: "Zurich North America",        lines: ["commercial"],            status: "live",      method: "api",    segment: "National broad-line" },
  { id: "nationwide",       name: "Nationwide",                  lines: ["commercial","personal"], status: "live",      method: "portal", segment: "National broad-line" },
  { id: "aig",              name: "AIG",                         lines: ["commercial","specialty"], status: "live",     method: "api",    segment: "National broad-line" },
  { id: "cna",              name: "CNA",                         lines: ["commercial"],            status: "live",      method: "api",    segment: "National broad-line" },
  { id: "fmi",              name: "FM Global",                   lines: ["commercial"],            status: "beta",      method: "portal", segment: "National broad-line" },
  { id: "ace",              name: "ACE / Chubb Specialty",       lines: ["specialty"],             status: "live",      method: "api",    segment: "National broad-line" },
  { id: "philadelphia",     name: "Philadelphia Insurance",      lines: ["commercial"],            status: "live",      method: "portal", segment: "National broad-line" },
  { id: "tokio",            name: "Tokio Marine HCC",            lines: ["commercial","specialty"], status: "beta",     method: "portal", segment: "National broad-line" },
  { id: "axa",              name: "AXA XL",                      lines: ["commercial","specialty"], status: "live",     method: "api",    segment: "Global" },
  { id: "allianz",          name: "Allianz",                     lines: ["commercial","specialty"], status: "beta",     method: "api",    segment: "Global" },
  { id: "amerisure",        name: "Amerisure",                   lines: ["commercial"],            status: "live",      method: "portal", segment: "National" },
  { id: "selective",        name: "Selective Insurance",         lines: ["commercial","personal"], status: "live",      method: "api",    segment: "Regional" },
  { id: "westfield",        name: "Westfield",                   lines: ["commercial","personal"], status: "live",      method: "portal", segment: "Regional" },
  { id: "cincinnati",       name: "Cincinnati Insurance",        lines: ["commercial","personal"], status: "live",      method: "portal", segment: "Regional" },
  { id: "erie",             name: "Erie Insurance",              lines: ["commercial","personal"], status: "live",      method: "portal", segment: "Regional" },
  { id: "auto-owners",      name: "Auto-Owners Insurance",       lines: ["commercial","personal"], status: "live",      method: "portal", segment: "Regional" },

  // ─── Personal lines specialists ───
  { id: "progressive",      name: "Progressive",                 lines: ["personal","commercial"], status: "live",      method: "api",    segment: "Auto-lead" },
  { id: "geico",            name: "GEICO",                       lines: ["personal"],              status: "available", method: "portal", segment: "Personal direct" },
  { id: "state-farm",       name: "State Farm",                  lines: ["personal"],              status: "available", method: "portal", segment: "Personal direct" },
  { id: "allstate",         name: "Allstate",                    lines: ["personal","commercial"], status: "live",      method: "api",    segment: "Personal multi-line" },
  { id: "usaa",             name: "USAA",                        lines: ["personal"],              status: "available", method: "portal", segment: "Personal direct" },
  { id: "metlife",          name: "MetLife Auto & Home",         lines: ["personal"],              status: "live",      method: "api",    segment: "Personal" },
  { id: "farmers",          name: "Farmers Insurance",           lines: ["personal","commercial"], status: "live",      method: "portal", segment: "Personal multi-line" },
  { id: "american-family",  name: "American Family",             lines: ["personal","commercial"], status: "live",      method: "portal", segment: "Personal multi-line" },
  { id: "stillwater",       name: "Stillwater Insurance",        lines: ["personal"],              status: "live",      method: "portal", segment: "Personal homeowners" },
  { id: "kemper",           name: "Kemper",                      lines: ["personal","specialty"],  status: "beta",      method: "portal", segment: "Personal" },

  // ─── E&S / Specialty / Wholesalers ───
  { id: "wr-berkley",       name: "W.R. Berkley",                lines: ["commercial","specialty"], status: "live",     method: "api",    segment: "Specialty" },
  { id: "markel",           name: "Markel",                      lines: ["specialty","commercial"], status: "live",     method: "api",    segment: "Specialty" },
  { id: "rli",              name: "RLI",                         lines: ["specialty"],              status: "live",     method: "portal", segment: "Specialty" },
  { id: "axis",             name: "AXIS Capital",                lines: ["specialty","commercial"], status: "live",     method: "api",    segment: "Specialty" },
  { id: "argo",             name: "Argo Group",                  lines: ["specialty"],              status: "beta",     method: "portal", segment: "Specialty" },
  { id: "houston-casualty", name: "Houston International Ins.",  lines: ["specialty"],              status: "available", method: "portal", segment: "Specialty" },
  { id: "great-american",   name: "Great American Insurance",    lines: ["commercial","specialty"], status: "live",     method: "portal", segment: "Specialty" },
  { id: "starr",            name: "Starr Companies",             lines: ["specialty","commercial"], status: "beta",     method: "api",    segment: "Specialty" },
  { id: "burns-wilcox",     name: "Burns & Wilcox",              lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S wholesaler" },
  { id: "rt-specialty",     name: "RT Specialty",                lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S wholesaler" },
  { id: "amwins",           name: "AmWINS",                      lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S wholesaler" },
  { id: "ryan-specialty",   name: "Ryan Specialty",              lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S wholesaler" },
  { id: "crc",              name: "CRC Group",                   lines: ["specialty"],              status: "beta",     method: "portal", segment: "E&S wholesaler" },
  { id: "jencap",           name: "Jencap",                      lines: ["specialty"],              status: "available", method: "portal", segment: "E&S wholesaler" },
  { id: "worldwide",        name: "Worldwide Facilities",        lines: ["specialty"],              status: "available", method: "portal", segment: "E&S wholesaler" },
  { id: "nautilus",         name: "Nautilus Insurance",          lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S" },
  { id: "scottsdale",       name: "Scottsdale Insurance",        lines: ["specialty"],              status: "live",     method: "portal", segment: "E&S" },

  // ─── Lloyd's & London Market ───
  { id: "lloyds",           name: "Lloyd's of London",           lines: ["specialty","commercial"], status: "beta",     method: "portal", segment: "Lloyd's" },
  { id: "beazley",          name: "Beazley",                     lines: ["specialty"],              status: "beta",     method: "portal", segment: "Lloyd's syndicate" },
  { id: "hiscox",           name: "Hiscox",                      lines: ["specialty","commercial"], status: "live",     method: "api",    segment: "Lloyd's" },
  { id: "talbot",           name: "Talbot",                      lines: ["specialty"],              status: "available", method: "portal", segment: "Lloyd's syndicate" },
  { id: "atrium",           name: "Atrium Underwriting",         lines: ["specialty"],              status: "available", method: "portal", segment: "Lloyd's syndicate" },

  // ─── Workers' Comp specialists ───
  { id: "amtrust",          name: "AmTrust Financial",           lines: ["commercial"],             status: "live",     method: "api",    segment: "WC focus" },
  { id: "ictemp",           name: "ICW Group",                   lines: ["commercial"],             status: "live",     method: "portal", segment: "WC focus" },
  { id: "berkshire-hathaway", name: "Berkshire Hathaway Direct", lines: ["commercial"],             status: "live",     method: "api",    segment: "WC focus" },
  { id: "employers",        name: "Employers Holdings",          lines: ["commercial"],             status: "live",     method: "portal", segment: "WC focus" },
  { id: "pinnacol",         name: "Pinnacol Assurance",          lines: ["commercial"],             status: "beta",     method: "portal", segment: "WC state fund" },
  { id: "icpc",             name: "Insurance Co. of the West",   lines: ["commercial"],             status: "available", method: "portal", segment: "WC focus" },

  // ─── Cyber / Tech / Professional ───
  { id: "coalition",        name: "Coalition",                   lines: ["specialty"],              status: "live",     method: "api",    segment: "Cyber" },
  { id: "atbay",            name: "At-Bay",                      lines: ["specialty"],              status: "live",     method: "api",    segment: "Cyber" },
  { id: "corvus",           name: "Corvus Insurance",            lines: ["specialty"],              status: "live",     method: "api",    segment: "Cyber" },
  { id: "resilience",       name: "Resilience Cyber",            lines: ["specialty"],              status: "beta",     method: "api",    segment: "Cyber" },
  { id: "cowbell",          name: "Cowbell Cyber",               lines: ["specialty"],              status: "live",     method: "api",    segment: "Cyber SMB" },
  { id: "vouch",            name: "Vouch Insurance",             lines: ["specialty"],              status: "live",     method: "api",    segment: "Tech E&O" },
  { id: "embroker",         name: "Embroker",                    lines: ["specialty"],              status: "beta",     method: "api",    segment: "Tech E&O" },
  { id: "next-insurance",   name: "Next Insurance",              lines: ["commercial"],             status: "live",     method: "api",    segment: "SMB digital" },
  { id: "thimble",          name: "Thimble",                     lines: ["commercial"],             status: "available", method: "api",   segment: "SMB digital" },

  // ─── Healthcare / Life ───
  { id: "unum",             name: "Unum",                        lines: ["life-health"],            status: "available", method: "portal", segment: "Group disability" },
  { id: "lincoln-financial",name: "Lincoln Financial",           lines: ["life-health"],            status: "available", method: "portal", segment: "Group life" },
  { id: "prudential",       name: "Prudential",                  lines: ["life-health"],            status: "available", method: "portal", segment: "Group benefits" },
  { id: "guardian",         name: "Guardian Life",               lines: ["life-health"],            status: "available", method: "portal", segment: "Group benefits" },
  { id: "metlife-group",    name: "MetLife Group Benefits",      lines: ["life-health"],            status: "available", method: "portal", segment: "Group benefits" },

  // ─── Auto / Trucking / Transportation ───
  { id: "national-general", name: "National General",            lines: ["personal","commercial"],  status: "live",     method: "portal", segment: "Personal/trucking" },
  { id: "northland",        name: "Northland Insurance",         lines: ["commercial"],             status: "live",     method: "portal", segment: "Trucking" },
  { id: "great-west",       name: "Great West Casualty",         lines: ["commercial"],             status: "live",     method: "portal", segment: "Trucking" },
  { id: "canal",            name: "Canal Insurance",             lines: ["commercial"],             status: "beta",     method: "portal", segment: "Trucking" },
  { id: "knight",           name: "Knight Insurance",            lines: ["commercial"],             status: "available", method: "portal", segment: "Trucking" },
  { id: "berkshire-trucking", name: "BH Trucking Underwriters",  lines: ["commercial"],             status: "available", method: "portal", segment: "Trucking" },

  // ─── Property / Catastrophe ───
  { id: "swiss-re",         name: "Swiss Re Corporate Solutions",lines: ["commercial","reinsurance"], status: "available", method: "portal", segment: "Reinsurance/large property" },
  { id: "munich-re",        name: "Munich Re Specialty",         lines: ["commercial","reinsurance"], status: "available", method: "portal", segment: "Reinsurance/large property" },
  { id: "everest",          name: "Everest Insurance",           lines: ["commercial","specialty"],   status: "beta",      method: "api",    segment: "Property/specialty" },
  { id: "ironshore",        name: "Ironshore",                   lines: ["commercial","specialty"],   status: "live",      method: "portal", segment: "Property/specialty" },
  { id: "qbe",              name: "QBE North America",           lines: ["commercial","specialty"],   status: "live",      method: "api",    segment: "Property/specialty" },
  { id: "fcci",             name: "FCCI Insurance",              lines: ["commercial"],               status: "live",      method: "portal", segment: "Regional commercial" },
  { id: "intact",           name: "Intact Insurance",            lines: ["commercial","personal"],    status: "available", method: "portal", segment: "Canadian" },
  { id: "swiss-natl",       name: "Swiss National Insurance",    lines: ["commercial"],               status: "available", method: "portal", segment: "European" },

  // ─── MGAs / Programs ───
  { id: "kingstone",        name: "Kingstone Insurance",         lines: ["personal","commercial"],    status: "available", method: "portal", segment: "MGA" },
  { id: "kinsale",          name: "Kinsale Capital",             lines: ["specialty"],                status: "live",      method: "api",    segment: "E&S MGA" },
  { id: "palomar",          name: "Palomar Specialty",           lines: ["specialty"],                status: "live",      method: "portal", segment: "Catastrophe MGA" },
  { id: "skyward",          name: "Skyward Specialty",           lines: ["specialty"],                status: "live",      method: "portal", segment: "Specialty" },
  { id: "global-indemnity", name: "Global Indemnity",            lines: ["specialty"],                status: "beta",      method: "portal", segment: "E&S" },
  { id: "ica",              name: "ICA Insurance",               lines: ["commercial"],               status: "available", method: "portal", segment: "MGA" },
  { id: "core",             name: "CORE Specialty",              lines: ["specialty"],                status: "live",      method: "portal", segment: "Specialty MGA" },
  { id: "trean",            name: "Trean Insurance",             lines: ["commercial"],               status: "available", method: "portal", segment: "Program admin" },

  // ─── Marine / Aviation / Specialty Niches ───
  { id: "intl-marine",      name: "International Marine Underwriters", lines: ["specialty"],          status: "available", method: "portal", segment: "Marine" },
  { id: "starr-aviation",   name: "Starr Aviation",              lines: ["specialty"],                status: "available", method: "portal", segment: "Aviation" },
  { id: "old-republic-aviation", name: "Old Republic Aerospace", lines: ["specialty"],                status: "available", method: "portal", segment: "Aviation" },
  { id: "victor",           name: "Victor Insurance",            lines: ["specialty"],                status: "live",      method: "portal", segment: "Specialty programs" },

  // ─── Pet / Niche personal ───
  { id: "trupanion",        name: "Trupanion",                   lines: ["specialty"],                status: "available", method: "api",    segment: "Pet" },
  { id: "lemonade",         name: "Lemonade",                    lines: ["personal"],                 status: "available", method: "api",    segment: "Renters/pet digital" },
  { id: "root",             name: "Root Insurance",              lines: ["personal"],                 status: "available", method: "api",    segment: "Auto digital" },
  { id: "hippo",            name: "Hippo Insurance",             lines: ["personal"],                 status: "live",      method: "api",    segment: "Homeowners digital" },
  { id: "kin",              name: "Kin Insurance",               lines: ["personal"],                 status: "live",      method: "api",    segment: "Coastal homeowners" },
  { id: "neptune",          name: "Neptune Flood",               lines: ["personal","specialty"],     status: "live",      method: "api",    segment: "Flood" },

  // ─── Additional regional / smaller ───
  { id: "frankenmuth",      name: "Frankenmuth Insurance",       lines: ["commercial","personal"],    status: "available", method: "portal", segment: "Regional" },
  { id: "germania",         name: "Germania Insurance",          lines: ["personal"],                 status: "available", method: "portal", segment: "Regional TX" },
  { id: "shelter",          name: "Shelter Insurance",           lines: ["personal","commercial"],    status: "available", method: "portal", segment: "Regional" },
  { id: "encompass",        name: "Encompass Insurance",         lines: ["personal"],                 status: "available", method: "portal", segment: "Regional" },
  { id: "country-financial",name: "Country Financial",           lines: ["personal","commercial"],    status: "available", method: "portal", segment: "Regional" },
];

/** Total count Fideon advertises (named + long tail of regional/MGA). */
export const TOTAL_CARRIER_COUNT = 500;

export const LINE_LABELS: Record<CarrierLine, string> = {
  commercial:    "Commercial",
  personal:      "Personal",
  specialty:     "Specialty / E&S",
  "life-health": "Life & Health",
  reinsurance:   "Reinsurance",
};

export const STATUS_LABELS: Record<CarrierStatus, string> = {
  live:      "Connected",
  beta:      "Beta",
  available: "Available",
  roadmap:   "Roadmap",
};

export const METHOD_LABELS: Record<ConnectionMethod, string> = {
  api:    "API",
  portal: "Portal",
  sftp:   "SFTP",
  email:  "Email",
};
