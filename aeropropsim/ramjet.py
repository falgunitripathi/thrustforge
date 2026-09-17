"""
Ramjet — no-compressor, no-turbine engine: intake ram compression,
combustor, nozzle, thrust.

Ref: `reference/ramjet.md` §2 (compiled from NPTEL "Introduction to
Airbreathing Propulsion", Lectures 25-26, and Ganesan "Gas Turbines" 3e
§7.3, cross-checked against each other — see that file for full
provenance, formula derivations, and flagged judgment calls).

Architecture note: a ramjet is thermodynamically a turbojet with the
compressor and turbine removed — there is no shaft, so nothing raises
pressure between the intake and the combustor (T03=T02, p03=p02 in the
turbojet's own station numbering) and nothing extracts work between the
combustor and the nozzle (T05=T04, p05=p04). This module does NOT
reimplement intake/combustor/nozzle physics: it reuses
`intake.intake_exit_state`, `combustor.fuel_air_ratio`/
`combustor_exit_pressure`, and every `nozzle.py` function exactly as the
turbojet does, since `reference/ramjet.md` §2.11's real-cycle fuel-air
ratio and §2.3/§2.4's nozzle relations are algebraically identical to the
turbojet's combustor/nozzle formulas with T0a substituted for T03 (no
compressor rise) and T04/p04 substituted for T05/p05 (no turbine drop).
Only the orchestration (which steps to skip) is ramjet-specific, which is
what lives in this file.

Known gap (see reference/ramjet.md §4.4): neither source in the reference
material has a fully worked numerical example for a ramjet, unlike the
turbojet's Ganesan Worked Example 7.5 — so this module has internal-
consistency tests only, no external absolute-number validation yet.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .nozzle import (
    critical_pressure, is_choked, choked_exit_temperature,
    choked_exit_velocity, unchoked_exit_velocity, thrust as nozzle_thrust,
)
from .performance import (
    specific_thrust as perf_specific_thrust, tsfc as perf_tsfc,
    thermal_efficiency, propulsive_efficiency, overall_efficiency_from_components,
)
from .gasstate import Station


@dataclass
class RamjetConfig:
    # --- Flight condition --- Ramjets only make sense well above M~1 (see
    # reference/ramjet.md §3: best-efficiency range M2-5); zero static
    # thrust means M=0 is a degenerate-but-valid input (thrust ~ 0), not an
    # error — a ramjet just can't self-start there.
    altitude_m: float = 11000.0
    mach_flight: float = 2.5

    # --- Combustor --- T04 default is much higher than the turbojet's
    # (1400 K) since there's no turbine blade to protect — reference/
    # ramjet.md §3 gives ~1500-2000 K typical, ~2273 K (2000 C) max.
    T04: float = 1800.0

    # --- Mass flow ---
    mdot_a: float = 1.0

    # --- Efficiencies / constants --- NOT IN SOURCE for the ramjet
    # specifically (reference/ramjet.md §3's last bullet) — carried over
    # from the turbojet's own constants.DEFAULTS as the best available
    # provisional numbers, same NOT-IN-SOURCE caveat as constants.py.
    eta_d: float = C.DEFAULTS["eta_d"]
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]
    eta_N: float = C.DEFAULTS["eta_N"]

    # gas properties
    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class RamjetResult:
    config: RamjetConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def solve_ramjet(cfg: RamjetConfig) -> RamjetResult:
    """Solve one single-design-point ramjet cycle.

    Solve order (mirrors engine.solve_engine minus the compressor/turbine/
    shaft steps, which don't exist in a ramjet): atmosphere -> intake ->
    combustor -> nozzle -> performance.
    """
    result = RamjetResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    # --- Atmosphere ---
    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V_flight,
                          "T0a": T0a, "p0a": p0a}

    # --- Intake / diffuser (station 2, no compressor after it: T03=T02,
    # p03=p02, so "T02"/"p02" ARE the combustor-inlet state directly) ---
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c)
    result.intake = intake
    T02, p02 = intake["T02"], intake["p02"]

    # --- Combustor (reuses the turbojet's own fuel-air-ratio formula —
    # see this module's docstring for why T02/p02 stand in for T03/p03) ---
    f = fuel_air_ratio(T02, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04 = combustor_exit_pressure(p02, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "p04": p04, "T04": cfg.T04}

    # --- Nozzle (no turbine before it: T05=T04, p05=p04 stand in as the
    # nozzle-inlet state) ---
    p_c = critical_pressure(p04, cfg.eta_N, cfg.gamma_h)
    choked = is_choked(p_c, p_a)
    if choked:
        T_exit = choked_exit_temperature(cfg.T04, cfg.gamma_h)
        V_exit = choked_exit_velocity(T_exit, cfg.gamma_h, R_h)
        p_exit = p_c
    else:
        V_exit = unchoked_exit_velocity(cfg.T04, p_a, p04, cfg.eta_N, cfg.gamma_h, cfg.cp_h)
        p_exit = p_a
        T_exit = cfg.T04 - V_exit ** 2 / (2.0 * cfg.cp_h)

    rho_exit = p_exit / (R_h * T_exit)
    Ae_over_mdot_a = (1.0 + f) / (rho_exit * V_exit)
    A_exit = Ae_over_mdot_a * cfg.mdot_a

    T_val = nozzle_thrust(cfg.mdot_a, f, V_exit, V_flight, p_exit, p_a, A_exit)
    result.nozzle = {"choked": choked, "p_c": p_c, "p_exit": p_exit,
                      "T_exit": T_exit, "V_exit": V_exit, "rho_exit": rho_exit,
                      "A_exit": A_exit}

    # --- Overall performance ---
    sp_thrust = perf_specific_thrust(f, V_exit, V_flight, A_exit, cfg.mdot_a, p_exit, p_a)
    tsfc_val = perf_tsfc(f, sp_thrust)
    eta_th = thermal_efficiency(f, V_exit, V_flight, cfg.Q_R) if V_flight > 0 or f > 0 else None
    eta_p = propulsive_efficiency(V_flight, V_exit) if V_flight > 0 else 0.0
    eta_0 = overall_efficiency_from_components(eta_th, eta_p) if eta_th is not None else None
    result.performance = {
        "thrust": T_val, "specific_thrust": sp_thrust, "tsfc": tsfc_val,
        "eta_thermal": eta_th, "eta_propulsive": eta_p, "eta_overall": eta_0,
        "f": f,
    }

    # --- Key-station table: a (freestream), 2 (diffuser exit == combustor
    # inlet, no compressor between them), 4 (combustor exit == nozzle
    # inlet, no turbine between them), 9 (nozzle exit). No stations 3/5 —
    # unlike the turbojet, there's nothing at them.
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "9": Station.from_static("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
    }

    return result
