"""
Two-spool unmixed turbofan solver: physical-sanity and cross-module
consistency checks.

Ref: reference/turbofan.md. No worked numerical example or secondary
source exists for a turbofan in the extracted material, and several
design-value defaults (bypass ratio, fan pressure ratio, fan/spool
efficiencies) are sourced from general literature rather than this
project's primary reference (see turbofan.py's module docstring) — these
are internal-consistency checks only, not external validation.
"""

import pytest
from aeropropsim.turbofan import TurbofanConfig, solve_turbofan


def _default_config(**overrides):
    cfg = TurbofanConfig(
        altitude_m=10000.0, mach_flight=0.8, beta=5.0, pi_f=1.65,
        pi_LPC=1.5, pi_HPC=12.0, T05=1500.0, mdot_a=50.0,
    )
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


@pytest.mark.parametrize("mach,alt,beta,pi_f,T05", [
    (0.8, 10000.0, 5.0, 1.65, 1500.0),
    (0.3, 3000.0, 8.0, 1.5, 1400.0),
    (0.0, 0.0, 3.0, 1.8, 1600.0),
])
def test_turbofan_solves_without_error_and_is_physically_sane(mach, alt, beta, pi_f, T05):
    cfg = _default_config(mach_flight=mach, altitude_m=alt, beta=beta, pi_f=pi_f, T05=T05)
    result = solve_turbofan(cfg)

    assert set(result.stations.keys()) == {"a", "2", "10", "3", "4", "5", "6", "7", "9", "11"}

    # Fan/LPC/HPC each raise both temperature and pressure, hit their
    # own target pressure ratio exactly.
    assert result.fan["T010"] > result.intake["T02"]
    assert result.fan["p010"] == pytest.approx(result.intake["p02"] * pi_f, rel=1e-9)
    assert result.lpc["T03"] > result.fan["T010"]
    assert result.hpc["T04"] > result.lpc["T03"]

    # Fuel-air ratio small and positive.
    assert 0.0 < result.combustor["f"] < 0.05

    # HPT/LPT each drop both temperature and pressure below their inlet.
    assert result.hpt["T06"] < result.combustor["T05"]
    assert result.lpt["T07"] < result.hpt["T06"]

    # Both nozzles produce net-positive stream thrust, and total is their sum.
    assert result.performance["thrust_hot"] > 0
    assert result.performance["thrust_cold"] > 0
    assert result.performance["thrust"] == pytest.approx(
        result.performance["thrust_hot"] + result.performance["thrust_cold"], rel=1e-9
    )
    assert result.performance["thrust"] > 0


def test_turbofan_higher_bypass_ratio_shifts_thrust_toward_cold_stream():
    """Raising beta (bypass ratio) sends more air around the core, so
    the cold stream's share of total thrust should grow relative to the
    hot stream's, holding fan/core cycle parameters fixed."""
    low = solve_turbofan(_default_config(beta=2.0))
    high = solve_turbofan(_default_config(beta=8.0))
    low_ratio = low.performance["thrust_cold"] / low.performance["thrust_hot"]
    high_ratio = high.performance["thrust_cold"] / high.performance["thrust_hot"]
    assert high_ratio > low_ratio


def test_turbofan_higher_T05_raises_thrust():
    """More combustor heat addition should raise thrust, holding
    everything else fixed — same qualitative behavior as the turbojet."""
    low = solve_turbofan(_default_config(T05=1300.0))
    high = solve_turbofan(_default_config(T05=1700.0))
    assert high.performance["thrust"] > low.performance["thrust"]


# --- Afterburner (core stream, jet pipe 7 -> 8) --------------------------

def test_turbofan_afterburner_off_matches_plain_engine():
    from aeropropsim.turbofan import TurbofanConfig, solve_turbofan
    plain = solve_turbofan(TurbofanConfig())
    off = solve_turbofan(TurbofanConfig(afterburner_on=False, T08_ab=2200.0))
    assert off.performance["thrust"] == plain.performance["thrust"]
    assert off.performance["f_ab"] == 0.0 and "8" not in off.stations


def test_turbofan_afterburner_energy_balance_and_gain():
    from aeropropsim.turbofan import TurbofanConfig, solve_turbofan
    cfg = TurbofanConfig(beta=0.5, mach_flight=1.6, afterburner_on=True, T08_ab=2000.0)
    r = solve_turbofan(cfg)
    f, fab, ab = r.performance["f"], r.performance["f_ab"], r.afterburner
    lhs = (1 + f) * cfg.cp_h * ab["T07"] + cfg.eta_b * fab * cfg.Q_R
    rhs = (1 + f + fab) * cfg.cp_h * ab["T08"]
    assert lhs == pytest.approx(rhs, rel=1e-12)
    assert ab["p08"] == pytest.approx(ab["p07"] * (1 - cfg.delta_p_ab_pct))
    plain = solve_turbofan(TurbofanConfig(beta=0.5, mach_flight=1.6))
    assert r.performance["thrust_hot"] > plain.performance["thrust_hot"]
    assert r.performance["thrust_cold"] == pytest.approx(plain.performance["thrust_cold"])
    assert r.performance["tsfc"] > plain.performance["tsfc"]


def test_turbofan_afterburner_colder_than_lpt_exit_raises():
    from aeropropsim.turbofan import TurbofanConfig, solve_turbofan
    with pytest.raises(ValueError, match="afterburner exit temperature"):
        solve_turbofan(TurbofanConfig(afterburner_on=True, T08_ab=700.0))
