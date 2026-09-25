"""
Off-design / component-map matching for a FIXED piece of hardware.

NOT IN SOURCE. Everything else in this project solves one single design
point per call (engine.solve_engine): you hand it a compressor pressure
ratio, a TIT, a mass flow, etc. and it sizes a cycle to hit those targets
exactly. That's the right tool for designing an engine, but it is not
what a real, already-built engine does in the air — a real engine has
FIXED hardware (a compressor wheel, a turbine, a fixed nozzle throat),
and as altitude, Mach number and throttle change, its actual operating
point drifts along that fixed hardware's own performance characteristics
rather than magically re-solving to a fresh "design" cycle every time.
Mission Analysis, before this module existed, was doing exactly that
re-solve — this module is what fixes it.

The reference textbook this whole project is built from explicitly scopes
this out (see README "Known limitations"): true off-design matching needs
compressor and turbine performance MAPS, and the reference never supplies
any. Rather than fake that data or skip the feature, this module borrows
the standard method for exactly this situation from the broader
gas-turbine literature — Cohen, Rogers & Saravanamuttoo, "Gas Turbine
Theory" (the standard English-language reference for this specific
problem) — and pairs it with a generic, clearly-synthetic compressor map
(compressor_map.py) since no real map is available. Every number this
module produces should be read as "the standard method's answer given a
generic map calibrated to this design point," not as validated against
any specific real compressor.

The matching method, in outline
--------------------------------
A single-spool turbojet's fixed hardware has, in the classical treatment,
two places that choke across most of the flight envelope: the turbine
nozzle guide vanes (NGVs) just downstream of the combustor, and the
propelling (exhaust) nozzle itself. Cohen/Rogers/Saravanamuttoo's key
simplifying result is this: WHENEVER BOTH stay choked, the turbine's
temperature ratio T05/T04 and pressure ratio p05/p04 are pinned to
CONSTANT values, independent of engine operating condition — because a
choked nozzle's non-dimensional mass-flow parameter (mdot*sqrt(T0)/p0) is
fixed by its geometry alone, and having that hold at BOTH the NGVs and
the propelling nozzle simultaneously algebraically forces the ratio
between the two stations' temperatures and pressures to stay fixed too.
This project locks those two ratios (`r_t05_t04`, `r_p05_p04`) once, from
the design-point solve, and reuses them at every off-design condition —
so off-design and design-point results agree on the turbine's operating
ratios by construction, and differ only in what the compressor and
combustor are doing.

With T05/T04 and p05/p04 fixed, the real unknowns at any flight condition
are: the compressor's non-dimensional (corrected) speed Nr and its
non-dimensional (corrected) flow mr, relative to the locked design point
(Nr=mr=1 there). This module finds them with two nested root-finds:

  1. INNER (`_solve_operating_point_at_speed`): for a trial Nr, find the
     mr on that speed line where the turbine's fixed choked-flow capacity
     (`k_turbine`, also locked at the design point) is exactly satisfied
     by the compressor's mass flow — i.e., the point on the compressor's
     Nr speed-line that is actually compatible with the fixed turbine.
     Nested inside this is a 1-D solve for T04 itself: T04 is NOT a free
     input in true off-design (see module docstring above) — it's
     whatever value satisfies the compressor/turbine SHAFT POWER BALANCE
     at that (Nr, mr), using the same first-principles balance as
     matching.turbine_temp_ratio, just solved for T04 instead of T05.

  2. OUTER (`solve_off_design`): the user still thinks in terms of "set
     a throttle" (T04), like the rest of this project's UI — so the
     outer loop searches over Nr until the INNER loop's resulting T04
     lands on the user's requested target. This keeps the UI/config
     mental model unchanged (T04 as the throttle) while the underlying
     physics correctly treats corrected speed, not TIT, as the
     independent variable a fixed-hardware engine actually responds to.

v1 scope: axial compressor design points only (compressor_map.py's
generic characteristic is shaped for an axial stage-stack; a centrifugal
off-design characteristic would need an entirely different generic map
and is not attempted here), and a convergent propelling nozzle only (the
constant-turbine-ratio derivation above assumes a single choked throat at
the propelling nozzle; a convergent-divergent nozzle's off-design
behavior — over/under-expansion, shock structure in the diverging section
— is a materially different problem, left for future work). Both
restrictions are enforced in `lock_design_point`.
"""

import math
from dataclasses import dataclass, field
from typing import Optional

from . import constants as C
from .engine import EngineConfig, solve_engine
from .atmosphere import isa_troposphere
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .nozzle import (
    critical_pressure, is_choked, choked_exit_temperature,
    choked_exit_velocity, unchoked_exit_velocity, thrust as nozzle_thrust,
)
from .performance import specific_thrust as perf_specific_thrust, tsfc as perf_tsfc
from .gasstate import Station, critical_pressure_ratio
from .compressor_map import map_point


class OffDesignError(ValueError):
    """Raised when a requested off-design point is outside this model's
    valid envelope — either the design point itself doesn't satisfy this
    method's own preconditions (see `lock_design_point`), or a specific
    (altitude, Mach, T04_target) triple has no solution reachable within
    the generic map's physical range (roughly idle to a modest overspeed
    margin — see DESIGN POINT NOTES in `lock_design_point`'s docstring).
    This is a real modeling boundary, not a bug: a fixed-geometry engine
    genuinely cannot reach every combination of altitude/Mach/TIT, and
    this project would rather say so clearly than extrapolate silently.
    """


# ---------------------------------------------------------------------------
# Generic 1-D root-finding helpers.
#
# NOT IN SOURCE (plain numerical-methods utilities, not physics). Written
# from scratch rather than reaching for scipy, matching this project's
# zero-runtime-dependency footprint (see pyproject.toml) and keeping the
# algorithm trivial to port line-for-line to the JS site, same as every
# other module here.
# ---------------------------------------------------------------------------

def _bisect(residual, lo: float, hi: float, flo: float, fhi: float,
            tol: float = 1e-9, max_iter: int = 200) -> float:
    """Standard bisection given an already-bracketed sign change
    (flo, fhi already evaluated and of opposite sign — callers here go
    through `_expanding_bracket_solve`, which guarantees this)."""
    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        fm = residual(mid)
        if fm == 0.0:
            return mid
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi, fhi = mid, fm
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def _expanding_bracket_solve(residual, x0: float, init_step: float,
                              growth: float = 1.6, max_expand: int = 40,
                              x_lo_hard: Optional[float] = None,
                              x_hi_hard: Optional[float] = None,
                              tol: float = 1e-9, name: str = "") -> float:
    """Search outward from an initial guess x0 for a sign change in
    `residual`, widening the search window geometrically each attempt,
    then bisect once one is found.

    This project's off-design equations don't have an analytically known
    bracket ahead of time (the feasible range genuinely shrinks as the
    operating point moves away from the design point — see off_design.py
    module docstring), so a fixed bracket either misses the root entirely
    at some conditions or spans regions where the underlying map/combustor
    formulas aren't even physically valid. Starting AT a good guess (the
    design-point value, x0) and growing outward is both more robust and
    mirrors how a real root-finder would be used on this kind of problem.

    `x_lo_hard`/`x_hi_hard` are optional hard walls (e.g. this model's
    idle/overspeed Nr envelope) — the search window is clipped to them
    and expansion stops once both walls are reached without a bracket,
    raising `OffDesignError` (this operating point is outside the model's
    valid range, not a numerical bug).
    """
    f0 = residual(x0)
    if f0 == 0.0:
        return x0
    w = init_step
    lo = hi = x0
    for _ in range(max_expand):
        lo = x0 - w
        hi = x0 + w
        if x_lo_hard is not None:
            lo = max(lo, x_lo_hard)
        if x_hi_hard is not None:
            hi = min(hi, x_hi_hard)
        flo = residual(lo)
        fhi = residual(hi)
        if (flo > 0) != (fhi > 0):
            return _bisect(residual, lo, hi, flo, fhi, tol=tol)
        hit_lo_wall = x_lo_hard is not None and lo <= x_lo_hard
        hit_hi_wall = x_hi_hard is not None and hi >= x_hi_hard
        if hit_lo_wall and hit_hi_wall:
            break
        w *= growth
    raise OffDesignError(
        f"off-design solve[{name}]: no self-consistent operating point found "
        f"searching around {x0:.4g} (last window tried: [{lo:.4g}, {hi:.4g}]). "
        f"This usually means the requested condition is outside this fixed "
        f"hardware's reachable envelope (too far below idle, or would need "
        f"more overspeed than this generic model allows) — try a less "
        f"extreme altitude/Mach/throttle combination."
    )


# ---------------------------------------------------------------------------
# Design-point locking.
# ---------------------------------------------------------------------------

@dataclass
class DesignPoint:
    """Everything about one design-point solve worth freezing so later
    off-design queries can treat the hardware as fixed. Build with
    `lock_design_point`, not directly.
    """
    cfg: EngineConfig
    T04_design: float
    r_t05_t04: float          # T05/T04, held fixed at every off-design point
    r_p05_p04: float          # p05/p04, held fixed at every off-design point
    pi_c_design: float        # compressor overall pressure ratio at design
    eta_c_design: float       # single-step isentropic efficiency that exactly
                              # reproduces the design point's actual T03 (see
                              # `lock_design_point`'s docstring for why this is
                              # NOT the same number as
                              # compressor.overall_isentropic_efficiency)
    mc2_design: float         # compressor corrected mass flow, design point
    k_turbine: float          # turbine (+ NGV) choked mass-flow capacity
    a_exit_design: float      # nozzle exit area at the design point, m^2
    mdot_a_design: float


def lock_design_point(cfg: EngineConfig) -> DesignPoint:
    """Run the normal single-design-point solve and freeze the constants
    this module's off-design matching needs.

    Restrictions (v1 — see module docstring):
      - cfg.compressor_type must be "axial".
      - cfg.nozzle_type must be "convergent".
      - the design point's nozzle must be choked, and its turbine
        pressure ratio must be above the hot-gas choking threshold —
        both NGVs and the propelling nozzle choked is the physical
        precondition this whole method rests on (see module docstring).
        A design point picked well inside the usual §10 default ranges
        (moderate-to-high pi_c, TIT a four-figure Kelvin number) satisfies
        this comfortably; only a very low-pressure-ratio, low-TIT design
        point is likely to fail these checks.

    Raises OffDesignError if any of the above don't hold.
    """
    if cfg.compressor_type != "axial":
        raise OffDesignError(
            f"lock_design_point: off-design matching (v1) only supports an "
            f"axial-compressor design point (got compressor_type={cfg.compressor_type!r}) "
            f"— the generic compressor map is shaped for an axial stage-stack."
        )
    if getattr(cfg, "afterburner_on", False):
        raise OffDesignError(
            "lock_design_point: off-design matching (v1) doesn't model a lit "
            "afterburner (the nozzle throat would have to open up to keep the "
            "turbine's operating point, a variable-nozzle problem not modelled here)."
        )
    if cfg.nozzle_type != "convergent":
        raise OffDesignError(
            f"lock_design_point: off-design matching (v1) only supports a "
            f"convergent propelling nozzle (got nozzle_type={cfg.nozzle_type!r}) "
            f"— the fixed-T05/T04 derivation assumes one choked throat at the "
            f"propelling nozzle; a convergent-divergent nozzle's off-design "
            f"behavior is a different problem, not modelled here."
        )

    design = solve_engine(cfg)

    if not design.nozzle["choked"]:
        raise OffDesignError(
            "lock_design_point: this design point's propelling nozzle is not "
            "choked. This method's off-design matching relies on both the "
            "turbine NGVs and the propelling nozzle staying choked (see module "
            "docstring) — pick a design point with a higher pressure ratio "
            "and/or TIT so the nozzle chokes at the design condition."
        )
    p04_over_p05 = 1.0 / design.shaft["p05_over_p04"]
    pr_crit_hot = 1.0 / critical_pressure_ratio(cfg.gamma_h)
    if p04_over_p05 < pr_crit_hot:
        raise OffDesignError(
            f"lock_design_point: this design point's turbine pressure ratio "
            f"({p04_over_p05:.3f}) is below the ~{pr_crit_hot:.3f} needed for "
            f"choked NGVs, which this off-design method assumes hold at every "
            f"operating point — pick a design point with a higher pressure "
            f"ratio and/or TIT."
        )

    T02_d, p02_d = design.intake["T02"], design.intake["p02"]
    T03_d = design.compressor["T01_out"]
    pi_c_design = design.compressor["pi_actual"]
    f_design = design.combustor["f"]
    p04_design = design.combustor["p04"]

    # Calibrate a single-step isentropic efficiency that reproduces the
    # ACTUAL (stage-stacked) design-point T03 exactly at (Nr=1, mr=1) —
    # deliberately not the same quantity as
    # compressor.overall_isentropic_efficiency, which answers a related
    # but different question (relating overall eta_c to an assumed
    # constant POLYTROPIC efficiency, not to this exact design T03). Using
    # that different number here would make the off-design solve disagree
    # with the design point it's supposed to exactly reproduce at Nr=1.
    exp_c = (cfg.gamma_c - 1.0) / cfg.gamma_c
    eta_c_design = (pi_c_design ** exp_c - 1.0) / (T03_d / T02_d - 1.0)

    mc2_design = cfg.mdot_a * math.sqrt(T02_d) / p02_d
    k_turbine = cfg.mdot_a * (1.0 + f_design) * math.sqrt(cfg.T04) / p04_design

    return DesignPoint(
        cfg=cfg,
        T04_design=cfg.T04,
        r_t05_t04=design.shaft["T05_over_T04"],
        r_p05_p04=design.shaft["p05_over_p04"],
        pi_c_design=pi_c_design,
        eta_c_design=eta_c_design,
        mc2_design=mc2_design,
        k_turbine=k_turbine,
        a_exit_design=design.nozzle["A_exit"],
        mdot_a_design=cfg.mdot_a,
    )


# ---------------------------------------------------------------------------
# The matching solve itself.
# ---------------------------------------------------------------------------

@dataclass
class OffDesignResult:
    design_point: DesignPoint
    altitude_m: float
    mach_flight: float
    Nr: float                 # converged corrected speed, relative to design
    mr: float                 # converged corrected flow, relative to design
    T04: float                # = the requested target, echoed back
    f: float
    mdot_a: float
    thrust: float
    tsfc: float
    specific_thrust: float
    nozzle_choked: bool
    stations: dict = field(default_factory=dict)


def _compressor_state(dp: DesignPoint, T02: float, p02: float, Nr: float, mr: float):
    """T03, p03, mdot_a at a trial (Nr, mr), from the generic map."""
    m = map_point(Nr, mr, dp.pi_c_design, dp.eta_c_design)
    cfg = dp.cfg
    exp_c = (cfg.gamma_c - 1.0) / cfg.gamma_c
    p03 = p02 * m["pi_c"]
    T03 = T02 * (1.0 + (m["pi_c"] ** exp_c - 1.0) / m["eta_c"])
    mc2 = mr * dp.mc2_design
    mdot_a = mc2 * p02 / math.sqrt(T02)
    return T03, p03, mdot_a


def _solve_T04_from_shaft_balance(dp: DesignPoint, T02: float, T03: float) -> float:
    """The T04 that satisfies the shaft power balance for this compressor
    state, given the design point's fixed turbine temperature ratio
    r_t05_t04 — see module docstring for why T04 (not T05) is the unknown
    here. Mirrors matching.turbine_temp_ratio's physics, solved in the
    other direction.
    """
    cfg = dp.cfg
    compressor_work = cfg.cp_c * (T03 - T02)

    def residual(T04: float) -> float:
        f = fuel_air_ratio(T03, T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
        turbine_capacity = (cfg.lambda_shaft * cfg.eta_m * (1.0 + f) * cfg.cp_h
                            * T04 * (1.0 - dp.r_t05_t04))
        return turbine_capacity - compressor_work

    x0 = T03 * 1.5
    return _expanding_bracket_solve(
        residual, x0, T03 * 0.15, x_lo_hard=T03 * 1.0001, x_hi_hard=2400.0,
        name="T04 (shaft balance)",
    )


def _solve_operating_point_at_speed(dp: DesignPoint, T02: float, p02: float, Nr: float) -> dict:
    """Inner loop: find the mr on this Nr speed-line that is
    mass-flow-compatible with the turbine's fixed choked capacity, and
    the T04 the shaft balance then requires."""
    cfg = dp.cfg

    def residual(mr: float) -> float:
        T03, p03, mdot_a = _compressor_state(dp, T02, p02, Nr, mr)
        T04v = _solve_T04_from_shaft_balance(dp, T02, T03)
        fv = fuel_air_ratio(T03, T04v, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
        p04v = combustor_exit_pressure(p03, cfg.delta_p_cc_pct)
        mdot_from_choking = dp.k_turbine * p04v / math.sqrt(T04v) / (1.0 + fv)
        return mdot_from_choking - mdot_a

    mr_final = _expanding_bracket_solve(
        residual, Nr * 1.0, Nr * 0.05, x_lo_hard=Nr * 0.3, x_hi_hard=Nr * 1.65,
        name="mr (mass-flow compatibility)",
    )
    T03, p03, mdot_a = _compressor_state(dp, T02, p02, Nr, mr_final)
    T04v = _solve_T04_from_shaft_balance(dp, T02, T03)
    fv = fuel_air_ratio(T03, T04v, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04v = combustor_exit_pressure(p03, cfg.delta_p_cc_pct)
    return {"mr": mr_final, "T04": T04v, "T03": T03, "p03": p03,
            "mdot_a": mdot_a, "f": fv, "p04": p04v}


# Default hard walls for the outer (Nr) search — roughly a real
# single-spool turbojet's idle-to-modest-overspeed envelope. NOT IN
# SOURCE (no textbook basis for these exact numbers); chosen generously
# wide relative to typical real engines (which usually run ~65-103% N)
# so this model's own feasibility limits (see off_design.py module
# docstring) are what actually stops an unreachable query, rather than
# these walls doing it prematurely.
NR_LO_HARD = 0.25
NR_HI_HARD = 1.3


def solve_off_design(dp: DesignPoint, altitude_m: float, mach_flight: float,
                      T04_target: float, Nr_guess: float = 1.0) -> OffDesignResult:
    """Solve for this fixed hardware's actual operating point at a given
    flight condition and throttle (expressed as target TIT, matching this
    project's existing config/UI convention).

    Args:
        dp: a locked DesignPoint (see `lock_design_point`).
        altitude_m, mach_flight: flight condition (same envelope/limits as
            engine.solve_engine — isa_troposphere's 0-11000 m range).
        T04_target: desired turbine inlet temperature, K. NOTE: unlike
            engine.solve_engine, this is not directly imposed — it is the
            target the outer Nr search converges to (see module
            docstring's "matching method" section for why TIT is an
            output of the real physics, not a free input).
        Nr_guess: starting guess for the corrected-speed search — the
            default (the design point itself) is a good starting guess
            for most nearby conditions; only worth overriding for a
            targeted retry after an OffDesignError.

    Returns:
        OffDesignResult with the converged operating point, performance,
        and a `stations` table shaped like engine.EngineResult's, so
        existing station/diagram UI components can be reused unchanged.

    Raises:
        OffDesignError: this (altitude, Mach, T04_target) combination has
            no solution within this fixed hardware's reachable envelope.
    """
    cfg = dp.cfg
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    T_a, p_a = isa_troposphere(altitude_m)
    intake = intake_exit_state(T_a, p_a, mach_flight, cfg.eta_d, cfg.gamma_c)
    T02, p02 = intake["T02"], intake["p02"]
    V_flight = mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5

    def outer_residual(Nr: float) -> float:
        st = _solve_operating_point_at_speed(dp, T02, p02, Nr)
        return st["T04"] - T04_target

    Nr_final = _expanding_bracket_solve(
        outer_residual, Nr_guess, 0.05, x_lo_hard=NR_LO_HARD, x_hi_hard=NR_HI_HARD,
        name="Nr (corrected speed)",
    )
    st = _solve_operating_point_at_speed(dp, T02, p02, Nr_final)
    T03, p03, mdot_a, f, p04 = st["T03"], st["p03"], st["mdot_a"], st["f"], st["p04"]

    T05 = dp.r_t05_t04 * T04_target
    p05 = dp.r_p05_p04 * p04

    p_c = critical_pressure(p05, cfg.eta_N, cfg.gamma_h)
    choked = is_choked(p_c, p_a)
    if choked:
        T_exit = choked_exit_temperature(T05, cfg.gamma_h)
        V_exit = choked_exit_velocity(T_exit, cfg.gamma_h, R_h)
        p_exit = p_c
    else:
        V_exit = unchoked_exit_velocity(T05, p_a, p05, cfg.eta_N, cfg.gamma_h, cfg.cp_h)
        p_exit = p_a
        T_exit = T05 - V_exit ** 2 / (2.0 * cfg.cp_h)

    rho_exit = p_exit / (R_h * T_exit)
    A_exit = dp.a_exit_design  # fixed geometry — NOT recomputed off-design
    T_val = nozzle_thrust(mdot_a, f, V_exit, V_flight, p_exit, p_a, A_exit)
    sp_thrust = perf_specific_thrust(f, V_exit, V_flight, A_exit, mdot_a, p_exit, p_a)
    tsfc_val = perf_tsfc(f, sp_thrust)

    stations = {
        "a": Station("a", *_freestream_stagnation(T_a, p_a, mach_flight, cfg.gamma_c),
                     cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", T04_target, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "5": Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "9": Station.from_static("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
    }

    return OffDesignResult(
        design_point=dp, altitude_m=altitude_m, mach_flight=mach_flight,
        Nr=Nr_final, mr=st["mr"], T04=T04_target, f=f, mdot_a=mdot_a,
        thrust=T_val, tsfc=tsfc_val, specific_thrust=sp_thrust,
        nozzle_choked=choked, stations=stations,
    )


def _freestream_stagnation(T_a, p_a, M, gamma_c):
    from .atmosphere import freestream_stagnation
    return freestream_stagnation(T_a, p_a, M, gamma_c)
