"""
Ramjet solver: physical-sanity and cross-module consistency checks.

Ref: reference/ramjet.md. Neither source has a worked numerical ramjet
example (§4.4), so these are internal-consistency checks — plus the
lossless limit against NPTEL's closed-form ideal specific thrust (§2.7).
"""

import math

import pytest
from aeropropsim.ramjet import RamjetConfig, solve_ramjet


def _default_config(**overrides):
    cfg = RamjetConfig(altitude_m=11000.0, mach_flight=2.5, T04=1800.0, mdot_a=10.0)
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


@pytest.mark.parametrize("mach,alt,T04", [
    (2.5, 11000.0, 1800.0),
    (3.0, 11000.0, 2000.0),
    (2.0, 5000.0, 1600.0),
])
@pytest.mark.parametrize("nozzle", ["expanded", "convergent"])
def test_ramjet_solves_and_is_physically_sane(mach, alt, T04, nozzle):
    result = solve_ramjet(_default_config(mach_flight=mach, altitude_m=alt, T04=T04,
                                          nozzle_type=nozzle))
    assert set(result.stations.keys()) == {"a", "2", "4", "9"}
    assert 0.0 < result.combustor["f"] < 0.05
    assert result.performance["thrust"] > 0
    perf = result.performance
    assert 0 < perf["eta_propulsive"] < 1
    assert 0 < perf["eta_thermal"] < 1


def test_expanded_nozzle_exits_at_ambient_and_beats_convergent_at_high_mach():
    exp = solve_ramjet(_default_config(mach_flight=3.0))
    conv = solve_ramjet(_default_config(mach_flight=3.0, nozzle_type="convergent"))
    assert exp.nozzle["p_exit"] == pytest.approx(exp.atmosphere["p_a"])
    assert exp.performance["pressure_thrust"] == pytest.approx(0.0, abs=1e-9)
    assert conv.nozzle["choked"]
    assert exp.performance["specific_thrust"] > conv.performance["specific_thrust"]


@pytest.mark.parametrize("mach", [1.5, 2.5, 3.5])
def test_lossless_limit_matches_nptel_ideal_closed_form(mach):
    """All efficiencies 1, no pressure loss, one gas: exit Mach = flight
    Mach and T/mdot_a matches NPTEL p.269's closed form."""
    g, cp = 1.4, 1005.0
    cfg = _default_config(mach_flight=mach, eta_d=1.0, eta_b=1.0, eta_N=1.0,
                          delta_p_cc_pct=0.0, gamma_h=g, cp_h=cp, gamma_c=g, cp_c=cp)
    r = solve_ramjet(cfg)
    R = cp * (g - 1) / g
    Ta = r.atmosphere["T_a"]
    f = r.combustor["f"]
    ideal = mach * math.sqrt(g * R * Ta) * (
        (1 + f) * math.sqrt(cfg.T04 / Ta) / math.sqrt(1 + (g - 1) / 2 * mach ** 2) - 1)
    assert r.nozzle["M_exit"] == pytest.approx(mach, rel=1e-9)
    assert r.performance["specific_thrust"] == pytest.approx(ideal, rel=1e-9)


def test_ramjet_zero_mach_raises():
    with pytest.raises(ValueError, match="zero flight speed"):
        solve_ramjet(_default_config(mach_flight=0.0))


def test_ramjet_too_slow_for_combustor_loss_raises():
    with pytest.raises(ValueError, match="too slow to run"):
        solve_ramjet(_default_config(mach_flight=0.2, altitude_m=0.0))


def test_ramjet_T04_below_ram_temperature_raises():
    with pytest.raises(ValueError, match="must be\\s+above the air temperature"):
        solve_ramjet(_default_config(mach_flight=6.0, T04=1200.0))


def test_ramjet_negative_thrust_gives_nan_tsfc():
    r = solve_ramjet(_default_config(mach_flight=5.5, nozzle_type="convergent"))
    assert r.performance["specific_thrust"] < 0
    assert math.isnan(r.performance["tsfc"])
    assert r.performance["eta_propulsive"] is None


def test_ramjet_higher_flight_mach_raises_ram_pressure_recovery():
    low = solve_ramjet(_default_config(mach_flight=1.5))
    high = solve_ramjet(_default_config(mach_flight=3.0))
    assert high.intake["ram_pressure_ratio"] > low.intake["ram_pressure_ratio"]
