"""Test policies and document fixtures for every mock carrier.

Each carrier publishes its own list via `docs_for(carrier_id)`. The data is
deterministic so e2e tests can assert exact filenames and ordering.

Canonical 8 doc_types (matches `doc_types` registry in the real backend):
    policy_renewal, cancellation, endorsement, memo,
    invoice, certificate, deck_page, loss_run.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


CANONICAL_DOC_TYPES = [
    "policy_renewal",
    "cancellation",
    "endorsement",
    "memo",
    "invoice",
    "certificate",
    "deck_page",
    "loss_run",
]

# Seed policies — same shape across carriers so e2e tests can target any carrier
# with the same `policy_number` / `insured_name` and get a result.
SEED_POLICIES = [
    ("POL-2025-12345", "Acme Insurance Co"),
    ("POL-2025-12346", "Riverbend Logistics LLC"),
    ("POL-2025-12347", "Northwind Trading"),
    ("POL-2025-12348", "Lakeside Manufacturing"),
    ("POL-2025-12349", "Summit Construction"),
]


@dataclass
class MockDoc:
    doc_id: str
    policy_number: str
    insured_name: str
    doc_type: str
    filename: str
    issued_on: str  # ISO date


def _docs(carrier_id: str) -> list[MockDoc]:
    items: list[MockDoc] = []
    for pol_idx, (pol, insured) in enumerate(SEED_POLICIES):
        for dt_idx, dt in enumerate(CANONICAL_DOC_TYPES):
            doc_id = f"{carrier_id}-{pol_idx + 1}-{dt_idx + 1}"
            filename = f"{pol}_{dt}.pdf"
            items.append(
                MockDoc(
                    doc_id=doc_id,
                    policy_number=pol,
                    insured_name=insured,
                    doc_type=dt,
                    filename=filename,
                    issued_on=date(2025, ((dt_idx + pol_idx) % 12) + 1, 15).isoformat(),
                )
            )
    return items


@dataclass(frozen=True)
class MockCarrierProfile:
    carrier_id: str
    display_name: str
    port: int
    mfa_kind: str
    totp_seed: str | None = None
    docs: list[MockDoc] = field(default_factory=list)


# Test TOTP seeds — base32, 16 chars. Real carriers would never publish these.
TOTP_SEEDS = {
    "mock_travelers":   "JBSWY3DPEHPK3PXP",
    "mock_chubb":       "KRSXG5BAONUWG2DG",
    "mock_progressive": "MFRGGZDFMZTWQ2LK",
    "mock_amtrust":     "NBSWY3DPEB3W64TM",
    "mock_markel":      "ORSXG5BANBSWY3DP",
    "mock_berkshire":   "PBSWY3DPEB3W64TM",
    "mock_zurich":      "QFRGGZDFMZTWQ2LK",
}


# Order matches the 10 carrier tiles in
# frontend/components/playground/DocumentRetrievalUI.tsx — keep parity so the
# UI tile and the mock server are 1:1 by name and position. Ports 8001..8010.
CARRIER_PROFILES: dict[str, MockCarrierProfile] = {
    "mock_travelers":   MockCarrierProfile("mock_travelers",   "Travelers (mock)",       8001, "totp_rfc6238", TOTP_SEEDS["mock_travelers"]),
    "mock_hartford":    MockCarrierProfile("mock_hartford",    "The Hartford (mock)",    8002, "email_otp"),
    "mock_chubb":       MockCarrierProfile("mock_chubb",       "Chubb (mock)",           8003, "totp_rfc6238", TOTP_SEEDS["mock_chubb"]),
    "mock_liberty":     MockCarrierProfile("mock_liberty",     "Liberty Mutual (mock)",  8004, "email_link"),
    "mock_nationwide":  MockCarrierProfile("mock_nationwide",  "Nationwide (mock)",      8005, "captcha_hil"),
    "mock_progressive": MockCarrierProfile("mock_progressive", "Progressive (mock)",     8006, "totp_rfc6238", TOTP_SEEDS["mock_progressive"]),
    "mock_amtrust":     MockCarrierProfile("mock_amtrust",     "AmTrust (mock)",         8007, "totp_rfc6238", TOTP_SEEDS["mock_amtrust"]),
    "mock_markel":      MockCarrierProfile("mock_markel",      "Markel (mock)",          8008, "totp_rfc6238", TOTP_SEEDS["mock_markel"]),
    "mock_berkshire":   MockCarrierProfile("mock_berkshire",   "Berkshire (mock)",       8009, "totp_rfc6238", TOTP_SEEDS["mock_berkshire"]),
    "mock_zurich":      MockCarrierProfile("mock_zurich",      "Zurich (mock)",          8010, "totp_rfc6238", TOTP_SEEDS["mock_zurich"]),
}


# UI-tile id  → mock-server carrier_id mapping. Used by the frontend (in
# `frontend/lib/carrierMockMap.ts`) and seeded into the `carriers` table so the
# orchestrator can look up the right mock by carrier_id. The mock_* prefix is
# load-bearing — production carrier rows have no prefix.
UI_TO_MOCK_CARRIER_ID: dict[str, str] = {
    "travelers":       "mock_travelers",
    "hartford":        "mock_hartford",
    "chubb":           "mock_chubb",
    "liberty-mutual":  "mock_liberty",
    "nationwide":      "mock_nationwide",
    "progressive":     "mock_progressive",
    "amtrust":         "mock_amtrust",
    "markel":          "mock_markel",
    "berkshire":       "mock_berkshire",
    "zurich":          "mock_zurich",
}

for _cid, _profile in CARRIER_PROFILES.items():
    object.__setattr__(_profile, "docs", _docs(_cid))


def get_profile(carrier_id: str) -> MockCarrierProfile:
    if carrier_id not in CARRIER_PROFILES:
        raise KeyError(f"Unknown mock carrier: {carrier_id}")
    return CARRIER_PROFILES[carrier_id]


def docs_for(carrier_id: str) -> list[MockDoc]:
    return get_profile(carrier_id).docs


# Username + password every mock accepts. Real carriers obviously don't publish
# these — only the data-driven mocks do. The doc-retrieval orchestrator pulls
# credentials from the `carrier_connections` row, which the seed script writes.
MOCK_USERNAME = "fideon_demo"
MOCK_PASSWORD = "fideon_demo_pw_2026"
