import pytest


# --- Afterburner (NPTEL p.291-296) ---------------------------------------

def _ab_cfg(**kw):
    from aeropropsim.engine import EngineConfig
    base = dict(altitude_m=0.0, mach_flight=0.0, n_compressor_stages=8, pi_c=8.0,
                T04=1400.0, mdot_a=50.0)
    base.update(kw)
    return EngineConfig(**base)


def test_afterburner_off_is_exactly_the_plain_turbojet():
    from aeropropsim.engine import solve_engine
    plain = solve_engine(_ab_cfg())
    off = solve_engine(_ab_cfg(afterburner_on=False, T06_ab=2100.0))
    assert off.performance["thrust"] == plain.performance["thrust"]
    assert off.performance["f_ab"] == 0.0
    assert "6" not in off.stations


def test_afterburner_energy_balance_and_thrust_gain():
    from aeropropsim.engine import solve_engine
    cfg = _ab_cfg(afterburner_on=True, T06_ab=2000.0)
    r = solve_engine(cfg)
    f, fab = r.performance["f"], r.performance["f_ab"]
    ab = r.afterburner
    # (1+f)Cp*T05 + eta_b*fab*Q_R == (1+f+fab)Cp*T06A
    lhs = (1 + f) * cfg.cp_h * ab["T05"] + cfg.eta_b * fab * cfg.Q_R
    rhs = (1 + f + fab) * cfg.cp_h * ab["T06"]
    assert lhs == pytest.approx(rhs, rel=1e-12)
    assert ab["p06"] == pytest.approx(ab["p05"] * (1 - cfg.delta_p_ab_pct))
    plain = solve_engine(_ab_cfg())
    assert r.performance["thrust"] > 1.2 * plain.performance["thrust"]
    assert r.performance["tsfc"] > plain.performance["tsfc"]
    assert r.performance["f_total"] == pytest.approx(f + fab)
    assert r.stations["6"].T0 == pytest.approx(2000.0)


def test_afterburner_colder_than_turbine_exit_raises():
    from aeropropsim.engine import solve_engine
    with pytest.raises(ValueError, match="afterburner exit temperature"):
        solve_engine(_ab_cfg(afterburner_on=True, T06_ab=900.0))


def test_off_design_rejects_lit_afterburner():
    from aeropropsim.off_design import lock_design_point, OffDesignError
    with pytest.raises(OffDesignError, match="afterburner"):
        lock_design_point(_ab_cfg(afterburner_on=True))
