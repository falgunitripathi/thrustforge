#!/usr/bin/env python3
"""
Parity-harness helper: solve one TurbofanConfig scenario with the
Python reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_turbofan_result.py '<json-encoded config overrides>'
"""
import json
import sys

from aeropropsim.turbofan import TurbofanConfig, solve_turbofan


def flatten(result):
    stations_flat = {k: v.as_dict() for k, v in result.stations.items()}
    return {
        "atmosphere": result.atmosphere,
        "intake": result.intake,
        "fan": result.fan,
        "lpc": result.lpc,
        "hpc": result.hpc,
        "combustor": result.combustor,
        "hpt": result.hpt,
        "lpt": result.lpt,
        "hot_nozzle": result.hot_nozzle,
        "afterburner": result.afterburner,
        "cold_nozzle": result.cold_nozzle,
        "performance": result.performance,
        "stations": stations_flat,
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        cfg = TurbofanConfig(**overrides)
        result = solve_turbofan(cfg)
        sys.stdout.write(json.dumps(flatten(result)))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
