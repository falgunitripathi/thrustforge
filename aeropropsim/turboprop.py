"""
Turboprop — same gas-generator core as the turbojet (intake, compressor,
combustor), but the turbine's ideal enthalpy drop is split between the
shaft (driving a propeller through a reduction gearbox) and the residual
exhaust jet, instead of being sized purely to balance the compressor.

Ref: `reference/turboprop.md` §2.1-2.2 (single-spool architecture; this
module implements the single-spool case, not the twin-spool free-turbine
variant also described there), compiled from NPTEL "Introduction to
Airbreathing Propulsion", Lecture 34, cross-checked against Ganesan
"Gas Turbines" 3e §7.5 — see that file for full provenance, formula
derivations, and flagged judgment calls (several formulas in the source
have transcription ambiguities, each resolved and documented there
before being wired in here).

Architecture note: intake -> compressor -> combustor are IDENTICAL to
engine.py's turbojet solve (same intake.py/compressor.py/combustor.py
calls) — only what happens to the turbine's enthalpy drop differs. The
turbojet's `matching.py` sizes the turbine to extract EXACTLY the
compressor's power demand and sends everything else to the nozzle; a
turboprop instead treats the compressor's power demand as a fixed
deduction from a much larger turbine extraction (`alpha` of the total
available drop, typically 80-90%, reference/turboprop.md §3), with the
surplus becoming propeller shaft power and only `(1-alpha)` left for the
nozzle. Once the actual turbine work is known, this module derives a
T05/p05 pair from it (using the exact same isentropic-efficiency-to-
pressure-ratio relation as the turbojet's `matching.turbine_pressure_ratio`)
so the turbine can still be stage-stacked and shown in a Station Analysis
table exactly like the turbojet's.

Known gap: the propeller-thrust formula (Tpr = mdot_a*eta_Pr*eta_g*
Wshaft/U) divides by flight speed U and is only valid in flight — the
source gives separate, different formulas for static/ground-test
"equivalent" power (t.e.h.s./TEP, reference/turboprop.md §2.4) rather
than an actual static thrust number, since thrust = power/velocity is
singular at U=0. This module does not implement that separate static
case (Phase 2 extension) and raises for mach_flight=0, the same
fail-loud choice as the ramjet's zero-airspeed case.
"""

from dataclasses import dataclass, field
from typing import Optional

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .compressor import (
    stack_axial_compressor, centrifugal_stage_pressure_ratio,
    centrifugal_temp_rise_ratio, overall_isentropic_efficiency,
)
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .matching import turbine_pressure_ratio
from .turbine import stack_axial_turbine, spouting_velocity, radial_turbine_size_U2
from .performance import tsfc as perf_tsfc
from .gasstate import Station


@dataclass
class TurbopropConfig:
    # --- Flight condition --- Propeller thrust (see module docstring)
    # needs nonzero forward speed; mach_flight=0 raises.
    altitude_m: float = 6000.0
    mach_flight: float = 0.5

    # --- Compressor --- identical fields/meaning to EngineConfig.
    compressor_type: str = "axial"
    n_compressor_stages: int = 8
    pi_c: float = 10.0
    centrifugal_U2: float = 400.0

    # --- Combustor ---
    T04: float = 1400.0

    # --- Turbine --- eta_t is this turbine's isentropic efficiency (plays
    # the same role as EngineConfig.eta_tt_stage); turbine_type/
    # n_turbine_stages only affect how the ALREADY-DETERMINED expansion
    # (from the alpha-split below) is displayed as a stage table, exactly
    # like the turbojet's architecture-independence (engine.py docstring).
    turbine_type: str = "axial"
    n_turbine_stages: int = 2
    eta_t: float = C.DEFAULTS["eta_tt_stage"]

    # --- Propeller / power split --- Ref: reference/turboprop.md §2.2,
    # §3. alpha is a genuine free design choice (how much of the turbine's
    # available enthalpy drop goes to the shaft vs. the nozzle), same
    # status as pi_c/T04 — not something the physics derives on its own.
    # 0.85 is the midpoint of the source's stated 80-90% typical range.
    alpha: float = 0.85
    eta_Pr: float = 0.80        # propeller efficiency, source: "~80% typical"
    eta_g: float = 0.98         # gearbox efficiency — NOT IN SOURCE, conventional value
    eta_mt: float = C.DEFAULTS["eta_m"]   # turbine mechanical efficiency
    eta_mc: float = C.DEFAULTS["eta_m"]   # compressor mechanical efficiency
    bleed_ratio: float = 0.0    # b = mdot_bleed/mdot_a

    # --- Nozzle --- Ref §2.2: this alpha-split model always treats the
    # residual jet as fully expanded to ambient (the source gives no
    # choking check for the turboprop's small residual nozzle flow,
    # unlike the turbojet's nozzle.py) — eta_N still applies as a loss on
    # the ideal nozzle-share enthalpy.
    eta_N: float = C.DEFAULTS["eta_N"]

    # --- Mass flow ---
    mdot_a: float = 1.0

    # --- Efficiencies / constants shared with the turbojet ---
    eta_d: float = C.DEFAULTS["eta_d"]
    eta_c_stage: float = C.DEFAULTS["eta_c_stage"]
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]

    # gas properties
    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class TurbopropResult:
    config: TurbopropConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    compressor: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    turbine: dict = field(default_factory=dict)
    nozzle: dict = field(default_factory=dict)
    propeller: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def solve_turboprop(cfg: TurbopropConfig) -> TurbopropResult:
    """Solve one single-design-point single-spool turboprop cycle.

    Solve order: atmosphere -> intake -> compressor (identical to the
    turbojet) -> combustor -> turbine/nozzle power split (turboprop-
    specific) -> turbine stage-stack (for display) -> propeller + nozzle
    thrust -> overall performance (ESHP/ESFC, plus TSFC/eta_0 for
    cross-comparison with the turbojet's own metrics).
    """
    result = TurbopropResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    if cfg.mach_flight <= 0:
        raise ValueError(
            "solve_turboprop: mach_flight must be > 0 — propeller thrust "
            "(Tpr = mdot_a*eta_Pr*eta_g*Wshaft/U) divides by flight speed "
            "and is only valid in flight. Static/ground-test performance "
            "needs the source's separate t.e.h.s./TEP formulas "
            "(reference/turboprop.md §2.4), not implemented here."
        )

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

    # --- Compressor (identical to the turbojet — see engine.py) ---
    if cfg.compressor_type == "axial":
        comp = stack_axial_compressor(
            pi_c_target=cfg.pi_c, n_stages=cfg.n_compressor_stages,
            T01_in=T02, eta_poly=cfg.eta_c_stage, eta_st=cfg.eta_c_stage,
            gamma_c=cfg.gamma_c,
        )
        T03 = comp["T01_out"]
        pi_actual = comp["pi_actual"]
        p03 = p02 * pi_actual
        eta_c_overall = overall_isentropic_efficiency(pi_actual, cfg.eta_c_stage, cfg.gamma_c)
        result.compressor = {**comp, "p03": p03, "pi_actual": pi_actual,
                              "eta_c_overall_derived": eta_c_overall, "type": "axial"}
    elif cfg.compressor_type == "centrifugal":
        a01 = (cfg.gamma_c * R_c * T02) ** 0.5
        stages = []
        T01_running, p_rel_running = T02, 1.0
        for _ in range(cfg.n_compressor_stages):
            pi_stage = centrifugal_stage_pressure_ratio(
                cfg.eta_c_stage, cfg.centrifugal_U2, a01, cfg.gamma_c,
            )
            dT_ratio = centrifugal_temp_rise_ratio(cfg.centrifugal_U2, a01, cfg.gamma_c)
            dT0 = dT_ratio * T01_running
            stages.append({"T01_in": T01_running, "T01_out": T01_running + dT0,
                           "dT0": dT0, "pi_stage": pi_stage,
                           "p01_in_rel": p_rel_running, "p01_out_rel": p_rel_running * pi_stage})
            T01_running += dT0
            p_rel_running *= pi_stage
            a01 = (cfg.gamma_c * R_c * T01_running) ** 0.5
        T03 = T01_running
        pi_actual = p_rel_running
        p03 = p02 * pi_actual
        result.compressor = {"stages": stages, "T01_out": T03, "pi_actual": pi_actual,
                              "p03": p03, "type": "centrifugal"}
    else:
        raise ValueError(f"Unknown compressor_type: {cfg.compressor_type!r}")

    # --- Combustor (identical to the turbojet) ---
    f = fuel_air_ratio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04 = combustor_exit_pressure(p03, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "p04": p04, "T04": cfg.T04}
    mass_factor = 1.0 + f - cfg.bleed_ratio

    # --- Turbine/nozzle power split (Ref: reference/turboprop.md §2.1-2.2) ---
    delta_hc = cfg.cp_c * (T03 - T02)
    pressure_term = (p_a / p04) ** ((cfg.gamma_h - 1.0) / cfg.gamma_h)
    if pressure_term >= 1.0:
        raise ValueError(
            f"solve_turboprop: non-physical (pa/p04={pressure_term:.4f} >= 1) — "
            f"combustor exit pressure p04 must exceed ambient for the turbine/"
            f"nozzle to expand at all; check pi_c and delta_p_cc_pct."
        )
    delta_h = cfg.cp_h * cfg.T04 * (1.0 - pressure_term)
    delta_h_ts = cfg.alpha * delta_h
    delta_h_ns = (1.0 - cfg.alpha) * delta_h

    delta_ht = cfg.eta_t * delta_h_ts  # actual (thermodynamic) turbine specific work
    T05 = cfg.T04 - delta_ht / cfg.cp_h
    p05_over_p04 = turbine_pressure_ratio(T05 / cfg.T04, cfg.eta_t, cfg.gamma_h)
    p05 = p05_over_p04 * p04

    # --- Turbine stage-stacking for display (identical machinery to the
    # turbojet — engine.py's own comment on architecture-independence
    # applies here too: turbine_type/n_turbine_stages only change how this
    # already-fixed expansion is broken up for the stage table). ---
    if cfg.turbine_type == "axial":
        turb = stack_axial_turbine(p05_over_p04, cfg.n_turbine_stages, cfg.T04,
                                    cfg.eta_t, cfg.gamma_h)
        result.turbine = {**turb, "type": "axial"}
    elif cfg.turbine_type == "radial":
        if cfg.n_turbine_stages != 1:
            raise ValueError(
                "Radial turbines are single-stage only in this model — "
                "the source (§6.2) notes multi-staging a radial turbine "
                "is impractical."
            )
        T03ss_approx = cfg.T04 - (cfg.T04 - T05) / cfg.eta_t
        V0 = spouting_velocity(cfg.cp_h, cfg.T04, T03ss_approx)
        U2 = radial_turbine_size_U2(V0)
        result.turbine = {
            "type": "radial", "T01_out": T05, "pr_actual": p05_over_p04,
            "V0_spouting": V0, "U2_sized": U2,
            "stages": [{"T01_in": cfg.T04, "T01_out": T05,
                       "dT0": cfg.T04 - T05, "pr_stage": p05_over_p04}],
        }
    else:
        raise ValueError(f"Unknown turbine_type: {cfg.turbine_type!r}")

    # --- Nozzle: always fully expanded to ambient in this model (no
    # choking check — see module/class docstrings) ---
    ue = (2.0 * cfg.eta_N * delta_h_ns) ** 0.5
    T_exit = T05 - ue ** 2 / (2.0 * cfg.cp_h)
    p_exit = p_a
    rho_exit = p_exit / (R_h * T_exit) if T_exit > 0 else float("nan")
    result.nozzle = {"choked": False, "p_exit": p_exit, "T_exit": T_exit,
                      "V_exit": ue, "rho_exit": rho_exit}

    # --- Shaft power and propeller thrust (Ref §2.2) ---
    Wshaft = cfg.eta_mt * mass_factor * delta_ht - delta_hc / cfg.eta_mc
    shaft_power_W = Wshaft * cfg.mdot_a
    Tpr = cfg.mdot_a * cfg.eta_Pr * cfg.eta_g * Wshaft / V_flight
    Tn = cfg.mdot_a * (mass_factor * ue - V_flight)
    T_total = Tpr + Tn
    result.propeller = {"Wshaft": Wshaft, "shaft_power_W": shaft_power_W,
                         "Tpr": Tpr, "Tn": Tn}

    # Optimum split, for comparison against the configured alpha (Ref
    # §2.2 — informational only; this solver does not auto-select alpha).
    alpha_opt = 1.0 - (V_flight ** 2 / (2.0 * delta_h)) * (
        cfg.eta_N / (cfg.eta_Pr ** 2 * cfg.eta_g ** 2 * cfg.eta_mt ** 2 * cfg.eta_t ** 2)
    )

    # --- Overall performance ---
    sp_thrust = T_total / cfg.mdot_a
    tsfc_val = perf_tsfc(f, sp_thrust)
    mdot_f = f * cfg.mdot_a
    # ESHP: equivalent shaft horsepower, in Watts — this project's SI
    # rewrite of the source's imperial "shp + jet_thrust/constant" form
    # (reference/turboprop.md §2.4, judgment call #4): in SI, Tn*V_flight
    # is already a power (W) with no unit-conversion constant needed;
    # dividing by eta_Pr expresses that jet-thrust power in the same
    # "as if it went through the propeller" terms as shaft_power_W.
    ESHP_W = shaft_power_W + Tn * V_flight / cfg.eta_Pr
    ESFC_kg_per_kWh = (mdot_f * 3600.0 * 1000.0) / ESHP_W if ESHP_W > 0 else float("nan")
    eta_0 = (T_total * V_flight / (mdot_f * cfg.Q_R)) if mdot_f > 0 else None
    result.performance = {
        "thrust": T_total, "specific_thrust": sp_thrust, "tsfc": tsfc_val,
        "f": f, "eta_overall": eta_0,
        "ESHP_W": ESHP_W, "ESFC_kg_per_kWh": ESFC_kg_per_kWh,
        "alpha": cfg.alpha, "alpha_opt": alpha_opt,
    }

    # --- Key-station table: a, 2, 3, 4, 5, 9 — same six stations as the
    # turbojet's (reuses StationTable/EngineDiagram unmodified on the
    # web side). Station 9's velocity is the residual jet's exit
    # velocity, not a propeller-inclusive figure — the propeller's
    # contribution isn't a flow station in this alpha-split model, it's
    # reported separately in `propeller`/`performance`.
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "5": Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "9": Station.from_static("9", T_exit, p_exit, ue, cfg.gamma_h, cfg.cp_h, R_h),
    }

    return result
