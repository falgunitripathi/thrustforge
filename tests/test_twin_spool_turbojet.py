"""Two-spool turbojet: spool work balances, afterburner, and consistency
with the single-spool cycle (same thermodynamics, split across two shafts)."""

import math

import pytest
from aeropropsim.twin_spool_turbojet import TwinSpoolTurbojetConfig, solve_twin_spool_turbojet


def test_each_turbine_drives_its_own_compressor():
    cfg = TwinSpoolTurbojetConfig()
    r = solve_twin_spool_turbojet(cfg)
    f = r.performance["f"]
    hpt = cfg.lambda1 * cfg.eta_m1 * (1 + f) * cfg.cp_h * (cfg.T05 - r.hpt["T06"])
    lpt = cfg.lambda2 * cfg.eta_m2 * (1 + f) * cfg.cp_h * (r.hpt["T06"] - r.lpt["T07"])
    assert hpt == pytest.approx(cfg.cp_c * (r.hpc["T04"] - r.lpc["T03"]), rel=1e-12)
    assert lpt == pytest.approx(cfg.cp_c * (r.lpc["T03"] - r.intake["T02"]), rel=1e-12)
    assert set(r.stations) == {"a", "2", "3", "4", "5", "6", "7", "9"}


def test_close_to_one_compressor_at_same_overall_ratio():
    """Splitting one compressor into LPC x HPC is the same cycle, so the
    overall numbers barely move."""
    one = solve_twin_spool_turbojet(TwinSpoolTurbojetConfig(pi_LPC=15.0, pi_HPC=1.0))
    two = solve_twin_spool_turbojet(TwinSpoolTurbojetConfig(pi_LPC=4.0, pi_HPC=3.75))
    assert two.performance["specific_thrust"] == pytest.approx(one.performance["specific_thrust"], rel=0.05)


def test_afterburner_energy_balance_and_gain():
    cfg = TwinSpoolTurbojetConfig(afterburner_on=True, T08_ab=2000.0)
    r = solve_twin_spool_turbojet(cfg)
    f, fab, ab = r.performance["f"], r.performance["f_ab"], r.afterburner
    lhs = (1 + f) * cfg.cp_h * ab["T07"] + cfg.eta_b * fab * cfg.Q_R
    assert lhs == pytest.approx((1 + f + fab) * cfg.cp_h * ab["T08"], rel=1e-12)
    plain = solve_twin_spool_turbojet(TwinSpoolTurbojetConfig())
    assert r.performance["specific_thrust"] > plain.performance["specific_thrust"]
    assert "8" in r.stations


def test_static_run_has_zero_propulsive_efficiency_but_thrust():
    r = solve_twin_spool_turbojet(TwinSpoolTurbojetConfig(mach_flight=0.0, altitude_m=0.0))
    assert r.performance["thrust"] > 0 and r.performance["eta_propulsive"] == 0.0
    assert math.isfinite(r.performance["tsfc"])


def test_compressors_hotter_than_tit_raises():
    with pytest.raises(ValueError, match="compressors already deliver air"):
        solve_twin_spool_turbojet(TwinSpoolTurbojetConfig(mach_flight=3.0, pi_LPC=8, pi_HPC=6))
