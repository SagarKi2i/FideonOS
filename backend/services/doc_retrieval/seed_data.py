"""Canonical seed for the 10 mock carriers + 5 AMS targets.

Single source of truth shared by `_json_registry.py` (file-backed local dev)
and `scripts/seed_registries.py` (Supabase upsert). Keep the IDs in sync
with the 10 tiles in
`frontend/components/playground/DocumentRetrievalUI.tsx` and the TOTP seeds
in `mock_carriers/shared/data.py`.
"""
from __future__ import annotations

from typing import Any

from .models import AmsTarget, Carrier


# Mock-server TOTP seeds (must match mock_carriers/shared/data.py:TOTP_SEEDS).
MOCK_TOTP_SEEDS = {
    "mock_travelers":   "JBSWY3DPEHPK3PXP",
    "mock_chubb":       "KRSXG5BAONUWG2DG",
    "mock_progressive": "MFRGGZDFMZTWQ2LK",
    "mock_amtrust":     "NBSWY3DPEB3W64TM",
    "mock_markel":      "ORSXG5BANBSWY3DP",
    "mock_berkshire":   "PBSWY3DPEB3W64TM",
    "mock_zurich":      "QFRGGZDFMZTWQ2LK",
}


def selector_spec(style: str) -> dict[str, Any]:
    """Returns the JSON `listing_selector_spec` the adapter reads at runtime.
    Five styles cover the 6 carrier DOM personalities."""
    base = {
        "login_username":   '[data-testid="login-username"]',
        "login_password":   '[data-testid="login-password"]',
        "login_submit":     '[data-testid="login-submit"]',
        "mfa_totp_code":    '[data-testid="mfa-totp-code"]',
        "mfa_email_code":   '[data-testid="mfa-email-otp-code"]',
        "mfa_captcha_code": '[data-testid="mfa-captcha-code"]',
        "mfa_captcha_csrf": '[data-testid="captcha-csrf"]',
        "mfa_submit":       '[data-testid="mfa-submit"]',
        "captcha_image":    '[data-testid="captcha-image"]',
    }
    if style == "attr":
        base.update({
            "doc_row":      '[data-testid="doc-row"]',
            "doc_policy":   '[data-testid="doc-policy"]',
            "doc_insured":  '[data-testid="doc-insured"]',
            "doc_type":     '[data-testid="doc-type"]',
            "doc_download": '[data-testid="doc-download"]',
        })
    elif style == "aria":
        base.update({
            "doc_row":      '[aria-label="document-row"]',
            "doc_policy":   '[aria-label="policy"]',
            "doc_insured":  '[aria-label="insured"]',
            "doc_type":     '[aria-label="doc-type"]',
            "doc_download": '[aria-label="download"]',
        })
    elif style == "column":
        base.update({
            "doc_table":     "#docs",
            "doc_policy_col":   0,
            "doc_insured_col":  1,
            "doc_type_col":     2,
            "doc_issued_col":   3,
            "doc_download_col": 4,
        })
    elif style == "iframe":
        base.update({
            "iframe_selector": '[data-testid="docs-iframe"]',
            "doc_row":      '[data-testid="doc-row"]',
            "doc_policy":   '[data-testid="doc-policy"]',
            "doc_insured":  '[data-testid="doc-insured"]',
            "doc_type":     '[data-testid="doc-type"]',
            "doc_download": '[data-testid="doc-download"]',
        })
    elif style == "paginated":
        base.update({
            "doc_row":      '[data-testid="doc-row"]',
            "doc_policy":   '[data-testid="doc-policy"]',
            "doc_insured":  '[data-testid="doc-insured"]',
            "doc_type":     '[data-testid="doc-type"]',
            "doc_download": '[data-testid="doc-download"]',
            "next_page":    '[data-testid="docs-next-page"]',
            "max_pages":    5,
        })
    return base


MOCK_CARRIERS: list[Carrier] = [
    Carrier(carrier_id="mock_travelers",   display_name="Travelers",       login_url="http://127.0.0.1:8001/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_travelers"], listing_selector_spec=selector_spec("attr"), is_mock=True),
    Carrier(carrier_id="mock_hartford",    display_name="The Hartford",    login_url="http://127.0.0.1:8002/login",
            mfa_kind="email_otp",                                       listing_selector_spec=selector_spec("column"), is_mock=True),
    Carrier(carrier_id="mock_chubb",       display_name="Chubb",           login_url="http://127.0.0.1:8003/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_chubb"],     listing_selector_spec=selector_spec("aria"), is_mock=True),
    Carrier(carrier_id="mock_liberty",     display_name="Liberty Mutual",  login_url="http://127.0.0.1:8004/login",
            mfa_kind="email_link",                                      listing_selector_spec=selector_spec("iframe"), is_mock=True),
    Carrier(carrier_id="mock_nationwide",  display_name="Nationwide",      login_url="http://127.0.0.1:8005/login",
            mfa_kind="captcha_hil",                                     listing_selector_spec=selector_spec("attr"), is_mock=True),
    Carrier(carrier_id="mock_progressive", display_name="Progressive",     login_url="http://127.0.0.1:8006/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_progressive"], listing_selector_spec=selector_spec("paginated"), is_mock=True),
    Carrier(carrier_id="mock_amtrust",     display_name="AmTrust",         login_url="http://127.0.0.1:8007/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_amtrust"],   listing_selector_spec=selector_spec("attr"), is_mock=True),
    Carrier(carrier_id="mock_markel",      display_name="Markel",          login_url="http://127.0.0.1:8008/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_markel"],    listing_selector_spec=selector_spec("attr"), is_mock=True),
    Carrier(carrier_id="mock_berkshire",   display_name="Berkshire",       login_url="http://127.0.0.1:8009/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_berkshire"], listing_selector_spec=selector_spec("attr"), is_mock=True),
    Carrier(carrier_id="mock_zurich",      display_name="Zurich",          login_url="http://127.0.0.1:8010/login",
            mfa_kind="totp_rfc6238", totp_secret_b32=MOCK_TOTP_SEEDS["mock_zurich"],    listing_selector_spec=selector_spec("attr"), is_mock=True),
]


MOCK_AMS_TARGETS: list[AmsTarget] = [
    AmsTarget(ams_target_id="applied-epic", display_name="Applied Epic", connector_kind="stub"),
    AmsTarget(ams_target_id="hawksoft",     display_name="HawkSoft",     connector_kind="stub"),
    AmsTarget(ams_target_id="ams360",       display_name="AMS 360",      connector_kind="stub"),
    AmsTarget(ams_target_id="qq-catalyst",  display_name="QQ Catalyst",  connector_kind="stub"),
    AmsTarget(ams_target_id="ezlynx",       display_name="EZLynx",       connector_kind="stub"),
]
