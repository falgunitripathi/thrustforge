"""
Turboshaft — same gas-generator core as the turbojet/turboprop (intake,
compressor, combustor), but the turbine expands ALL the way to ambient
pressure and every bit of that work goes to an output shaft driving an
external load (a helicopter rotor, generator, marine propulsor, ...) —
there is no residual jet thrust at all, unlike the turboprop.

Ref: `reference/turboshaft.md` §2.1 (single-spool architecture; this
module implements the single-spool case, not the twin-spool free-turbine
variant also described there), compiled from NPTEL "Introduction to
Airbreathing Propulsion", Lecture 35. No independent secondary source
exists for this engine type in the extracted material — see that file's
"Judgment calls" section, item 1, for the validation-gap this leaves.

Architecture note: this is the turboprop's single-spool alpha-split
model (aeropropsim/turboprop.py) with alpha implicitly = 1.0 — ALL of
the ideal enthalpy drop from p04 to ambient pressure goes to the shaft,
none held back for a nozzle. reference/turboshaft.md's source material
never spells out the turbine's own specific-work formula (it just says
"assuming full expansion in the turbine"); the derivation used here
(turbine expands to p05 = p_a exactly, with `eta_t` derating the
resulting temperature drop below its isentropic value) is this
project's own inference, documented in that file rather than a literal
transcription — flagged accordingly.

Because the turbine here always expands fully to ambient (p05 = p_a by
construction, not derived from a stage-stack the way the turbojet's
p05 is), there is no station 9 / nozzle at all — station 5 IS the
exhaust state, and this project follows the source's own silence on any
residual exhaust velocity/thrust by treating it as V=0 (negligible),
the same way real-world turboshaft performance reporting ignores
exhaust thrust entirely.
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .compressor import (
    stack_axial_compressor, centrifugal_stage_pressure_ratio,
    centrifugal_temp_rise_ratio, overall_isentropic_efficiency,
)
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .turbine import stack_axial_turbine, spouting_velocity, radial_turbine_size_U2
from .gasstate import Station


@dataclass
class TurboshaftConfig:
    # --- Flight condition --- Unlike the turboprop/ramjet, nothing here
    # divides by flight speed — a turboshaft has no thrust to compute, so
    # mach_flight=0 (a helicopter in the hover it's actually built for)
    # is a perfectly ordinary input, not an edge case.
    altitude_m: float = 0.0
    mach_flight: float = 0.0

    # --- Compressor --- identical fields/meaning to EngineConfig.
    compressor_type: str = "axial"
    n_compressor_stages: int = 8
    pi_c: float = 10.0
    centrifugal_U2: float = 400.0

    # --- Combustor ---
    T04: float = 1400.0

    # --- Turbine --- eta_t is this turbine's isentropic efficiency.
    # turbine_type/n_turbine_stages only affect how the already-fixed
    # (p05 = p_a) expansion is displayed as a stage table — same
    # architecture-independence as the turbojet/turboprop.
    turbine_type: str = "axial"
    n_turbine_stages: int = 2
    eta_t: float = C.DEFAULTS["eta_tt_stage"]

    # --- Shaft / load --- Ref: reference/turboshaft.md §2.1.
    eta_mt: float = C.DEFAULTS["eta_m"]   # turbine mechanical efficiency
    eta_mc: float = C.DEFAULTS["eta_m"]   # compressor mechanical efficiency
    eta_m: float = C.DEFAULTS["eta_m"]    # load-drive mechanical efficiency (e.g. rotor friction)
    bleed_ratio: float = 0.0              # b = mdot_bleed/mdot_a

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
class TurboshaftResult:
    config: TurboshaftConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    compressor: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    turbine: dict = field(default_factory=dict)
    shaft: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def solve_turboshaft(cfg: TurboshaftConfig) -> TurboshaftResult:
    """Solve one single-design-point single-spool turboshaft cycle.

    Solve order: atmosphere -> intake -> compressor (identical to the
    turbojet) -> combustor -> turbine full expansion to ambient
    (turboshaft-specific) -> turbine stage-stack (for display) -> shaft/
    load power.
    """
    result = TurboshaftResult(config=cfg)
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

    # --- Turbine: full expansion to ambient pressure (Ref: reference/
    # turboshaft.md §2.1 + this module's own docstring on the inferred
    # Wt derivation) ---
    pressure_term = (p_a / p04) ** ((cfg.gamma_h - 1.0) / cfg.gamma_h)
    if pressure_term >= 1.0:
        raise ValueError(
            f"solve_turboshaft: non-physical (pa/p04={pressure_term:.4f} >= 1) — "
            f"combustor exit pressure p04 must exceed ambient for the turbine "
            f"to expand at all; check pi_c and delta_p_cc_pct."
        )
    T05s = cfg.T04 * pressure_term  # isentropic exit temperature for full expansion to p_a
    Wt = cfg.eta_t * cfg.cp_h * (cfg.T04 - T05s)  # actual turbine specific work
    T05 = cfg.T04 - Wt / cfg.cp_h
    p05 = p_a
    p05_over_p04 = p05 / p04

    # --- Turbine stage-stacking for display (identical machinery to the
    # turbojet/turboprop — architecture-independence: turbine_type/
    # n_turbine_stages only change how this already-fixed expansion is
    # broken up for the stage table, never Wt/T05/Pload). ---
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
        V0 = spouting_velocity(cfg.cp_h, cfg.T04, T05s)
        U2 = radial_turbine_size_U2(V0)
        result.turbine = {
            "type": "radial", "T01_out": T05, "pr_actual": p05_over_p04,
            "V0_spouting": V0, "U2_sized": U2,
            "stages": [{"T01_in": cfg.T04, "T01_out": T05,
                       "dT0": cfg.T04 - T05, "pr_stage": p05_over_p04}],
        }
    else:
        raise ValueError(f"Unknown turbine_type: {cfg.turbine_type!r}")

    # --- Shaft and load power (Ref §2.1) ---
    Wc = cfg.cp_c * (T03 - T02)
    Wshaft = mass_factor * cfg.eta_mt * Wt - Wc / cfg.eta_mc
    if Wshaft <= 0:
        raise ValueError(
            f"solve_turboshaft: the compressor needs more power than the turbine can "
            f"supply (net shaft power would be {Wshaft * cfg.mdot_a / 1000:.1f} kW). "
            f"Lower the compressor pressure ratio or stage count, or raise the "
            f"turbine inlet temperature."
        )
    Wload = cfg.eta_m * Wshaft
    Pload_W = cfg.mdot_a * Wload
    result.shaft = {"Wc": Wc, "Wt": Wt, "Wshaft": Wshaft, "Wload": Wload, "Pload_W": Pload_W}

    # --- Overall performance --- SFC referenced to shaft power, by
    # analogy to the turboprop's ESFC (reference/turboshaft.md §4, item
    # 4 — this exact form isn't spelled out in the source for
    # turboshaft, only inferred by analogy, documented there).
    mdot_f = f * cfg.mdot_a
    SFC_kg_per_kWh = (mdot_f * 3600.0 * 1000.0) / Pload_W if Pload_W > 0 else float("nan")
    result.performance = {"Pload_W": Pload_W, "SFC_kg_per_kWh": SFC_kg_per_kWh, "f": f}

    # --- Key-station table: a, 2, 3, 4, 5 only — no station 9. The
    # turbine's exit (station 5) IS the exhaust; this model follows the
    # source's own silence on residual exhaust velocity/thrust and
    # treats it as negligible (V=0), matching how real turboshaft
    # performance reporting ignores exhaust thrust entirely.
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "5": Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
    }

    return result
