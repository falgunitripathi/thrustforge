"""
Propfan (three-spool, unducted fan) — a gas generator (IPC/HPC/combustor/
HPT/IPT) drives a free (power) turbine, which drives an UNDUCTED fan
(open rotor) through a reduction gearbox, instead of a turbojet's own
nozzle or a turboprop's ducted propeller. The fan sits directly in the
freestream (no intake diffuser ahead of it), and is modelled as its own
compressor stage with its own pressure ratio/efficiency — NOT folded
into a single "propeller efficiency" number the way turboprop.py's
`eta_Pr` is.

Ref: `reference/propfan.md` (this project's sole source for propfans —
NPTEL "Introduction to Airbreathing Propulsion", Lecture 35; Ganesan's
*Gas Turbines* has no propfan-specific material at all, confirmed by
direct grep of the extracted text — see that file's provenance note).
This module implements the three-spool layout the source itself works a
full cycle for; see that file §1 for the other historical layouts
(tractor/pusher, single-rotation/contra-rotating) not modelled here.

Architecture note: intake -> IPC -> HPC -> combustor -> HPT -> IPT is
the same style of multi-spool gas-generator analysis as turbofan.py
(each compressor stage is a single one-shot pressure-ratio/efficiency
step, no stage-stacking — reused here via the same `_compressor_step`
form), just with three spools' worth of turbomachinery ahead of the
power turbine instead of two. The HPT/IPT energy balances are BARE
energy conservation (no lambda/eta_m factors) — unlike turbofan.py's
LPT balance, the source gives no shaft mechanical-efficiency term for
either of these two turbines, stating explicitly that "shaft/mechanical
efficiency is taken as 100% here" (reference/propfan.md §2.1).

Judgment calls resolved by reference/propfan.md (see that file §4 for
the full reasoning) and followed here:
  1. The source uses `(1+f-b)` only at the HPT, then consistently
     `(1+f)` (no bleed term) at the IPT, free-turbine, and fan/nozzle
     balances. This module uses `(1+f-b)` UNIFORMLY throughout instead,
     matching this project's own turbojet/turboprop/turboshaft
     convention — a deliberate, documented departure from the source's
     own (internally consistent, but non-uniform) usage.
  2. The propulsive-efficiency formula's bare `T` is treated as
     `T_total` (§2.5), and its `u_UDF` term is treated as the fan exit
     velocity `(ue)_UDF` already defined earlier in the source — see
     `propulsive_efficiency` below. Additionally, this implementation
     reads the formula's other velocity term (transcribed as `u_inf`,
     appearing squared against flight speed exactly like a jet-exit
     velocity would) as the HOT-NOZZLE exit velocity `(ue)_n`, NOT
     literally "freestream velocity" — `u_inf` squared against `u`
     (flight speed) would otherwise algebraically vanish to zero,
     which cannot be what a "two-stream propulsive efficiency" formula
     (the source's own framing, see reference/propfan.md §2.5) intends;
     this reading makes it structurally match the turbofan's own
     two-stream propulsive-efficiency treatment, one term per exhaust
     stream.
  3. alpha (the free turbine's split fraction between shaft/fan power
     and the residual hot-nozzle jet) is treated as a fixed design
     input, not solved for — the source gives no propfan-specific
     "alpha_opt" derivation (unlike turboprop.py's `alpha_opt`), only
     the alpha-split formula itself. Default value borrowed from
     turboprop's own typical range (0.80-0.90) by analogy, since no
     propfan-specific number exists in the source — flagged as an
     inference, not a sourced default.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .matching import turbine_pressure_ratio
from .performance import tsfc as perf_tsfc
from .gasstate import Station


@dataclass
class PropfanConfig:
    # --- Flight condition ---
    altitude_m: float = 9000.0
    mach_flight: float = 0.7

    # --- IPC (intermediate-pressure compressor) --- NOT IN SOURCE
    # numerically (reference/propfan.md has no worked example) — same
    # provisional status as turbofan.py's own LPC/HPC defaults.
    pi_IPC: float = 2.0
    eta_IPC: float = 0.90

    # --- HPC ---
    pi_HPC: float = 6.0
    eta_HPC: float = 0.90

    # --- Combustor --- T05 is this engine's TIT (HPT inlet), in the
    # source's own station numbering (see module docstring).
    T05: float = 1500.0
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]

    # --- HPT (drives HPC only) / IPT (drives IPC only) --- bare energy
    # balance, no lambda/eta_m term — see module docstring.
    eta_HPT: float = C.DEFAULTS["eta_tt_stage"]
    eta_IPT: float = C.DEFAULTS["eta_tt_stage"]

    # --- Free (power) turbine --- Ref §2.3-2.4. alpha: see module
    # docstring judgment call #3.
    eta_ft: float = C.DEFAULTS["eta_tt_stage"]
    alpha: float = 0.85

    # --- Unducted fan (UDF) --- NOT IN SOURCE numerically (only
    # qualitative context: supersonic tip speed, effective bypass ~25 —
    # reference/propfan.md §3). pi_UDF/eta_UDF chosen in the same spirit
    # as turbofan.py's own fan defaults.
    pi_UDF: float = 1.20
    eta_UDF: float = 0.88
    eta_m_UDF: float = C.DEFAULTS["eta_m"]  # mechanical eff., free turbine -> fan

    # --- Hot nozzle --- always fully expanded to ambient in this model
    # (Ref §2.3: no choking check, unlike the turbojet's nozzle.py).
    eta_n: float = C.DEFAULTS["eta_N"]

    # --- Mass flow / bleed --- mdot_a is the SAME mass-flow figure the
    # source uses for both the gas-generator core and (scaled by the
    # solved fan power-split fraction `beta`) the fan thrust formula —
    # the source defines no separate bypass-ratio-like split the way
    # turbofan.py's `beta` (there, bypass ratio) does.
    mdot_a: float = 1.0
    bleed_ratio: float = 0.0  # b = mdot_bleed/mdot_a

    # --- Intake --- shared with the turbojet; only used for the CORE
    # stream (the fan sits directly in the freestream — see solve_propfan).
    eta_d: float = C.DEFAULTS["eta_d"]

    # gas properties
    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class PropfanResult:
    config: PropfanConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    ipc: dict = field(default_factory=dict)
    hpc: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    hpt: dict = field(default_factory=dict)
    ipt: dict = field(default_factory=dict)
    fan: dict = field(default_factory=dict)
    free_turbine: dict = field(default_factory=dict)
    hot_nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def _compressor_step(T_in: float, p_in: float, pi: float, eta: float, gamma: float):
    """T_out/T_in = 1 + (pi^((gamma-1)/gamma) - 1)/eta, p_out = p_in*pi.
    Ref: reference/propfan.md §2.1 (IPC/HPC/fan each use this one-shot
    form, identical to turbofan.py's own `_compressor_step`)."""
    exponent = (gamma - 1.0) / gamma
    T_out = T_in * (1.0 + (pi ** exponent - 1.0) / eta)
    p_out = p_in * pi
    return T_out, p_out


def solve_propfan(cfg: PropfanConfig) -> PropfanResult:
    """Solve one single-design-point three-spool propfan cycle.

    Solve order: atmosphere -> intake (core only) -> IPC -> HPC ->
    combustor -> HPT (balances HPC) -> IPT (balances IPC) -> unducted
    fan (sized directly off the freestream, not the core intake) ->
    free turbine (alpha-split against the fan/nozzle) -> hot nozzle ->
    fan power balance (solves beta) -> combined thrust/efficiency.
    """
    result = PropfanResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    # --- Atmosphere ---
    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V_flight,
                          "T0a": T0a, "p0a": p0a}

    # --- Intake (core stream only — identical to the turbojet) ---
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c)
    result.intake = intake
    T02, p02 = intake["T02"], intake["p02"]

    # --- IPC ---
    T03, p03 = _compressor_step(T02, p02, cfg.pi_IPC, cfg.eta_IPC, cfg.gamma_c)
    result.ipc = {"T03": T03, "p03": p03, "pi_IPC": cfg.pi_IPC}

    # --- HPC ---
    T04, p04 = _compressor_step(T03, p03, cfg.pi_HPC, cfg.eta_HPC, cfg.gamma_c)
    result.hpc = {"T04": T04, "p04": p04, "pi_HPC": cfg.pi_HPC}

    # --- Combustor. Ref §2.1: f = (1-b)*(Cph*T05 - Cpc*T04) /
    # (eta_b*Q_R - Cph*T05) — algebraically the same energy balance as
    # combustor.fuel_air_ratio (verified: multiplying that function's
    # form through by cp_c*T_in reduces to exactly this), just with an
    # extra (1-b) bleed prefactor the turbojet/turboprop's combustor
    # treatment does not carry on f itself (there, bleed only enters
    # downstream via the mass-flow factor) — applied here as the source
    # states it. ---
    f = (1.0 - cfg.bleed_ratio) * fuel_air_ratio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p05 = combustor_exit_pressure(p04, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "p05": p05, "T05": cfg.T05}
    mass_factor = 1.0 + f - cfg.bleed_ratio  # Ref: module docstring judgment call #1

    # --- HPT: bare energy balance against the HPC, no lambda/eta_m
    # (Ref §2.1 — "shaft/mechanical efficiency is taken as 100% here"). ---
    T06 = cfg.T05 - cfg.cp_c / (mass_factor * cfg.cp_h) * (T04 - T03)
    p06_over_p05 = turbine_pressure_ratio(T06 / cfg.T05, cfg.eta_HPT, cfg.gamma_h)
    p06 = p06_over_p05 * p05
    result.hpt = {"T06": T06, "p06": p06, "p06_over_p05": p06_over_p05}

    # --- IPT: bare energy balance against the IPC (Ref §2.1). ---
    T07 = T06 - cfg.cp_c / (mass_factor * cfg.cp_h) * (T03 - T02)
    p07_over_p06 = turbine_pressure_ratio(T07 / T06, cfg.eta_IPT, cfg.gamma_h)
    p07 = p07_over_p06 * p06
    result.ipt = {"T07": T07, "p07": p07, "p07_over_p06": p07_over_p06}

    # --- Unducted fan (UDF). Ref §2.2: sized directly off the
    # freestream stagnation state (T010=T0a, p010=p0a) — NOT the core's
    # own p02, since the fan is unducted (no intake diffuser/eta_d loss
    # ahead of it, unlike the ducted core). ---
    T010, p010 = T0a, p0a
    T011, p011 = _compressor_step(T010, p010, cfg.pi_UDF, cfg.eta_UDF, cfg.gamma_c)
    pressure_term_fan = (p_a / p011) ** ((cfg.gamma_c - 1.0) / cfg.gamma_c)
    if pressure_term_fan >= 1.0:
        raise ValueError(
            f"solve_propfan: non-physical (pa/p011={pressure_term_fan:.4f} >= 1) "
            f"— the fan's own exit pressure must exceed ambient for it to "
            f"produce thrust; check pi_UDF."
        )
    T12 = T011 * pressure_term_fan
    ue_UDF = (2.0 * cfg.cp_c * (T011 - T12)) ** 0.5
    result.fan = {"T010": T010, "p010": p010, "T011": T011, "p011": p011,
                  "T12": T12, "ue_UDF": ue_UDF}

    # --- Free (power) turbine. Ref §2.3: alpha-splits the ideal drop
    # to ambient (from station 7) between shaft/fan power and the
    # residual hot-nozzle jet, same alpha-split pattern as
    # turboprop.py. ---
    pressure_term_ft = (p_a / p07) ** ((cfg.gamma_h - 1.0) / cfg.gamma_h)
    if pressure_term_ft >= 1.0:
        raise ValueError(
            f"solve_propfan: non-physical (pa/p07={pressure_term_ft:.4f} >= 1) "
            f"— combustor/turbine pressure must exceed ambient for the free "
            f"turbine to expand at all; check pi_IPC/pi_HPC/delta_p_cc_pct."
        )
    T9s = T07 * pressure_term_ft
    T08s = T07 - cfg.alpha * (T07 - T9s)
    T08 = T07 - cfg.eta_ft * cfg.alpha * (T07 - T9s)
    p07_over_p08 = (T07 / T08s) ** (cfg.gamma_h / (cfg.gamma_h - 1.0))
    p08 = p07 / p07_over_p08
    result.free_turbine = {"T08": T08, "p08": p08, "T9s": T9s, "T08s": T08s}

    # --- Hot nozzle. Ref §2.3: exit velocity uses the SAME T9s computed
    # above (the full-expansion-to-ambient reference from station 7),
    # not a fresh isentropic calc from p08 — this is the source's own
    # simplification, reproduced literally rather than "corrected", and
    # always fully expanded to ambient (no choking check, unlike the
    # turbojet's nozzle.py). ---
    ue_n = (2.0 * cfg.cp_h * cfg.eta_n * (T08 - T9s)) ** 0.5
    T9 = T08 - ue_n ** 2 / (2.0 * cfg.cp_h)
    p9 = p_a
    rho9 = p9 / (R_h * T9) if T9 > 0 else float("nan")
    Tn = cfg.mdot_a * (mass_factor * ue_n - V_flight)
    result.hot_nozzle = {"choked": False, "p_exit": p9, "T_exit": T9,
                          "V_exit": ue_n, "rho_exit": rho9, "Tn": Tn}

    # --- Fan power balance (Ref §2.4): solve beta from the free
    # turbine's output split between (implicitly) the gas generator's
    # own downstream losses and the fan. ---
    beta = (cfg.eta_m_UDF * mass_factor * cfg.cp_h * (T07 - T08)) / (cfg.cp_c * (T011 - T010))
    T_UDF = beta * cfg.mdot_a * (ue_UDF - V_flight)
    P_UDF_W = V_flight * T_UDF
    result.fan.update({"beta": beta, "T_UDF": T_UDF, "P_UDF_W": P_UDF_W})

    # --- Combined thrust and propulsive efficiency (Ref §2.4-2.5; see
    # module docstring judgment call #2 for the `T`/`u_inf` reading
    # used here). ---
    T_total = T_UDF + Tn
    denom = T_total * V_flight + 0.5 * cfg.mdot_a * (
        ue_n - V_flight
    ) ** 2 + 0.5 * cfg.mdot_a * beta * (ue_UDF - V_flight) ** 2
    eta_P = (T_total * V_flight) / denom if denom > 0 else None

    sp_thrust = T_total / cfg.mdot_a
    tsfc_val = perf_tsfc(f, sp_thrust)
    mdot_f = f * cfg.mdot_a
    eta_0 = (T_total * V_flight / (mdot_f * cfg.Q_R)) if (mdot_f > 0 and V_flight > 0) else None
    result.performance = {
        "thrust": T_total, "thrust_fan": T_UDF, "thrust_nozzle": Tn,
        "specific_thrust": sp_thrust, "tsfc": tsfc_val, "f": f,
        "eta_propulsive": eta_P, "eta_overall": eta_0,
        "beta": beta, "alpha": cfg.alpha, "P_UDF_W": P_UDF_W,
    }

    # --- Key-station table: a, 2, 3, 4, 5, 6, 7, 8, 9 (gas-generator/
    # free-turbine/hot-nozzle path) plus 10, 11, 12 (unducted fan path,
    # from freestream through the fan to its own fully-expanded
    # exhaust) — the source's own station numbering (see module
    # docstring). ---
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", T04, p04, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "5": Station("5", cfg.T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "6": Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "7": Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "8": Station("8", T08, p08, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "9": Station.from_static("9", T9, p9, ue_n, cfg.gamma_h, cfg.cp_h, R_h),
        "10": Station("10", T010, p010, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "11": Station("11", T011, p011, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "12": Station.from_static("12", T12, p_a, ue_UDF, cfg.gamma_c, cfg.cp_c, R_c),
    }

    return result
