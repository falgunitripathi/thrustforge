"""
Single-spool turboshaft solver: physical-sanity and cross-module
consistency checks.

Ref: reference/turboshaft.md. No secondary source or worked example
exists for a turboshaft in the extracted material — these are internal-
consistency checks only, plus an order-of-magnitude cross-check against
plausible real-world SFC values, same caveat as the ramjet/turboprop.
"""

import pytest
from aeropropsim.turboshaft import TurboshaftConfig, solve_turboshaft


def _default_config(**overrides):
    cfg = TurboshaftConfig(
        altitude_m=0.0, mach_flight=0.0,
        compressor_type="axial", n_compressor_stages=8, pi_c=10.0,
        T04=1400.0, turbine_type="axial", n_turbine_stages=2, mdot_a=1.0,
    )
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


@pytest.mark.parametrize("mach,alt,pi_c,T04", [
    (0.0, 0.0, 10.0, 1400.0),
    (0.0, 3000.0, 8.0, 1300.0),
    (0.3, 6000.0, 14.0, 1500.0),
])
def test_turboshaft_solves_without_error_and_is_physically_sane(mach, alt, pi_c, T04):
    cfg = _default_config(mach_flight=mach, altitude_m=alt, pi_c=pi_c, T04=T04)
    result = solve_turboshaft(cfg)

    # No nozzle at all: only five stations, unlike the turbojet/turboprop's six.
    assert set(result.stations.keys()) == {"a", "2", "3", "4", "5"}

    # Compressor raises both temperature and pressure, hits its target
    # PR exactly — identical guarantee to the turbojet (same compressor.py).
    assert result.compressor["T01_out"] > result.intake["T02"]
    assert result.compressor["pi_actual"] == pytest.approx(pi_c, rel=1e-9)

    # Fuel-air ratio small and positive.
    assert 0.0 < result.combustor["f"] < 0.05

    # Turbine expands all the way to ambient pressure by construction.
    assert result.stations["5"].p == pytest.approx(result.atmosphere["p_a"], rel=1e-9)
    assert result.stations["5"].T0 < result.stations["4"].T0

    # Positive shaft/load power.
    assert result.shaft["Wshaft"] > 0
    assert result.performance["Pload_W"] > 0

    # SFC should be in a plausible real-world band for a small turboshaft
    # (reference/turboshaft.md gives no source number to check against —
    # this is a sanity band, not a validated target).
    assert 0.1 < result.performance["SFC_kg_per_kWh"] < 1.0


def test_turboshaft_runs_at_zero_flight_speed_unlike_turboprop():
    """Nothing in the turboshaft's formulas divides by flight speed
    (reference/turboshaft.md §2.1) — mach_flight=0 (hover, the case the
    source's own helicopter example is built around) must solve cleanly,
    unlike the turboprop/ramjet, which raise there."""
    cfg = _default_config(mach_flight=0.0, altitude_m=0.0)
    result = solve_turboshaft(cfg)
    assert result.atmosphere["V_flight"] == 0.0
    assert result.performance["Pload_W"] > 0


def test_turboshaft_higher_T04_raises_shaft_power():
    """More combustor heat addition should raise the turbine's available
    enthalpy drop and therefore shaft/load power, holding everything
    else fixed."""
    low = solve_turboshaft(_default_config(T04=1200.0))
    high = solve_turboshaft(_default_config(T04=1600.0))
    assert high.performance["Pload_W"] > low.performance["Pload_W"]


def test_turboshaft_raises_when_compressor_outpowers_turbine():
    """An 8-stage centrifugal compressor (~200:1) needs more power than the
    turbine makes — must raise a clear error, not report negative load power."""
    with pytest.raises(ValueError, match="compressor needs more power"):
        solve_turboshaft(_default_config(compressor_type="centrifugal", n_compressor_stages=8))
