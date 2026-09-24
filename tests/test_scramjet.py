"""
Scramjet solver: physical-sanity and internal-consistency checks.

Ref: reference/scramjet.md. No secondary source or worked example exists
(Ganesan has no scramjet material) — internal-consistency checks only.
"""

import math

import pytest
from aeropropsim.scramjet import (
    ScramjetConfig, solve_scramjet, rayleigh_temp_ratio, mil_e_5007d_recovery,
)


@pytest.mark.parametrize("M1,M2,f,alt", [
    (6.0, 2.5, 0.02, 10000.0),
    (7.0, 3.0, 0.03, 10000.0),
    (5.5, 2.5, 0.02, 0.0),
])
def test_scramjet_solves_and_is_physically_sane(M1, M2, f, alt):
    r = solve_scramjet(ScramjetConfig(mach_flight=M1, mach_combustor_inlet=M2, f=f, altitude_m=alt))

    assert set(r.stations) == {"1", "2", "3", "4"}
    # Flow stays supersonic through the combustor, and heat addition
    # slows a supersonic flow down.
    assert 1.0 < r.combustor["M3"] < M2
    assert r.stations["2"].M == pytest.approx(M2, rel=1e-9)
    # Adiabatic intake: stagnation temperature conserved from 1 to 2.
    assert r.intake["T02"] == pytest.approx(r.atmosphere["T0a"], rel=1e-9)
    # Combustor adds heat; the solved M3 reproduces the source's T03/T02 relation.
    assert r.combustor["T03"] > r.intake["T02"]
    assert rayleigh_temp_ratio(M2, r.combustor["M3"], 1.4, 1.333) == pytest.approx(
        r.combustor["T03_over_T02"], rel=1e-9)
    # Nozzle expands to ambient and accelerates the flow above flight speed.
    assert r.stations["4"].p == pytest.approx(r.atmosphere["p_a"], rel=1e-9)
    assert r.nozzle["V4"] > r.atmosphere["V_flight"]
    p = r.performance
    assert p["thrust"] > 0
    assert 0.0 < p["eta_propulsive"] < 1.0
    assert 0.0 < p["eta_thermal"] < 1.0
    assert p["isp_s"] > 0


def test_scramjet_thermal_choking_raises():
    with pytest.raises(ValueError, match="thermally chokes"):
        solve_scramjet(ScramjetConfig(mach_flight=5.0, mach_combustor_inlet=2.0, f=0.02))


@pytest.mark.parametrize("kw", [
    {"mach_combustor_inlet": 0.8},                     # subsonic combustion = ramjet
    {"mach_flight": 2.0, "mach_combustor_inlet": 2.5},  # intake can't accelerate
])
def test_scramjet_rejects_non_scramjet_operating_points(kw):
    with pytest.raises(ValueError):
        solve_scramjet(ScramjetConfig(**kw))


def test_more_fuel_raises_thrust():
    low = solve_scramjet(ScramjetConfig(f=0.015))
    high = solve_scramjet(ScramjetConfig(f=0.025))
    assert high.performance["thrust"] > low.performance["thrust"]


def test_mil_e_5007d_branches():
    assert mil_e_5007d_recovery(0.5) == 1.0
    assert mil_e_5007d_recovery(3.0) == pytest.approx(1.0 - 0.075 * 2.0 ** 1.35)
    # Continuous with the M>5 branch at M=5, and never negative.
    assert mil_e_5007d_recovery(5.0) == pytest.approx(800.0 / (5.0 ** 4 + 935.0), abs=1e-3)
    assert all(mil_e_5007d_recovery(m / 10) > 0 for m in range(0, 120))
    assert mil_e_5007d_recovery(6.0) == pytest.approx(800.0 / (6.0 ** 4 + 935.0))


def test_negative_thrust_blanks_efficiencies_and_isp():
    """Too little fuel: the exhaust leaves slower than the incoming air, so
    thrust is negative and eta_P/eta_th/Isp are reported as None rather
    than eta_P > 1 and eta_th < 0."""
    r = solve_scramjet(ScramjetConfig(f=0.001))
    p = r.performance
    assert p["specific_thrust"] < 0
    assert p["eta_propulsive"] is None and p["eta_thermal"] is None
    assert p["eta_overall"] is None and p["isp_s"] is None
    assert math.isnan(p["tsfc"])
