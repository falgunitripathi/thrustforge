#!/usr/bin/env python3
"""
Parity-harness helper: solve one RamjetConfig scenario with the Python
reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_ramjet_result.py '<json-encoded config overrides>'

Companion to web/scripts/dump_ramjet_result.mjs, which does the same thing
for the JS port. web/scripts/parity_check.mjs runs both for a battery of
scenarios and diffs the results numerically.
"""
import json
import sys

from aeropropsim.ramjet import RamjetConfig, solve_ramjet


def flatten(result):
    stations_flat = {k: v.as_dict() for k, v in result.stations.items()}
    return {
        "atmosphere": result.atmosphere,
        "intake": result.intake,
        "combustor": result.combustor,
        "nozzle": result.nozzle,
        "performance": result.performance,
        "stations": stations_flat,
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        cfg = RamjetConfig(**overrides)
        result = solve_ramjet(cfg)
        sys.stdout.write(json.dumps(flatten(result)))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
