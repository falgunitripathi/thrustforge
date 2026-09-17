"""
Ramjet solver: physical-sanity and cross-module consistency checks.

Ref: reference/ramjet.md. Neither source in that reference has a fully
worked numerical example for a ramjet (unlike the turbojet's Ganesan
Worked Example 7.5) — these are internal-consistency checks only, not
external validation. See reference/ramjet.md §4.4 for that gap.
"""

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
def test_ramjet_solves_without_error_and_is_physically_sane(mach, alt, T04):
    cfg = _default_config(mach_flight=mach, altitude_m=alt, T04=T04)
    result = solve_ramjet(cfg)

    # No compressor/turbine: stations 3 and 5 don't exist for a ramjet.
    assert set(result.stations.keys()) == {"a", "2", "4", "9"}

    # No compression before the combustor: T02 == T03 in turbojet terms,
    # i.e. the combustor sees the intake's own exit state directly.
    assert result.combustor["T04"] == T04

    # Fuel-air ratio should be small and positive, same physical range as
    # the turbojet's (this reuses combustor.fuel_air_ratio verbatim).
    assert 0.0 < result.combustor["f"] < 0.05

    # Net thrust must be positive. Note this does NOT require V_exit to
    # exceed V_flight on its own: at high supersonic Mach relative to T04,
    # a convergent-only nozzle chokes at a sonic exit velocity that can
    # come out BELOW V_flight (the source's Me=M ideal-cycle result
    # doesn't hold once component losses are real and the nozzle is
    # choked) — thrust then comes mostly from the pressure term
    # (p_exit-p_a)*A_exit rather than momentum, which is exactly why real
    # high-Mach ramjets/scramjets use a convergent-divergent nozzle
    # instead (reference/ramjet.md doesn't model C-D geometry for the
    # ramjet yet — see module docstring).
    assert result.performance["thrust"] > 0


def test_ramjet_static_zero_mach_is_non_physical_and_raises():
    """A ramjet produces ~zero static thrust (reference/ramjet.md §1) — at
    M=0 there is no ram pressure rise at all (p02 == p_a), so with a
    nonzero combustor pressure loss the resulting p04 is BELOW ambient:
    there is no physically valid unchoked nozzle solution (the flow can't
    expand to an ambient pressure higher than its own stagnation
    pressure). This is the "cannot self-start" property, made concrete —
    solve_ramjet correctly raises here rather than silently returning a
    meaningless number, the same fail-loud behavior as
    nozzle.unchoked_exit_velocity's own non-physical-input check."""
    cfg = _default_config(mach_flight=0.0, altitude_m=0.0, T04=1800.0)
    with pytest.raises(ValueError, match="non-physical"):
        solve_ramjet(cfg)


def test_ramjet_higher_flight_mach_raises_ram_pressure_recovery():
    """Ram pressure ratio should increase monotonically with flight Mach
    (reference/ramjet.md §2.1) — this is the ramjet's defining behavior:
    performance is tied to M, not to an independently-set spool pressure
    ratio like the turbojet's pi_c."""
    low = solve_ramjet(_default_config(mach_flight=1.5, altitude_m=11000.0))
    high = solve_ramjet(_default_config(mach_flight=3.0, altitude_m=11000.0))
    low_pr = low.intake["p02"] / low.atmosphere["p_a"]
    high_pr = high.intake["p02"] / high.atmosphere["p_a"]
    assert high_pr > low_pr
