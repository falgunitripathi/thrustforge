"""
Three-spool propfan solver: physical-sanity and cross-module consistency
checks.

Ref: reference/propfan.md. No worked numerical example or secondary
source exists for a propfan anywhere in the extracted material (Ganesan
has zero propfan-specific content — confirmed by direct grep) — these
are internal-consistency checks only, same caveat as the turbofan/
turboshaft's own test suites.
"""

import pytest
from aeropropsim.propfan import PropfanConfig, solve_propfan


def _default_config(**overrides):
    cfg = PropfanConfig(
        altitude_m=9000.0, mach_flight=0.7, pi_IPC=2.0, pi_HPC=6.0,
        T05=1500.0, mdot_a=1.0,
    )
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


@pytest.mark.parametrize("mach,alt,pi_IPC,pi_HPC,T05", [
    (0.7, 9000.0, 2.0, 6.0, 1500.0),
    (0.5, 6000.0, 1.8, 5.0, 1400.0),
    (0.3, 3000.0, 2.2, 7.0, 1600.0),
])
def test_propfan_solves_without_error_and_is_physically_sane(mach, alt, pi_IPC, pi_HPC, T05):
    cfg = _default_config(mach_flight=mach, altitude_m=alt, pi_IPC=pi_IPC, pi_HPC=pi_HPC, T05=T05)
    result = solve_propfan(cfg)

    assert set(result.stations.keys()) == {
        "a", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    }

    # IPC/HPC each raise both temperature and pressure, hit their own
    # target pressure ratio exactly.
    assert result.ipc["T03"] > result.intake["T02"]
    assert result.ipc["p03"] == pytest.approx(result.intake["p02"] * pi_IPC, rel=1e-9)
    assert result.hpc["T04"] > result.ipc["T03"]
    assert result.hpc["p04"] == pytest.approx(result.ipc["p03"] * pi_HPC, rel=1e-9)

    # Fuel-air ratio small and positive.
    assert 0.0 < result.combustor["f"] < 0.05

    # HPT/IPT each drop temperature and pressure below their inlet.
    assert result.hpt["T06"] < result.combustor["T05"]
    assert result.ipt["T07"] < result.hpt["T06"]

    # Fan: unducted, sized off the freestream (not the ducted core), so
    # its inlet total pressure exactly equals the freestream stagnation
    # value, not the (lossier) core intake exit.
    assert result.fan["p010"] == pytest.approx(result.atmosphere["p0a"], rel=1e-9)
    assert result.fan["T011"] > result.fan["T010"]
    assert result.fan["p011"] == pytest.approx(result.fan["p010"] * cfg.pi_UDF, rel=1e-9)
    assert result.fan["ue_UDF"] > 0

    # Free turbine expands (temperature and pressure both drop).
    assert result.free_turbine["T08"] < result.ipt["T07"]
    assert result.free_turbine["p08"] < result.ipt["p07"]

    # Positive fan and nozzle thrust contributions, total is their sum.
    assert result.performance["thrust_fan"] > 0
    assert result.performance["thrust_nozzle"] > 0
    assert result.performance["thrust"] == pytest.approx(
        result.performance["thrust_fan"] + result.performance["thrust_nozzle"], rel=1e-9
    )
    assert result.performance["thrust"] > 0

    # Propulsive efficiency is a fraction in (0, 1).
    eta_P = result.performance["eta_propulsive"]
    assert eta_P is not None and 0.0 < eta_P < 1.0


def test_propfan_higher_T05_raises_thrust():
    """More combustor heat addition should raise thrust, holding
    everything else fixed — same qualitative behavior as every other
    engine in this project."""
    low = solve_propfan(_default_config(T05=1300.0))
    high = solve_propfan(_default_config(T05=1700.0))
    assert high.performance["thrust"] > low.performance["thrust"]


def test_propfan_higher_alpha_shifts_power_toward_fan_away_from_nozzle():
    """Raising alpha (the free turbine's split fraction) sends more of
    the available enthalpy drop to the shaft/fan and less to the
    residual hot-nozzle jet — same qualitative behavior as the
    turboprop's own alpha split."""
    low = solve_propfan(_default_config(alpha=0.70))
    high = solve_propfan(_default_config(alpha=0.95))
    assert high.performance["thrust_fan"] > low.performance["thrust_fan"]
    assert high.performance["thrust_nozzle"] < low.performance["thrust_nozzle"]


def test_propfan_zero_bleed_matches_mass_factor_one_plus_f():
    """bleed_ratio=0 should make the (1+f-b) mass factor used throughout
    reduce to plain (1+f) — a basic internal-consistency check on the
    module's uniform (1+f-b) convention (see propfan.py module docstring
    judgment call #1)."""
    result = solve_propfan(_default_config(bleed_ratio=0.0))
    f = result.combustor["f"]
    # Sanity: thrust_nozzle should match what (1+f)*ue_n - V_flight gives.
    ue_n = result.hot_nozzle["V_exit"]
    V_flight = result.atmosphere["V_flight"]
    expected_Tn = result.config.mdot_a * ((1.0 + f) * ue_n - V_flight)
    assert result.performance["thrust_nozzle"] == pytest.approx(expected_Tn, rel=1e-9)
