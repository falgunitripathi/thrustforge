#!/usr/bin/env python3
"""
Parity-harness helper: solve one TurboramjetConfig scenario with the Python
reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_ramjet_result.py '<json-encoded config overrides>'
"""
import json
import math
import sys

from aeropropsim.turboramjet import TurboramjetConfig, solve_turboramjet


def _clean(obj):
    """NaN (e.g. TSFC when thrust <= 0) -> None, matching JS JSON.stringify."""
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    return obj


def flatten(result):
    return {
        "mode_active": result.mode_active,
        "atmosphere": result.atmosphere,
        "turbojet": result.turbojet,
        "ramjet": result.ramjet,
        "performance": result.performance,
        "stations": {k: v.as_dict() for k, v in result.stations.items()},
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        result = solve_turboramjet(TurboramjetConfig(**overrides))
        sys.stdout.write(json.dumps(_clean(flatten(result))))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
