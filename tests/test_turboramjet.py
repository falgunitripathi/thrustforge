"""
Turboramjet (TJRJ) solver: mode logic, leg consistency, and fail-loud
checks. Ref: reference/turboramjet.md (no worked numerical example in the
source, so these are internal-consistency checks).
"""

import math

import pytest
from aeropropsim.turboramjet import TurboramjetConfig, solve_turboramjet
from aeropropsim.ramjet import RamjetConfig, solve_ramjet


def _cfg(**kw):
    return TurboramjetConfig(**kw)


@pytest.mark.parametrize("mach,expected", [(0.0, "turbojet"), (2.0, "turbojet"),
                                           (2.99, "turbojet"), (3.0, "ramjet"), (4.0, "ramjet")])
def test_auto_mode_switches_at_mach_switch(mach, expected):
    r = solve_turboramjet(_cfg(mach_flight=mach))
    assert r.mode_active == expected
    assert (r.turbojet is not None) == (expected == "turbojet")
    assert (r.ramjet is not None) == (expected == "ramjet")


def test_turbojet_leg_can_produce_static_thrust():
    r = solve_turboramjet(_cfg(mach_flight=0.0, altitude_m=0.0))
    assert r.performance["thrust"] > 0
    assert set(r.stations) == {"a", "2", "3", "4", "5", "6", "7"}


def test_turbojet_leg_energy_and_work_balance():
    cfg = _cfg(mach_flight=2.0)
    tj = solve_turboramjet(cfg).turbojet
    # Turbine work = compressor work / eta_m
    turb = (1 + tj["f"]) * cfg.cp_h * (tj["T04"] - tj["T05"])
    assert turb * cfg.eta_m == pytest.approx(tj["compressor_work"], rel=1e-12)
    # Nozzle fully expanded: exit static pressure = ambient
    assert tj["p7"] == pytest.approx(solve_turboramjet(cfg).atmosphere["p_a"])
    # Thrust uses +fab (judgment call #1)
    V = solve_turboramjet(cfg).atmosphere["V_flight"]
    assert tj["specific_thrust"] == pytest.approx((1 + tj["f"] + tj["fab"]) * tj["V7"] - V)


def test_afterburner_adds_thrust_and_fuel():
    on = solve_turboramjet(_cfg(mach_flight=1.5, afterburner_on=True)).turbojet
    off = solve_turboramjet(_cfg(mach_flight=1.5, afterburner_on=False)).turbojet
    assert off["fab"] == 0.0 and on["fab"] > 0
    assert on["specific_thrust"] > off["specific_thrust"]
    assert on["tsfc"] > off["tsfc"]


def test_ramjet_leg_matches_standalone_ramjet():
    cfg = _cfg(mach_flight=3.5, T09=1900.0)
    rj = solve_turboramjet(cfg).ramjet
    ref = solve_ramjet(RamjetConfig(altitude_m=cfg.altitude_m, mach_flight=3.5, T04=1900.0))
    assert rj["f"] == pytest.approx(ref.combustor["f"], rel=1e-12)
    assert rj["V10"] == pytest.approx(ref.nozzle["V_exit"], rel=1e-12)
    assert rj["specific_thrust"] == pytest.approx(ref.performance["specific_thrust"], rel=1e-12)


def test_dual_mode_is_mass_weighted_sum_of_legs():
    beta = 0.3
    r = solve_turboramjet(_cfg(mach_flight=2.5, mode="dual", beta=beta, mdot_a=20.0))
    tj = solve_turboramjet(_cfg(mach_flight=2.5, mode="turbojet", mdot_a=20.0)).turbojet
    rj = solve_turboramjet(_cfg(mach_flight=2.5, mode="ramjet", mdot_a=20.0)).ramjet
    p = r.performance
    assert p["specific_thrust"] == pytest.approx(beta * tj["specific_thrust"] + (1 - beta) * rj["specific_thrust"])
    assert p["thrust"] == pytest.approx(p["thrust_turbojet"] + p["thrust_ramjet"])
    assert p["mdot_f"] == pytest.approx(20.0 * (beta * tj["fuel_air"] + (1 - beta) * rj["fuel_air"]))
    assert set(r.stations) == {"a", "2", "3", "4", "5", "6", "7", "8", "9", "10"}


def test_turbojet_tsfc_crosses_ramjet_near_mach_3():
    """With the afterburner lit, the ramjet overtakes the turbojet on TSFC
    right around the default switch Mach — consistent with the source's
    Mach-3 examples."""
    def tsfc(mode, M):
        return solve_turboramjet(_cfg(mach_flight=M, mode=mode)).performance["tsfc"]
    assert tsfc("turbojet", 2.5) < tsfc("ramjet", 2.5)
    assert tsfc("turbojet", 3.2) > tsfc("ramjet", 3.2)


def test_turbojet_mode_too_hot_at_high_mach_raises():
    with pytest.raises(ValueError, match="compressor already delivers air"):
        solve_turboramjet(_cfg(mach_flight=4.0, mode="turbojet"))


def test_ramjet_mode_at_zero_speed_raises_with_turboramjet_prefix():
    with pytest.raises(ValueError, match="^solve_turboramjet: ramjet mode"):
        solve_turboramjet(_cfg(mach_flight=0.0, mode="ramjet"))


def test_afterburner_colder_than_turbine_exit_raises():
    with pytest.raises(ValueError, match="afterburner exit temperature"):
        solve_turboramjet(_cfg(mach_flight=1.0, T06_ab=900.0))


@pytest.mark.parametrize("beta", [0.0, 1.0, 1.5])
def test_dual_mode_beta_out_of_range_raises(beta):
    with pytest.raises(ValueError, match="air split"):
        solve_turboramjet(_cfg(mode="dual", beta=beta))


def test_bad_mode_raises():
    with pytest.raises(ValueError, match="mode must be"):
        solve_turboramjet(_cfg(mode="scramjet"))


def test_efficiencies_are_fractions():
    for M, mode in [(1.0, "turbojet"), (2.5, "dual"), (3.5, "ramjet")]:
        p = solve_turboramjet(_cfg(mach_flight=M, mode=mode)).performance
        for k in ("eta_propulsive", "eta_thermal", "eta_overall"):
            assert 0 < p[k] < 1, (M, mode, k)
        assert math.isfinite(p["tsfc"])
