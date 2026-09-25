"""
Turbofan (two-spool, unmixed) — a fan added ahead of the turbojet's own
core, splitting the intake air into a core (hot) stream that goes
through the compressor/combustor/turbine/hot-nozzle exactly like the
turbojet, and a bypass (cold) stream that goes straight from the fan to
its own cold nozzle.

Ref: `reference/turbofan.md` §2-3 (two-spool unmixed baseline; this
module does not implement the mixed-flow, geared, or three-spool
variants also described there — see that file for the
source material behind all of them), compiled from NPTEL "Introduction
to Airbreathing Propulsion". This is the single biggest gap in the
project's source material to date: bypass ratio, fan pressure ratio,
and fan/spool efficiencies have NO numeric values anywhere in the
extracted transcript (reference/turbofan.md §9) — every one of those
defaults below is sourced from general gas-turbine literature, not this
project's primary reference, and flagged as such.

Architecture note: the fan/LPC/HPC here are each a SINGLE overall
compression step (pressure ratio + isentropic efficiency directly, no
stage-stacking) — reference/turbofan.md §3 gives them as one-shot
T_out/T_in relations, unlike the turbojet's stage-by-stage compressor.py.
The HPT-balances-HPC shaft relation is algebraically identical to the
turbojet's own `matching.turbine_temp_ratio` (just re-labelled stations,
T03->T04 becomes the HPC's own inlet->exit and T04->T05 the HPT's own
inlet->exit) and is reused directly; the LPT-balances-fan+LPC relation
carries an extra bypass-ratio term the turbojet's matching.py doesn't
have, so it's implemented locally. Both nozzles (hot and cold/fan) reuse
aeropropsim/nozzle.py's functions unmodified — the cold nozzle just
passes gamma_c/cp_c/R_c where the hot nozzle passes gamma_h/cp_h/R_h,
since the choking/exit-velocity physics is identical either side.

lambda1/lambda2 (the source's undefined turbine-work "conversion
factor" — reference/turbofan.md judgment call #1) default to 1.0, same
resolution already used for this ambiguity elsewhere in the project.
Afterburner (optional, off by default): re-heats the CORE stream in the
jet pipe between the LPT exit (7) and the hot nozzle (8), using the
turbojet afterburner's energy balance (NPTEL p.291-296) with stations
relabelled 5->7, 6->8. The source's own afterburning turbofan (§6) is
the MIXED-flow layout, where fan and core air are merged before one
afterburner; this unmixed model has no mixer, so only the core is
re-heated. With the afterburner lit its pressure loss delta_p_ab_pct
replaces the plain jet-pipe loss.

Bleed air (b) is not modelled here (Phase 2 extension, same status as
the turbojet's own unmodelled bleed in engine.py).
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .matching import turbine_temp_ratio, turbine_pressure_ratio
from .nozzle import (
    critical_pressure, is_choked, choked_exit_temperature,
    choked_exit_velocity, unchoked_exit_velocity, thrust as nozzle_thrust,
)
from .performance import tsfc as perf_tsfc
from .gasstate import Station


@dataclass
class TurbofanConfig:
    # --- Flight condition ---
    altitude_m: float = 10000.0
    mach_flight: float = 0.8

    # --- Bypass / fan --- NOT IN SOURCE numerically (reference/
    # turbofan.md §9) — general literature values for a medium-bypass
    # turbofan (e.g. CFM56-class), not this project's primary reference.
    beta: float = 5.0           # bypass ratio, mdot_cold/mdot_hot
    pi_f: float = 1.65          # fan pressure ratio
    eta_f: float = 0.90         # fan efficiency

    # --- LPC (booster) --- NOT IN SOURCE numerically.
    pi_LPC: float = 1.5
    eta_LPC: float = 0.90

    # --- HPC --- NOT IN SOURCE numerically; sized so pi_f*pi_LPC*pi_HPC
    # lands near a typical modern turbofan's ~30:1 overall pressure ratio.
    pi_HPC: float = 12.0
    eta_HPC: float = 0.90

    # --- Combustor --- same formulas as the turbojet's.
    T05: float = 1500.0         # K, combustor exit / HPT inlet (this
                                 # engine's TIT, in the source's own
                                 # station numbering — see module docstring)
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]

    # --- HPT (drives HPC only) / LPT (drives fan+LPC together) ---
    eta_HPT: float = C.DEFAULTS["eta_tt_stage"]
    eta_LPT: float = C.DEFAULTS["eta_tt_stage"]
    eta_m1: float = C.DEFAULTS["eta_m"]   # HP-spool mechanical efficiency
    eta_m2: float = C.DEFAULTS["eta_m"]   # LP-spool mechanical efficiency
    lambda1: float = 1.0                  # undefined in source — see module docstring
    lambda2: float = 1.0

    # --- Jet pipe / nozzles --- delta_p_jetpipe is NOT IN SOURCE numerically.
    delta_p_jetpipe: float = 0.02
    eta_n1: float = C.DEFAULTS["eta_N"]   # hot nozzle efficiency
    eta_fn: float = C.DEFAULTS["eta_N"]   # cold (fan) nozzle efficiency

    # --- Mass flow --- mdot_a is CORE (hot-stream) mass flow, matching
    # the source's own convention (BETA = mdot_cold/mdot_hot, and
    # mdot_a*(1+beta) = total inducted flow).
    mdot_a: float = 1.0

    # --- Afterburner (core stream, jet pipe 7 -> 8) --- off by default.
    afterburner_on: bool = False
    T08_ab: float = 2000.0         # K, afterburner exit temperature (T08A)
    delta_p_ab_pct: float = 0.05   # replaces the jet-pipe loss when lit

    # --- Intake --- shared with the turbojet.
    eta_d: float = C.DEFAULTS["eta_d"]

    # gas properties
    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class TurbofanResult:
    config: TurbofanConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    fan: dict = field(default_factory=dict)
    lpc: dict = field(default_factory=dict)
    hpc: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    hpt: dict = field(default_factory=dict)
    lpt: dict = field(default_factory=dict)
    hot_nozzle: dict = field(default_factory=dict)
    afterburner: dict = field(default_factory=dict)
    cold_nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def _compressor_step(T_in: float, p_in: float, pi: float, eta: float, gamma: float):
    """T_out/T_in = 1 + (pi^((gamma-1)/gamma) - 1)/eta, p_out = p_in*pi.
    Ref: reference/turbofan.md §3 (fan/LPC/HPC each use this one-shot
    form — no stage-stacking, unlike the turbojet's compressor.py)."""
    exponent = (gamma - 1.0) / gamma
    T_out = T_in * (1.0 + (pi ** exponent - 1.0) / eta)
    p_out = p_in * pi
    return T_out, p_out


def solve_turbofan(cfg: TurbofanConfig) -> TurbofanResult:
    """Solve one single-design-point two-spool unmixed turbofan cycle.

    Solve order: atmosphere -> intake -> fan -> LPC -> HPC -> combustor
    -> HPT (balances HPC) -> LPT (balances fan+LPC) -> jet pipe -> hot
    nozzle -> cold nozzle -> combined two-stream thrust/TSFC.
    """
    result = TurbofanResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    # --- Atmosphere ---
    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V_flight,
                          "T0a": T0a, "p0a": p0a}

    # --- Intake (identical to the turbojet) ---
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c)
    result.intake = intake
    T02, p02 = intake["T02"], intake["p02"]

    # --- Fan ---
    T010, p010 = _compressor_step(T02, p02, cfg.pi_f, cfg.eta_f, cfg.gamma_c)
    result.fan = {"T010": T010, "p010": p010, "pi_f": cfg.pi_f}

    # --- LPC (booster) ---
    T03, p03 = _compressor_step(T010, p010, cfg.pi_LPC, cfg.eta_LPC, cfg.gamma_c)
    result.lpc = {"T03": T03, "p03": p03, "pi_LPC": cfg.pi_LPC}

    # --- HPC ---
    T04, p04 = _compressor_step(T03, p03, cfg.pi_HPC, cfg.eta_HPC, cfg.gamma_c)
    result.hpc = {"T04": T04, "p04": p04, "pi_HPC": cfg.pi_HPC}

    # --- Combustor (same formulas as the turbojet's, station names
    # shifted: T04->T05 here plays T03->T04's role there) ---
    f = fuel_air_ratio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p05 = combustor_exit_pressure(p04, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "p05": p05, "T05": cfg.T05}

    # --- HPT: algebraically identical to the turbojet's shaft balance
    # (matching.turbine_temp_ratio), just re-labelled stations (HPC
    # inlet/exit -> T05/T06 here in place of the turbojet's compressor
    # inlet/exit -> T04/T05). ---
    T06_over_T05 = turbine_temp_ratio(T03, T04, cfg.T05, cfg.lambda1,
                                       cfg.eta_m1, f, cfg.cp_c, cfg.cp_h)
    T06 = T06_over_T05 * cfg.T05
    p06_over_p05 = turbine_pressure_ratio(T06_over_T05, cfg.eta_HPT, cfg.gamma_h)
    p06 = p06_over_p05 * p05
    result.hpt = {"T06": T06, "p06": p06, "T06_over_T05": T06_over_T05}

    # --- LPT: drives fan+LPC together, carries an extra bypass-ratio
    # term the turbojet's matching.py doesn't have — implemented
    # locally (Ref: reference/turbofan.md §3, LPT energy balance). ---
    compressor_work_specific = (
        (1.0 + cfg.beta) * cfg.cp_c * (T010 - T02) + cfg.cp_c * (T03 - T010)
    )
    turbine_capacity = cfg.lambda2 * cfg.eta_m2 * (1.0 + f) * cfg.cp_h * T06
    T07_over_T06 = 1.0 - compressor_work_specific / turbine_capacity
    T07 = T07_over_T06 * T06
    p07_over_p06 = turbine_pressure_ratio(T07_over_T06, cfg.eta_LPT, cfg.gamma_h)
    p07 = p07_over_p06 * p06
    result.lpt = {"T07": T07, "p07": p07, "T07_over_T06": T07_over_T06}

    # --- Jet pipe (7 -> 8): plain duct, or the afterburner when lit ---
    if cfg.afterburner_on:
        if not (cfg.T08_ab > T07):
            raise ValueError(
                f"solve_turbofan: the afterburner exit temperature T08 = {cfg.T08_ab:.0f} K must "
                f"be above the low-pressure turbine exit temperature T07 = {T07:.0f} K — an "
                f"afterburner can only add heat. Raise T08 or turn the afterburner off."
            )
        ab_denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T08_ab
        if not (ab_denom > 0):
            raise ValueError(
                "solve_turbofan: the afterburner exit temperature is too high for this fuel — even "
                "burning it perfectly can't heat the gas that much. Lower T08."
            )
        fab = (1.0 + f) * (cfg.cp_h * cfg.T08_ab - cfg.cp_h * T07) / ab_denom
        T08 = cfg.T08_ab
        p08 = p07 * (1.0 - cfg.delta_p_ab_pct)
    else:
        fab = 0.0
        T08 = T07
        p08 = p07 * (1.0 - cfg.delta_p_jetpipe)
    f_total = f + fab
    result.afterburner = {"on": cfg.afterburner_on, "fab": fab, "T07": T07, "p07": p07,
                          "T08": T08, "p08": p08}

    # --- Hot nozzle (reuses aeropropsim/nozzle.py exactly, as the
    # turbojet does) ---
    p_c_hot = critical_pressure(p08, cfg.eta_n1, cfg.gamma_h)
    choked_hot = is_choked(p_c_hot, p_a)
    if choked_hot:
        T9 = choked_exit_temperature(T08, cfg.gamma_h)
        V9 = choked_exit_velocity(T9, cfg.gamma_h, R_h)
        p9 = p_c_hot
    else:
        V9 = unchoked_exit_velocity(T08, p_a, p08, cfg.eta_n1, cfg.gamma_h, cfg.cp_h)
        p9 = p_a
        T9 = T08 - V9 ** 2 / (2.0 * cfg.cp_h)
    rho9 = p9 / (R_h * T9)
    A9 = (1.0 + f_total) * cfg.mdot_a / (rho9 * V9)
    result.hot_nozzle = {"choked": choked_hot, "p_exit": p9, "T_exit": T9,
                          "V_exit": V9, "rho_exit": rho9, "A_exit": A9}

    # --- Cold (fan) nozzle — same nozzle.py functions, cold-side
    # properties (gamma_c/cp_c/R_c) passed in place of the hot side's. ---
    p_c_cold = critical_pressure(p010, cfg.eta_fn, cfg.gamma_c)
    choked_cold = is_choked(p_c_cold, p_a)
    if choked_cold:
        T11 = choked_exit_temperature(T010, cfg.gamma_c)
        V11 = choked_exit_velocity(T11, cfg.gamma_c, R_c)
        p11 = p_c_cold
    else:
        V11 = unchoked_exit_velocity(T010, p_a, p010, cfg.eta_fn, cfg.gamma_c, cfg.cp_c)
        p11 = p_a
        T11 = T010 - V11 ** 2 / (2.0 * cfg.cp_c)
    rho11 = p11 / (R_c * T11)
    mdot_cold = cfg.beta * cfg.mdot_a
    A11 = mdot_cold / (rho11 * V11)
    result.cold_nozzle = {"choked": choked_cold, "p_exit": p11, "T_exit": T11,
                           "V_exit": V11, "rho_exit": rho11, "A_exit": A11}

    # --- Combined two-stream thrust and TSFC (Ref §3) — each stream's
    # thrust reuses nozzle.thrust() exactly (f=0 for the bypass stream,
    # which carries no fuel), then summed. ---
    T_hot = nozzle_thrust(cfg.mdot_a, f_total, V9, V_flight, p9, p_a, A9)
    T_cold = nozzle_thrust(mdot_cold, 0.0, V11, V_flight, p11, p_a, A11)
    T_total = T_hot + T_cold
    sp_thrust = T_total / cfg.mdot_a  # T/mdot_a, matching the source's own metric
    tsfc_val = perf_tsfc(f_total, sp_thrust)
    mdot_f = f_total * cfg.mdot_a
    eta_0 = (T_total * V_flight / (mdot_f * cfg.Q_R)) if (mdot_f > 0 and V_flight > 0) else None
    result.performance = {
        "thrust": T_total, "thrust_hot": T_hot, "thrust_cold": T_cold,
        "specific_thrust": sp_thrust, "tsfc": tsfc_val, "f": f,
        "f_ab": fab, "f_total": f_total,
        "eta_overall": eta_0, "beta": cfg.beta,
    }

    # --- Key-station table: a, 2, 10, 3, 4, 5, 6, 7, 9, 11 — the
    # source's own station numbering (see module docstring), a genuinely
    # different set from the turbojet's a,2,3,4,5,9. Station 8 (jet-pipe
    # exit) is omitted from the table since it's thermodynamically
    # identical to 7 apart from the jet-pipe pressure loss already
    # reflected going into the nozzle calc — no separate V/M to show.
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "10": Station("10", T010, p010, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", T04, p04, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "5": Station("5", cfg.T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "6": Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "7": Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        **({"8": Station("8", T08, p08, cfg.gamma_h, cfg.cp_h, R_h, V=0.0)}
           if cfg.afterburner_on else {}),
        "9": Station.from_static("9", T9, p9, V9, cfg.gamma_h, cfg.cp_h, R_h),
        "11": Station.from_static("11", T11, p11, V11, cfg.gamma_c, cfg.cp_c, R_c),
    }

    return result
