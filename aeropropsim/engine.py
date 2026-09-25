"""
Engine orchestrator — wires every component module together in the
recommended single-design-point solve order.

Ref: §11 (Implementation Notes for AeroPropSim), "Recommended
single-design-point solve order":
  1. §1 Atmosphere -> ambient Ta, pa; freestream stagnation state.
  2. §3 Intake -> T02, p02.
  3. §4 Compressor -> stage-stack to overall pi_c, get T03, p03, and
     per-stage station table.
  4. §5 Combustor -> solve f for the specified TIT (T04), apply pressure
     loss for p04.
  5. §7 Shaft balance -> T05, p05 from the compressor's power demand (NOT
     from an assumed turbine PR).
  6. §6 Turbine -> stage-stack the resulting overall expansion ratio
     p04/p05 across the chosen turbine stage count, for the per-stage
     station table.
  7. §8 Nozzle -> choking check, exit velocity, exit pressure.
  8. §9 Overall performance -> thrust, TSFC, efficiencies from the
     station-9 exit state.

Architecture note: the turbine's THERMODYNAMIC station values (T05, p05)
come entirely from step 5 (shaft power balance) regardless of whether the
turbine is axial or radial — choosing "axial" vs. "radial" only changes
how many stages are used to reach that expansion and how blade speeds are
sized, not the fundamental cycle numbers. A radial turbine is modelled as
single-stage only (n_stages > 1 raises an error) per the source's own
design guidance (§6.2): "multi-staging a radial turbine is impractical."
"""

from dataclasses import dataclass, field
from typing import Optional

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .intake import intake_exit_state
from .compressor import (
    stack_axial_compressor, centrifugal_stage_pressure_ratio,
    overall_isentropic_efficiency,
)
from .combustor import fuel_air_ratio, combustor_exit_pressure
from .matching import turbine_temp_ratio, turbine_pressure_ratio
from .turbine import (
    stack_axial_turbine, spouting_velocity, radial_turbine_size_U2,
)
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
class EngineConfig:
    # --- Flight condition ---
    altitude_m: float = 0.0
    mach_flight: float = 0.0

    # --- Compressor ---
    compressor_type: str = "axial"          # "axial" | "centrifugal"
    n_compressor_stages: int = 1
    pi_c: float = 8.0                        # target overall PR (axial mode)
    centrifugal_U2: float = 400.0            # m/s, per stage (centrifugal mode)

    # --- Combustor ---
    T04: float = 1400.0                      # K, turbine inlet temperature (TIT)

    # --- Turbine ---
    turbine_type: str = "axial"              # "axial" | "radial"
    n_turbine_stages: int = 1

    # --- Afterburner (NPTEL p.291-296, single-spool turbojet) --- Off by
    # default, so the engine is exactly the plain turbojet; when lit, the
    # gas is re-heated to T06_ab between the turbine and the nozzle.
    afterburner_on: bool = False
    T06_ab: float = 2000.0                   # K, T06A = Tmax (no turbine downstream)
    delta_p_ab_pct: float = 0.05             # p06 = p05*(1 - dp_ab%) — NOT IN SOURCE numerically

    # --- Nozzle ---
    nozzle_type: str = "convergent"          # "convergent" | "conv-di"
    nozzle_exit_mach_design: Optional[float] = None  # required if "conv-di"

    # --- Mass flow ---
    mdot_a: float = 1.0                      # kg/s (v1 default: per-unit-mass-flow)

    # --- Efficiencies / constants (default from constants.DEFAULTS, §10) ---
    eta_d: float = C.DEFAULTS["eta_d"]
    eta_c_stage: float = C.DEFAULTS["eta_c_stage"]
    sigma_slip: float = C.DEFAULTS["sigma_slip"]
    eta_b: float = C.DEFAULTS["eta_b"]
    delta_p_cc_pct: float = C.DEFAULTS["delta_p_cc_pct"]
    Q_R: float = C.DEFAULTS["Q_R"]
    lambda_shaft: float = C.DEFAULTS["lambda_shaft"]
    eta_m: float = C.DEFAULTS["eta_m"]
    eta_tt_stage: float = C.DEFAULTS["eta_tt_stage"]
    eta_N: float = C.DEFAULTS["eta_N"]

    # gas properties (rarely overridden; exposed for what-if experiments)
    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class EngineResult:
    config: EngineConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    compressor: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    shaft: dict = field(default_factory=dict)
    turbine: dict = field(default_factory=dict)
    afterburner: dict = field(default_factory=dict)
    nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)  # key stations -> Station


def solve_engine(cfg: EngineConfig) -> EngineResult:
    """Solve one single-design-point turbojet cycle. Ref: §11 solve order."""
    result = EngineResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h

    # --- Step 1: Atmosphere (§1) ---
    T_a, p_a = isa_troposphere(cfg.altitude_m)
    V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5
    T0a, p0a = freestream_stagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c)
    result.atmosphere = {"T_a": T_a, "p_a": p_a, "V_flight": V_flight,
                          "T0a": T0a, "p0a": p0a}

    # --- Step 2: Intake (§3) ---
    intake = intake_exit_state(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c)
    result.intake = intake
    T02, p02 = intake["T02"], intake["p02"]

    # --- Step 3: Compressor (§4) ---
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
            from .compressor import centrifugal_temp_rise_ratio
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

    # --- Step 4: Combustor (§5) ---
    f = fuel_air_ratio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h)
    p04 = combustor_exit_pressure(p03, cfg.delta_p_cc_pct)
    result.combustor = {"f": f, "p04": p04, "T04": cfg.T04}

    # --- Step 5: Shaft power balance (§7) ---
    T05_over_T04 = turbine_temp_ratio(T02, T03, cfg.T04, cfg.lambda_shaft,
                                       cfg.eta_m, f, cfg.cp_c, cfg.cp_h)
    T05 = T05_over_T04 * cfg.T04
    # eta_t here is the OVERALL turbine isentropic efficiency needed for the
    # pressure-ratio step; approximate it with the per-stage eta_tt_stage
    # (a total-to-total value) as the working overall value for v1 — see
    # README "Known simplifications" item 8 (quantifies the resulting gap
    # vs. a true stage-by-stage reheat-factor calculation).
    p05_over_p04 = turbine_pressure_ratio(T05_over_T04, cfg.eta_tt_stage, cfg.gamma_h)
    p05 = p05_over_p04 * p04
    result.shaft = {"T05": T05, "p05": p05, "T05_over_T04": T05_over_T04,
                    "p05_over_p04": p05_over_p04}

    # --- Step 6: Turbine stage-stacking (§6) ---
    if cfg.turbine_type == "axial":
        turb = stack_axial_turbine(p05_over_p04, cfg.n_turbine_stages, cfg.T04,
                                    cfg.eta_tt_stage, cfg.gamma_h)
        result.turbine = {**turb, "type": "axial"}
    elif cfg.turbine_type == "radial":
        if cfg.n_turbine_stages != 1:
            raise ValueError(
                "Radial turbines are single-stage only in this model — "
                "the source (§6.2) notes multi-staging a radial turbine "
                "is impractical."
            )
        # Informational radial-specific sizing, computed from the cycle's
        # own T04/T05 (see module docstring: cycle numbers are architecture-
        # independent). T03ss below is the radial turbine's own local
        # notation for the ideal static exit temp; approximate here using
        # the stage's own T05 as the (only) stage.
        T03ss_approx = cfg.T04 - (cfg.T04 - T05) / cfg.eta_tt_stage
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

    # --- Step 6b: Afterburner (NPTEL p.291-296) ---
    # Lit: T06A = Tmax, p06 = p05(1 - dp_ab%), and the energy balance
    # (1+f)Cp5*T05 + eta_b*fab*Q_R = (1+f+fab)Cp6*T06A gives
    # fab = (1+f)(Cp6*T06A - Cp5*T05)/(eta_b*Q_R - Cp6*T06A), with
    # Cp5 = Cp6 = cp_h. Off: the engine is the plain turbojet (no AB duct,
    # so no duct loss either — T06 = T05, p06 = p05).
    if cfg.afterburner_on:
        if not (cfg.T06_ab > T05):
            raise ValueError(
                f"solve_engine: the afterburner exit temperature T06 = {cfg.T06_ab:.0f} K must "
                f"be above the turbine exit temperature T05 = {T05:.0f} K — an afterburner "
                f"can only add heat. Raise T06 or turn the afterburner off."
            )
        ab_denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T06_ab
        if not (ab_denom > 0):
            raise ValueError(
                "solve_engine: the afterburner exit temperature is too high for this fuel — even "
                "burning it perfectly can't heat the gas that much. Lower T06."
            )
        fab = (1.0 + f) * (cfg.cp_h * cfg.T06_ab - cfg.cp_h * T05) / ab_denom
        T06 = cfg.T06_ab
        p06 = p05 * (1.0 - cfg.delta_p_ab_pct)
    else:
        fab, T06, p06 = 0.0, T05, p05
    f_total = f + fab
    result.afterburner = {"on": cfg.afterburner_on, "fab": fab, "T05": T05, "p05": p05,
                          "T06": T06, "p06": p06}

    # --- Step 7: Nozzle (§8) --- expands from station 6 (= 5 with the
    # afterburner off).
    p_c = critical_pressure(p06, cfg.eta_N, cfg.gamma_h)
    choked = is_choked(p_c, p_a)
    if choked:
        T_exit = choked_exit_temperature(T06, cfg.gamma_h)
        V_exit = choked_exit_velocity(T_exit, cfg.gamma_h, R_h)
        p_exit = p_c
    else:
        V_exit = unchoked_exit_velocity(T06, p_a, p06, cfg.eta_N, cfg.gamma_h, cfg.cp_h)
        p_exit = p_a
        T_exit = T06 - V_exit ** 2 / (2.0 * cfg.cp_h)  # for rho_exit below

    rho_exit = p_exit / (R_h * T_exit)
    # Ae/mdot_a from mass continuity (mdot_exit = mdot_a*(1+f+fab) = rho*Ae*V):
    # this lets specific thrust/TSFC be reported per unit mass flow without
    # requiring an assumed absolute engine size (see engine.py module note).
    Ae_over_mdot_a = (1.0 + f_total) / (rho_exit * V_exit)
    A_exit = Ae_over_mdot_a * cfg.mdot_a

    T_val = nozzle_thrust(cfg.mdot_a, f_total, V_exit, V_flight, p_exit, p_a, A_exit)
    result.nozzle = {"choked": choked, "p_c": p_c, "p_exit": p_exit,
                      "T_exit": T_exit, "V_exit": V_exit, "rho_exit": rho_exit,
                      "A_exit": A_exit}

    # --- Step 8: Overall performance (§9) ---
    # (1+f+fab) and (f+fab) throughout — NPTEL p.296's T/mdot_a and TSFC.
    sp_thrust = perf_specific_thrust(f_total, V_exit, V_flight, A_exit, cfg.mdot_a, p_exit, p_a)
    tsfc_val = perf_tsfc(f_total, sp_thrust)
    eta_th = thermal_efficiency(f_total, V_exit, V_flight, cfg.Q_R) if V_flight > 0 or f_total > 0 else None
    eta_p = propulsive_efficiency(V_flight, V_exit) if V_flight > 0 else 0.0
    eta_0 = overall_efficiency_from_components(eta_th, eta_p) if eta_th is not None else None
    result.performance = {
        "thrust": T_val, "specific_thrust": sp_thrust, "tsfc": tsfc_val,
        "eta_thermal": eta_th, "eta_propulsive": eta_p, "eta_overall": eta_0,
        "f": f, "f_ab": fab, "f_total": f_total,
    }

    # --- Key-station table (for a "Station Analysis" view) ---
    result.stations = {
        "a": Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V=V_flight),
        "2": Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "3": Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, V=0.0),
        "4": Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        "5": Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, V=0.0),
        **({"6": Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, V=0.0)}
           if cfg.afterburner_on else {}),
        # Station 9 (nozzle exit) is built FROM its already-known static
        # state (T_exit, p_exit, V_exit — all already loss-aware, computed
        # in the §8 nozzle step above), not from (T05, p05, V_exit) — see
        # Station.from_static's docstring for why that distinction matters.
        # Its reported p0 will come out < p05, correctly showing the
        # nozzle's real total-pressure loss; its reported T0 should equal
        # T05 (adiabatic nozzle, no heat transfer) as a self-consistency
        # check.
        "9": Station.from_static("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
    }

    return result
