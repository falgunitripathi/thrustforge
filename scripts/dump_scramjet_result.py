#!/usr/bin/env python3
"""
Parity-harness helper: solve one ScramjetConfig scenario with the Python
reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_scramjet_result.py '<json-encoded config overrides>'
"""
import json
import sys

from aeropropsim.scramjet import ScramjetConfig, solve_scramjet


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
        result = solve_scramjet(ScramjetConfig(**overrides))
        sys.stdout.write(json.dumps(flatten(result)))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
