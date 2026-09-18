"""
Single-spool turboprop solver: physical-sanity and cross-module
consistency checks.

Ref: reference/turboprop.md. No fully worked numerical example exists in
either source for a turboprop, so these are internal-consistency checks
(plus one order-of-magnitude cross-check against the source's own cited
typical ESFC value) rather than external validation.
"""

import pytest
from aeropropsim.turboprop import TurbopropConfig, solve_turboprop


def _default_config(**overrides):
    cfg = TurbopropConfig(
        altitude_m=6000.0, mach_flight=0.5,
        compressor_type="axial", n_compressor_stages=8, pi_c=10.0,
        T04=1400.0, turbine_type="axial", n_turbine_stages=2,
        alpha=0.85, mdot_a=10.0,
    )
    for k, v in overrides.items():
        setattr(cfg, k, v)
    return cfg


@pytest.mark.parametrize("mach,alt,pi_c,T04,alpha", [
    (0.5, 6000.0, 10.0, 1400.0, 0.85),
    (0.3, 3000.0, 8.0, 1300.0, 0.80),
    (0.6, 7000.0, 14.0, 1500.0, 0.90),
])
def test_turboprop_solves_without_error_and_is_physically_sane(mach, alt, pi_c, T04, alpha):
    cfg = _default_config(mach_flight=mach, altitude_m=alt, pi_c=pi_c, T04=T04, alpha=alpha)
    result = solve_turboprop(cfg)

    # Same six stations as the turbojet.
    assert set(result.stations.keys()) == {"a", "2", "3", "4", "5", "9"}

    # Compressor raises both temperature and pressure, hits its target PR
    # exactly — identical guarantee to the turbojet (same compressor.py).
    assert result.compressor["T01_out"] > result.intake["T02"]
    assert result.compressor["pi_actual"] == pytest.approx(pi_c, rel=1e-9)

    # Fuel-air ratio small and positive.
    assert 0.0 < result.combustor["f"] < 0.05

    # Turbine drops both temperature and pressure below combustor-exit.
    assert result.stations["5"].T0 < result.stations["4"].T0
    assert result.turbine["pr_actual"] < 1.0

    # Turbine stage-stack reproduces the alpha-split-mandated expansion
    # ratio exactly (same guarantee as test_turbine_stacking.py).
    assert result.turbine["pr_actual"] == pytest.approx(
        result.stations["5"].p0 / result.stations["4"].p0, rel=1e-9
    )

    # Most of the thrust should come from the propeller, not the residual
    # jet, at a typical 80-90% alpha split (reference/turboprop.md §1).
    assert result.propeller["Tpr"] > result.propeller["Tn"]

    # Positive net thrust and positive equivalent shaft power.
    assert result.performance["thrust"] > 0
    assert result.performance["ESHP_W"] > 0

    # ESFC should be in the right order of magnitude vs. the source's own
    # cited typical value (~0.27236 kg/(kW*hr), reference/turboprop.md §3)
    # — not an exact match (that number isn't tied to this specific
    # operating point), just a sanity band.
    assert 0.05 < result.performance["ESFC_kg_per_kWh"] < 1.0


def test_turboprop_static_zero_mach_raises():
    """Propeller thrust divides by flight speed (reference/turboprop.md
    §2.2) — this model doesn't implement the source's separate static/
    ground-test equivalent-power formulas (§2.4), so mach_flight=0 should
    raise rather than divide by zero silently."""
    cfg = _default_config(mach_flight=0.0)
    with pytest.raises(ValueError, match="mach_flight must be > 0"):
        solve_turboprop(cfg)


def test_turboprop_higher_alpha_shifts_thrust_toward_propeller():
    """Raising alpha sends more of the turbine's available enthalpy drop
    to the shaft (propeller) and less to the nozzle (reference/
    turboprop.md §2.2) — propeller thrust should rise and nozzle thrust
    should fall as alpha increases, holding everything else fixed."""
    low = solve_turboprop(_default_config(alpha=0.75))
    high = solve_turboprop(_default_config(alpha=0.95))
    assert high.propeller["Tpr"] > low.propeller["Tpr"]
    assert high.propeller["Tn"] < low.propeller["Tn"]
