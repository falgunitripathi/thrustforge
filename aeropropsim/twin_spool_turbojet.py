"""
Two-spool (twin-spool) turbojet — an LP compressor driven by an LP turbine
on one shaft, an HP compressor driven by an HP turbine on a second shaft
running inside the first, then an optional afterburner and a convergent
nozzle.

Ref: NPTEL "Introduction to Airbreathing Propulsion", double-spool
turbojet (lecture p.297-303, reference_extraction/nptel.txt), plus the
generic dual-spool efficiency block in reference/turbofan.md §4 (NPTEL
p.305-306). Stations follow the source: a, 2 (intake exit), 3 (LPC exit),
4 (HPC exit), 5 (combustor exit), 6 (HPT exit), 7 (LPT exit), 8 (jet pipe /
afterburner exit, only shown when the afterburner is lit), 9 (nozzle exit).

Source relations used:
  LPC:  p03 = pi_c1*p02,  T03 = T02[1 + (pi_c1^((gc-1)/gc) - 1)/eta_c1]
  HPC:  p04 = pi_c2*p03,  T04 = T03[1 + (pi_c2^((gc-1)/gc) - 1)/eta_c2]
  Comb: p05 = p04(1 - dp_cc),  f from the energy balance
  HPT:  Cpc(T04 - T03) = lambda1(1+f)eta_m1 Cph(T05 - T06)   (the slide
        prints Cpc on the right; its own T06/T05 closed form carries
        Cpc/Cph, so Cph is meant — same resolution as the turbojet)
  LPT:  Cpc(T03 - T02) = lambda2(1+f)eta_m2 Cph(T06 - T07)
  pressure ratios from each turbine's isentropic efficiency
  Jet pipe: T08 = T07 (no loss given); afterburner lit: T08A = Tmax,
        p08A = p07(1 - dp_ab), fab = (1+f)(Cp8A*T08A - Cp7*T07)/(eta_b*Q_R - Cp8A*T08A)
  Nozzle: choking check on p_c, then choked/unchoked exit velocity
  T/mdot_a = [(1+f+fab)V9 - V] + (A9/mdot_a)(p9 - p_a), TSFC = (f+fab)/(T/mdot_a)
  eta_p = TV/(TV + mdot_e(V9-V)^2/2), eta_th = (TV + mdot_e(V9-V)^2/2)/(mdot_f Q_R)

lambda1/lambda2 default 0.80, the single-spool turbojet's own lambda_shaft
default (the source gives 75-80% for this engine). The compressors are
one-shot (pressure ratio + efficiency), as the source writes them — not
the single-spool page's stage stacking.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .matching import turbine_pressure_ratio
from .nozzle import (
    critical_pressure, is_choked, choked_exit_temperature,
    choked_exit_velocity, unchoked_exit_velocity,
)
from .gasstate import Station


@dataclass
class TwinSpoolTurbojetConfig:
    altitude_m: float = 10000.0
    mach_flight: float = 0.8

    # LP spool: LPC + LPT; HP spool: HPC + HPT. Pressure ratios NOT IN SOURCE
    # numerically (Olympus-593-like split, overall ~15).
    pi_LPC: float = 4.0
    eta_LPC: float = 0.88
    pi_HPC: float = 3.75
    eta_HPC: float = 0.88

    T05: float = 1400.0            # turbine inlet temperature (source: "maximum temperature")
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]

    eta_HPT: float = C.DEFAULTS["eta_tt_stage"]
    eta_LPT: float = C.DEFAULTS["eta_tt_stage"]
    eta_m1: float = 0.99           # source: "around 99%"
    eta_m2: float = 0.99
    lambda1: float = C.DEFAULTS["lambda_shaft"]
    lambda2: float = C.DEFAULTS["lambda_shaft"]

    afterburner_on: bool = False
    T08_ab: float = 2000.0
    delta_p_ab_pct: float = 0.05

    eta_N: float = C.DEFAULTS["eta_N"]
    mdot_a: float = 1.0
    eta_d: float = C.DEFAULTS["eta_d"]

    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class TwinSpoolTurbojetResult:
    config: TwinSpoolTurbojetConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    lpc: dict = field(default_factory=dict)
    hpc: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    hpt: dict = field(default_factory=dict)
    lpt: dict = field(default_factory=dict)
    afterburner: dict = field(default_factory=dict)
    nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def _compress(T_in, p_in, pi, eta, gamma):
    return T_in * (1.0 + (pi ** ((gamma - 1.0) / gamma) - 1.0) / eta), p_in * pi


def _fail(msg):
    raise ValueError(f"solve_twin_spool_turbojet: {msg}")


def solve_twin_spool_turbojet(cfg: TwinSpoolTurbojetConfig) -> TwinSpoolTurbojetResult:
    result = TwinSpoolTurbojetResult(config=cfg)
    gc, gh = cfg.gamma_c, cfg.gamma_h
    R_c = cfg.cp_c * (gc - 1.0) / gc
    R_h = cfg.cp_h * (gh - 1.0) / gh

    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V = cfg.mach_flight * (gc * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, gc)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V, "T0a": T0a, "p0a": p0a}

    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, gc)
    result.intake = intake
    T02, p02 = intake["T02"], intake["p02"]

    T03, p03 = _compress(T02, p02, cfg.pi_LPC, cfg.eta_LPC, gc)
    result.lpc = {"T03": T03, "p03": p03}
    T04, p04 = _compress(T03, p03, cfg.pi_HPC, cfg.eta_HPC, gc)
    result.hpc = {"T04": T04, "p04": p04}

    if not (cfg.T05 > T04):
        _fail(
            f"the compressors already deliver air at T04 = {T04:.0f} K, hotter than the turbine "
            f"inlet temperature T05 = {cfg.T05:.0f} K. Lower the pressure ratios or the flight "
            f"Mach number, or raise T05."
        )
    f = fuel_air_ratio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p05 = combustor_exit_pressure(p04, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "T05": cfg.T05, "p05": p05}

    # HP spool: the HPT drives the HPC
    r_hpt = 1.0 - cfg.cp_c * (T04 - T03) / (cfg.lambda1 * (1.0 + f) * cfg.eta_m1 * cfg.cp_h * cfg.T05)
    T06 = r_hpt * cfg.T05
    p06 = turbine_pressure_ratio(r_hpt, cfg.eta_HPT, gh) * p05
    result.hpt = {"T06": T06, "p06": p06, "work": cfg.cp_c * (T04 - T03)}

    # LP spool: the LPT drives the LPC
    r_lpt = 1.0 - cfg.cp_c * (T03 - T02) / (cfg.lambda2 * (1.0 + f) * cfg.eta_m2 * cfg.cp_h * T06)
    T07 = r_lpt * T06
    p07 = turbine_pressure_ratio(r_lpt, cfg.eta_LPT, gh) * p06
    result.lpt = {"T07": T07, "p07": p07, "work": cfg.cp_c * (T03 - T02)}

    # Jet pipe / afterburner
    if cfg.afterburner_on:
        if not (cfg.T08_ab > T07):
            _fail(
                f"the afterburner exit temperature T08 = {cfg.T08_ab:.0f} K must be above the "
                f"low-pressure turbine exit temperature T07 = {T07:.0f} K — an afterburner can "
                f"only add heat. Raise T08 or turn the afterburner off."
            )
        denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T08_ab
        if not (denom > 0):
            _fail("the afterburner exit temperature is too high for this fuel — even burning it "
                  "perfectly can't heat the gas that much. Lower T08.")
        fab = (1.0 + f) * (cfg.cp_h * cfg.T08_ab - cfg.cp_h * T07) / denom
        T08, p08 = cfg.T08_ab, p07 * (1.0 - cfg.delta_p_ab_pct)
    else:
        fab, T08, p08 = 0.0, T07, p07
    result.afterburner = {"on": cfg.afterburner_on, "fab": fab, "T07": T07, "p07": p07,
                          "T08": T08, "p08": p08}

    # Nozzle (convergent, choking check)
    p_c = critical_pressure(p08, cfg.eta_N, gh)
    choked = is_choked(p_c, p_a)
    if choked:
        T9 = choked_exit_temperature(T08, gh)
        V9 = choked_exit_velocity(T9, gh, R_h)
        p9 = p_c
    else:
        V9 = unchoked_exit_velocity(T08, p_a, p08, cfg.eta_N, gh, cfg.cp_h)
        p9 = p_a
        T9 = T08 - V9 ** 2 / (2.0 * cfg.cp_h)
    mass = 1.0 + f + fab
    rho9 = p9 / (R_h * T9)
    A9_over_m = mass / (rho9 * V9)
    result.nozzle = {"choked": choked, "p_c": p_c, "p_exit": p9, "T_exit": T9, "V_exit": V9,
                     "rho_exit": rho9, "A_exit": A9_over_m * cfg.mdot_a}

    sp = (mass * V9 - V) + A9_over_m * (p9 - p_a)
    fuel = f + fab
    tsfc = fuel / sp if sp > 0 else float("nan")
    ke = 0.5 * mass * (V9 - V) ** 2
    useful = sp * V
    eta_p = useful / (useful + ke) if sp > 0 else None
    eta_th = (useful + ke) / (fuel * cfg.Q_R) if sp > 0 else None
    eta_o = eta_p * eta_th if sp > 0 else None
    result.performance = {
        "thrust": sp * cfg.mdot_a, "specific_thrust": sp, "tsfc": tsfc,
        "f": f, "f_ab": fab, "f_total": fuel,
        "eta_propulsive": eta_p, "eta_thermal": eta_th, "eta_overall": eta_o,
    }

    st = {
        "a": Station("a", T0a, p0a, gc, cfg.cp_c, R_c, V=V),
        "2": Station("2", T02, p02, gc, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, gc, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", T04, p04, gc, cfg.cp_c, R_c, V=0.0),
        "5": Station("5", cfg.T05, p05, gh, cfg.cp_h, R_h, V=0.0),
        "6": Station("6", T06, p06, gh, cfg.cp_h, R_h, V=0.0),
        "7": Station("7", T07, p07, gh, cfg.cp_h, R_h, V=0.0),
    }
    if cfg.afterburner_on:
        st["8"] = Station("8", T08, p08, gh, cfg.cp_h, R_h, V=0.0)
    st["9"] = Station.from_static("9", T9, p9, V9, gh, cfg.cp_h, R_h)
    result.stations = st
    return result
