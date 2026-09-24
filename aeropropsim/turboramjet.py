"""
Turboramjet (turbine-based combined cycle, TJRJ) — a turbojet for low and
moderate Mach, a ramjet for high Mach, or both at once with the air split
between two parallel flow paths.

Ref: `reference/turboramjet.md` (NPTEL "Introduction to Airbreathing
Propulsion", Lectures 32-33; §12 records the verification against the raw
transcript). Stations follow the source: turbojet leg a -> 2 (intake) ->
3 (compressor) -> 4 (combustor) -> 5 (turbine) -> 6 (afterburner) -> 7
(nozzle exit); ramjet leg a -> 8 (intake exit) -> 9 (ramjet combustor) ->
10 (nozzle exit).

Judgment calls (reference/turboramjet.md §11-12), resolved here:
  1. Turbojet-mode thrust uses (1 + f + fab)·V7 - V: the source's "-fab"
     is a transcription slip (its own efficiency formulas use +fab).
  2. Both nozzles are fully expanded (p_exit = p_a): none of the source's
     combined-cycle thrust or efficiency formulas carries a pressure term.
  3. Over-under and wrap-around are the same maths (§12 item 3): the two
     legs are independent parallel flows whose thrusts add.
  4. Switch Mach: no closed-form criterion in the source; default 3.0
     (SR-72 / SR-71 examples, Ganesan's "tend to merge" at Mach 3). In
     "auto" mode the engine is a turbojet below it and a ramjet at or
     above it.
  5. The air split beta = (mdot_a)_TJ / mdot_a in "dual" mode is a user
     input (not in source), and the combined eta_P/eta_th sum each leg's
     kinetic-energy terms over the total fuel (not in source).

The turbojet leg uses one-shot compressor/turbine relations (as the
turbofan does), not the turbojet page's stage stacking: the source says
the component equations are "already done" and only relabels them. The
turbine drives the compressor alone (work balance with eta_m). The ramjet
leg is aeropropsim.ramjet with an expanded nozzle; its efficiencies are
recomputed with the source's TBCC forms (§5) so both legs are measured the
same way.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .nozzle import unchoked_exit_velocity
from .ramjet import RamjetConfig, solve_ramjet
from .gasstate import Station

MODES = ("auto", "turbojet", "ramjet", "dual")


@dataclass
class TurboramjetConfig:
    altitude_m: float = 11000.0
    mach_flight: float = 2.0

    mode: str = "auto"            # auto | turbojet | ramjet | dual
    mach_switch: float = 3.0      # auto mode: turbojet below, ramjet at/above
    beta: float = 0.5             # dual mode: fraction of air through the turbojet

    # --- Turbojet leg ---
    pi_c: float = 8.0
    eta_c: float = 0.88           # overall compressor isentropic efficiency (source range 0.85-0.90)
    T04: float = 1400.0           # turbine inlet temperature
    eta_t: float = 0.90
    eta_m: float = C.DEFAULTS["eta_m"]
    afterburner_on: bool = True
    T06_ab: float = 2000.0        # afterburner exit temperature (T06A = Tmax)
    delta_p_ab_pct: float = 0.05  # afterburner fractional pressure loss

    # --- Ramjet leg ---
    T09: float = 1800.0           # ramjet combustor exit temperature

    mdot_a: float = 1.0           # total air mass flow

    # --- Shared ---
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
class TurboramjetResult:
    config: TurboramjetConfig
    mode_active: str = ""
    atmosphere: dict = field(default_factory=dict)
    turbojet: dict = None
    ramjet: dict = None
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def _fail(msg: str):
    raise ValueError(f"solve_turboramjet: {msg}")


def _leg_efficiencies(sp_thrust: float, V: float, V_exit: float, mass_factor: float,
                      fuel_per_air: float, Q_R: float):
    """Source §4/§5: KE = (V_exit - V)^2/2 * (1 + fuel); eta_p = FV/(FV + KE);
    eta_th = (FV + KE)/(Q_R * fuel); eta_o = eta_p * eta_th. Per unit leg air."""
    ke = 0.5 * (V_exit - V) ** 2 * mass_factor
    useful = sp_thrust * V
    eta_p = useful / (useful + ke) if (useful + ke) > 0 else None
    eta_th = (useful + ke) / (Q_R * fuel_per_air) if fuel_per_air > 0 else None
    eta_o = eta_p * eta_th if (eta_p is not None and eta_th is not None) else None
    return ke, eta_p, eta_th, eta_o


def _solve_turbojet_leg(cfg, T_a, p_a, V, R_c, R_h):
    gc, gh = cfg.gamma_c, cfg.gamma_h
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, gc)
    T02, p02 = intake["T02"], intake["p02"]

    # Compressor (one-shot): T03/T02 = 1 + (pi_c^((g-1)/g) - 1)/eta_c
    T03 = T02 * (1.0 + (cfg.pi_c ** ((gc - 1.0) / gc) - 1.0) / cfg.eta_c)
    p03 = p02 * cfg.pi_c
    if not (cfg.T04 > T03):
        _fail(
            f"turbojet mode — the compressor already delivers air at T03 = {T03:.0f} K, "
            f"hotter than the turbine inlet temperature T04 = {cfg.T04:.0f} K. At high Mach, "
            f"ram heating plus compression overheats the air: that's why a turboramjet "
            f"switches to ramjet mode. Lower π_c or the flight Mach, raise T04, or use "
            f"ramjet mode."
        )

    # Combustor
    f = fuel_air_ratio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04 = combustor_exit_pressure(p03, cfg.delta_p_cc_pct)

    # Turbine drives the compressor: cp_c(T03-T02) = eta_m(1+f)cp_h(T04-T05)
    dT_turb = cfg.cp_c * (T03 - T02) / (cfg.eta_m * (1.0 + f) * cfg.cp_h)
    T05 = cfg.T04 - dT_turb
    T05s = cfg.T04 - dT_turb / cfg.eta_t
    if not (T05s > 0):
        _fail("turbojet mode — the turbine can't supply the compressor's work. "
              "Lower π_c or raise T04.")
    p05 = p04 * (T05s / cfg.T04) ** (gh / (gh - 1.0))

    # Afterburner: T06A = Tmax, fab = (1+f)(Cp6·T06A - Cp5·T05)/(eta_b·Q_R - Cp6·T06A)
    if cfg.afterburner_on:
        if not (cfg.T06_ab > T05):
            _fail(
                f"turbojet mode — the afterburner exit temperature T06 = {cfg.T06_ab:.0f} K "
                f"must be above the turbine exit temperature T05 = {T05:.0f} K. Raise T06 "
                f"or turn the afterburner off."
            )
        denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T06_ab
        if not (denom > 0):
            _fail("turbojet mode — afterburner temperature too high for this fuel's heating value.")
        fab = (1.0 + f) * (cfg.cp_h * cfg.T06_ab - cfg.cp_h * T05) / denom
        T06 = cfg.T06_ab
        p06 = p05 * (1.0 - cfg.delta_p_ab_pct)
    else:
        fab, T06, p06 = 0.0, T05, p05

    # Nozzle, fully expanded (judgment call #2)
    if not (p06 > p_a):
        _fail(
            f"turbojet mode — the gas reaches the nozzle at {p06 / 1000:.1f} kPa, not above "
            f"the outside air pressure ({p_a / 1000:.1f} kPa), so it can't flow out. Raise π_c "
            f"or T04, or fly faster."
        )
    V7 = unchoked_exit_velocity(T06, p_a, p06, cfg.eta_N, gh, cfg.cp_h)
    T7 = T06 - V7 ** 2 / (2.0 * cfg.cp_h)

    mass = 1.0 + f + fab
    sp = mass * V7 - V  # judgment call #1 (+fab)
    fuel = f + fab
    ke, eta_p, eta_th, eta_o = _leg_efficiencies(sp, V, V7, mass, fuel, cfg.Q_R)
    leg = {
        "T02": T02, "p02": p02, "r_d": intake["r_d"],
        "T03": T03, "p03": p03, "T04": cfg.T04, "p04": p04,
        "T05": T05, "p05": p05, "T06": T06, "p06": p06,
        "T7": T7, "V7": V7, "p7": p_a,
        "f": f, "fab": fab, "fuel_air": fuel,
        "specific_thrust": sp, "ke": ke,
        "tsfc": fuel / sp if sp > 0 else float("nan"),
        "eta_propulsive": eta_p, "eta_thermal": eta_th, "eta_overall": eta_o,
        "compressor_work": cfg.cp_c * (T03 - T02),
    }
    stations = {
        "2": Station("2", T02, p02, gc, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, gc, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, gh, cfg.cp_h, R_h, V=0.0),
        "5": Station("5", T05, p05, gh, cfg.cp_h, R_h, V=0.0),
        "6": Station("6", T06, p06, gh, cfg.cp_h, R_h, V=0.0),
        "7": Station.from_static("7", T7, p_a, V7, gh, cfg.cp_h, R_h),
    }
    return leg, stations


def _solve_ramjet_leg(cfg, V, R_c, R_h):
    try:
        r = solve_ramjet(RamjetConfig(
            altitude_m=cfg.altitude_m, mach_flight=cfg.mach_flight, T04=cfg.T09,
            nozzle_type="expanded", mdot_a=1.0, eta_d=cfg.eta_d, eta_b=cfg.eta_b,
            delta_p_cc_pct=cfg.delta_p_cc_pct, Q_R=cfg.Q_R, eta_N=cfg.eta_N,
            gamma_c=cfg.gamma_c, cp_c=cfg.cp_c, gamma_h=cfg.gamma_h, cp_h=cfg.cp_h,
        ))
    except ValueError as e:
        msg = str(e).replace("solve_ramjet: ", "", 1).replace("T04", "T09")
        _fail(f"ramjet mode — {msg}")
    fR = r.combustor["f"]
    V10 = r.nozzle["V_exit"]
    mass = 1.0 + fR
    sp = mass * V10 - V
    ke, eta_p, eta_th, eta_o = _leg_efficiencies(sp, V, V10, mass, fR, cfg.Q_R)
    leg = {
        "T08": r.intake["T02"], "p08": r.intake["p02"], "r_d": r.intake["r_d"],
        "ram_pressure_ratio": r.intake["ram_pressure_ratio"],
        "T09": cfg.T09, "p09": r.combustor["p04"],
        "T10": r.nozzle["T_exit"], "V10": V10, "p10": r.nozzle["p_exit"],
        "M10": r.nozzle["M_exit"],
        "f": fR, "fuel_air": fR,
        "specific_thrust": sp, "ke": ke,
        "tsfc": fR / sp if sp > 0 else float("nan"),
        "eta_propulsive": eta_p, "eta_thermal": eta_th, "eta_overall": eta_o,
    }
    s2, s4, s9 = r.stations["2"], r.stations["4"], r.stations["9"]
    stations = {
        "8": Station("8", s2.T0, s2.p0, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "9": Station("9", s4.T0, s4.p0, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "10": Station.from_static("10", s9.T, s9.p, s9.V, cfg.gamma_h, cfg.cp_h, R_h),
    }
    return leg, stations


def solve_turboramjet(cfg: TurboramjetConfig) -> TurboramjetResult:
    if cfg.mode not in MODES:
        _fail(f"mode must be one of {', '.join(MODES)}, got {cfg.mode!r}.")
    if cfg.mode == "dual" and not (0.0 < cfg.beta < 1.0):
        _fail("the air split β (fraction through the turbojet) must be between 0 and 1 "
              "in dual mode.")
    if not (cfg.mach_flight >= 0):
        _fail("flight Mach number can't be negative.")

    if cfg.mode == "auto":
        active = "turbojet" if cfg.mach_flight < cfg.mach_switch else "ramjet"
    else:
        active = cfg.mode
    beta = {"turbojet": 1.0, "ramjet": 0.0, "dual": cfg.beta}[active]

    result = TurboramjetResult(config=cfg, mode_active=active)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V, "T0a": T0a, "p0a": p0a}
    result.stations = {"a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V)}

    if beta > 0:
        result.turbojet, st = _solve_turbojet_leg(cfg, T_a, p_a, V, R_c, R_h)
        result.stations.update(st)
    if beta < 1:
        result.ramjet, st = _solve_ramjet_leg(cfg, V, R_c, R_h)
        result.stations.update(st)

    # Combined (§6-7): T/mdot_a = beta·sp_TJ + (1-beta)·sp_RJ, fuel likewise.
    tj, rj = result.turbojet, result.ramjet
    sp = (beta * tj["specific_thrust"] if tj else 0.0) + ((1 - beta) * rj["specific_thrust"] if rj else 0.0)
    fuel = (beta * tj["fuel_air"] if tj else 0.0) + ((1 - beta) * rj["fuel_air"] if rj else 0.0)
    ke = (beta * tj["ke"] if tj else 0.0) + ((1 - beta) * rj["ke"] if rj else 0.0)
    useful = sp * V
    eta_p = useful / (useful + ke) if (useful + ke) > 0 else None
    eta_th = (useful + ke) / (cfg.Q_R * fuel) if fuel > 0 else None
    eta_o = eta_p * eta_th if (eta_p is not None and eta_th is not None) else None
    result.performance = {
        "thrust": cfg.mdot_a * sp, "specific_thrust": sp,
        "tsfc": fuel / sp if sp > 0 else float("nan"),
        "f": fuel, "mdot_f": cfg.mdot_a * fuel,
        "mdot_a_turbojet": cfg.mdot_a * beta, "mdot_a_ramjet": cfg.mdot_a * (1 - beta),
        "beta": beta,
        "thrust_turbojet": cfg.mdot_a * beta * tj["specific_thrust"] if tj else 0.0,
        "thrust_ramjet": cfg.mdot_a * (1 - beta) * rj["specific_thrust"] if rj else 0.0,
        "eta_propulsive": eta_p, "eta_thermal": eta_th, "eta_overall": eta_o,
    }
    return result
