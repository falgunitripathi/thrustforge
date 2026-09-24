"""
Ramjet — no-compressor, no-turbine engine: intake ram compression,
combustor, nozzle, thrust.

Ref: `reference/ramjet.md` §2 (compiled from NPTEL "Introduction to
Airbreathing Propulsion", Lectures 25-26, and Ganesan "Gas Turbines" 3e
§7.3; see that file's "Verification + rebuild plan" section for the
checks behind the choices below).

Architecture note: a ramjet is thermodynamically a turbojet with the
compressor and turbine removed — nothing raises pressure between the
intake and the combustor (T03=T02, p03=p02 in turbojet numbering) and
nothing extracts work between the combustor and the nozzle (T05=T04,
p05=p04). The intake/combustor/nozzle physics is reused from the turbojet
modules; only the orchestration is ramjet-specific.

Judgment calls (reference/ramjet.md, rebuild plan), resolved here:
  1. Nozzle: default "expanded" (convergent-divergent, fully expanded to
     ambient, p9 = p_a) — the ideal-cycle assumption of §2.5 and the same
     lecturer's real-cycle treatment. "convergent" (choked above ~M1.5)
     is kept as an option to show the pressure-thrust penalty.
  2. r_d = p02/p0a is computed from eta_d (§2.1), not an independent input.
  3. Efficiencies use the effective exhaust velocity
     V_eff = (F/mdot_a + V)/(1+f), which equals V_exit for the expanded
     nozzle and credits the pressure thrust of a choked one (otherwise
     eta_P > 1 and eta_th < 0 at high Mach).
  4. eta_th uses Q_R without eta_b, same convention as the turbojet
     (performance.py).

Known gap (reference/ramjet.md §4.4): no worked numerical example in
either source, so tests are internal-consistency checks, including the
lossless limit against NPTEL's closed-form ideal specific thrust (§2.7).
Atmosphere is the ISA troposphere (0-11 km) only.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .nozzle import (
    critical_pressure, is_choked, choked_exit_temperature,
    choked_exit_velocity, unchoked_exit_velocity,
)
from .performance import (
    thermal_efficiency, propulsive_efficiency, overall_efficiency_from_components,
)
from .gasstate import Station


@dataclass
class RamjetConfig:
    # --- Flight condition --- best-efficiency range M2-5 (§3).
    altitude_m: float = 11000.0
    mach_flight: float = 2.5

    # --- Combustor --- no turbine blade to protect: ~1500-2000 K typical,
    # ~2273 K (2000 C) max (§3).
    T04: float = 1800.0

    # --- Nozzle --- "expanded" (C-D, p_exit = p_a) or "convergent".
    nozzle_type: str = "expanded"

    mdot_a: float = 1.0

    # --- Efficiencies / constants --- carried over from the turbojet's
    # defaults (no ramjet-specific values in the source, §3).
    eta_d: float = C.DEFAULTS["eta_d"]
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]
    eta_N: float = C.DEFAULTS["eta_N"]

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
    """Solve one design-point ramjet cycle: atmosphere -> intake ->
    combustor -> nozzle -> performance."""
    if cfg.nozzle_type not in ("expanded", "convergent"):
        raise ValueError(
            f"solve_ramjet: nozzle_type must be 'expanded' or 'convergent', "
            f"got {cfg.nozzle_type!r}."
        )
    if not (cfg.mach_flight > 0):
        raise ValueError(
            "solve_ramjet: a ramjet can't run at zero flight speed. It has no "
            "compressor, so it needs forward speed to compress the air; real "
            "ramjets are boosted to speed by a rocket or a carrier aircraft."
        )

    result = RamjetResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    # --- Atmosphere ---
    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V_flight,
                         "T0a": T0a, "p0a": p0a}

    # --- Intake / diffuser (station 2 = combustor inlet) ---
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c)
    T02, p02 = intake["T02"], intake["p02"]
    result.intake = {**intake, "ram_pressure_ratio": p02 / p_a}

    # --- Combustor ---
    if not (cfg.T04 > T02):
        raise ValueError(
            f"solve_ramjet: the combustor exit temperature T04 = {cfg.T04:.0f} K must be "
            f"above the air temperature arriving from the intake (T02 = {T02:.0f} K at "
            f"Mach {cfg.mach_flight:g}). Raise T04 or lower the flight Mach number."
        )
    f = fuel_air_ratio(T02, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04 = combustor_exit_pressure(p02, cfg.delta_p_cc_pct)
    if not (p04 > p_a):
        raise ValueError(
            f"solve_ramjet: too slow to run — at Mach {cfg.mach_flight:g} the ram pressure "
            f"rise (p02/p_a = {p02 / p_a:.3f}) doesn't overcome the combustor pressure "
            f"loss, so the gas can't flow out of the nozzle. Raise the flight Mach number."
        )
    result.combustor = {"f": f, "p04": p04, "T04": cfg.T04,
                        "r_c": p04 / p02}

    # --- Nozzle (station 4 = nozzle inlet) ---
    p_c = critical_pressure(p04, cfg.eta_N, cfg.gamma_h)
    choked = cfg.nozzle_type == "convergent" and is_choked(p_c, p_a)
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
    M_exit = V_exit / (cfg.gamma_h * R_h * T_exit) ** 0.5
    result.nozzle = {"choked": choked, "p_c": p_c, "p_exit": p_exit,
                     "T_exit": T_exit, "V_exit": V_exit, "M_exit": M_exit,
                     "rho_exit": rho_exit, "A_exit": A_exit}

    # --- Performance ---
    momentum = (1.0 + f) * V_exit - V_flight
    pressure_term = Ae_over_mdot_a * (p_exit - p_a)
    sp_thrust = momentum + pressure_term
    thrust = cfg.mdot_a * sp_thrust
    tsfc_val = f / sp_thrust if sp_thrust > 0 else float("nan")
    V_eff = (sp_thrust + V_flight) / (1.0 + f)  # judgment call #3
    if sp_thrust > 0:
        eta_th = thermal_efficiency(f, V_eff, V_flight, cfg.Q_R)
        eta_p = propulsive_efficiency(V_flight, V_eff)
        eta_0 = overall_efficiency_from_components(eta_th, eta_p)
    else:
        eta_th = eta_p = eta_0 = None
    result.performance = {
        "thrust": thrust, "specific_thrust": sp_thrust, "tsfc": tsfc_val,
        "momentum_thrust": momentum, "pressure_thrust": pressure_term,
        "V_eff": V_eff,
        "eta_thermal": eta_th, "eta_propulsive": eta_p, "eta_overall": eta_0,
        "f": f,
    }

    # --- Stations a, 2 (diffuser exit = combustor inlet), 4 (combustor
    # exit = nozzle inlet), 9 (nozzle exit). No 3/5: no compressor/turbine.
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "9": Station.from_static("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
    }
    return result
