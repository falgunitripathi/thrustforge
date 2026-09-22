#!/usr/bin/env python3
"""
Parity-harness helper: solve one PropfanConfig scenario with the
Python reference implementation and print a flat JSON result to stdout.

Usage: python3 scripts/dump_propfan_result.py '<json-encoded config overrides>'
"""
import json
import sys

from aeropropsim.propfan import PropfanConfig, solve_propfan


def flatten(result):
    stations_flat = {k: v.as_dict() for k, v in result.stations.items()}
    return {
        "atmosphere": result.atmosphere,
        "intake": result.intake,
        "ipc": result.ipc,
        "hpc": result.hpc,
        "combustor": result.combustor,
        "hpt": result.hpt,
        "ipt": result.ipt,
        "fan": result.fan,
        "free_turbine": result.free_turbine,
        "hot_nozzle": result.hot_nozzle,
        "performance": result.performance,
        "stations": stations_flat,
    }


def main():
    overrides = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    try:
        cfg = PropfanConfig(**overrides)
        result = solve_propfan(cfg)
        sys.stdout.write(json.dumps(flatten(result)))
    except ValueError as e:
        sys.stdout.write(json.dumps({"error": "ValueError", "message": str(e)}))


if __name__ == "__main__":
    main()
