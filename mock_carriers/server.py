"""CLI entry point for any single mock carrier.

Usage (from repo root):
    python -m mock_carriers.server mock_travelers
    python -m mock_carriers.server mock_hartford
    ...

Listens on the carrier's assigned port from `data.CARRIER_PROFILES`. Used by
`scripts/start_all_mocks.ps1` to launch all 10 carriers in parallel.
"""
from __future__ import annotations

import argparse
import sys

import uvicorn

from .shared.app_factory import build_app
from .shared.data import CARRIER_PROFILES, get_profile


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one mock carrier portal.")
    parser.add_argument("carrier_id", choices=sorted(CARRIER_PROFILES), help="Mock carrier ID")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    profile = get_profile(args.carrier_id)
    app = build_app(args.carrier_id)

    print(f"[mock] {profile.display_name} on http://{args.host}:{profile.port}", flush=True)
    uvicorn.run(app, host=args.host, port=profile.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
