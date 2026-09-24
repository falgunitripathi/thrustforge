#!/usr/bin/env python3
"""
Parity-harness helper: solve one RamjetConfig scenario with the Python
reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_ramjet_result.py '<json-encoded config overrides>'
"""
import json
import math
import sys

from aeropropsim.ramjet import RamjetConfig, solve_ramjet


def _clean(obj):
    """NaN (e.g. TSFC when thrust <= 0) -> None, matching JS JSON.stringify."""
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    return obj


def flatten(result):
    return {
        "atmosphere": result.atmosphere,
        "intake": result.intake,
        "combustor": result.combustor,
        "nozzle": result.nozzle,
        "performance": result.performance,
        "stations": {k: v.as_dict() for k, v in result.stations.items()},
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        result = solve_ramjet(RamjetConfig(**overrides))
        sys.stdout.write(json.dumps(_clean(flatten(result))))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
