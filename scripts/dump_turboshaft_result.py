#!/usr/bin/env python3
"""
Parity-harness helper: solve one TurboshaftConfig scenario with the
Python reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_turboshaft_result.py '<json-encoded config overrides>'
"""
import json
import sys

from aeropropsim.turboshaft import TurboshaftConfig, solve_turboshaft


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
        "turbine": {
            "pr_actual": result.turbine["pr_actual"],
            "T01_out": result.turbine["T01_out"],
            "type": result.turbine["type"],
        },
        "shaft": result.shaft,
        "performance": result.performance,
        "stations": stations_flat,
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        cfg = TurboshaftConfig(**overrides)
        result = solve_turboshaft(cfg)
        sys.stdout.write(json.dumps(flatten(result)))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
