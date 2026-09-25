#!/usr/bin/env python3
"""
Parity-harness helper: solve one EngineConfig scenario with the Python
reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_engine_result.py '<json-encoded config overrides>'

Companion to web/scripts/dump_engine_result.mjs, which does the same thing
for the JS port. web/scripts/parity_check.mjs runs both for a battery of
scenarios and diffs the results numerically.
"""
import json
import sys

from aeropropsim.engine import EngineConfig, solve_engine


def flatten(result):
    stations_flat = {k: v.as_dict() for k, v in result.stations.items()}
    return {
        "atmosphere": result.atmosphere,
        "intake": result.intake,
        "compressor": {
            "pi_actual": result.compressor["pi_actual"],
            "T01_out": result.compressor["T01_out"],
            "p03": result.compressor["p03"],
            "type": result.compressor["type"],
        },
        "combustor": result.combustor,
        "shaft": result.shaft,
        "turbine": {
            "pr_actual": result.turbine["pr_actual"],
            "T01_out": result.turbine["T01_out"],
            "type": result.turbine["type"],
        },
        "afterburner": result.afterburner,
        "nozzle": result.nozzle,
        "performance": result.performance,
        "stations": stations_flat,
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    cfg = EngineConfig(**overrides)
    result = solve_engine(cfg)
    sys.stdout.write(json.dumps(flatten(result)))


if __name__ == "__main__":
    main()
