"""
Scramjet (supersonic-combustion ramjet) — intake, combustor, nozzle, no
rotating machinery. Unlike a ramjet, the intake only partly decelerates
the flow, which stays SUPERSONIC through the combustor.

Ref: `reference/scramjet.md` (NPTEL "Introduction to Airbreathing
Propulsion", Lecture 27 — the only source; Ganesan has no scramjet
material). Stations: 1 = freestream / intake inlet, 2 = combustor
entrance, 3 = combustor exit / nozzle entrance, 4 = nozzle exit.

Judgment calls (reference/scramjet.md §4), resolved here:
  1. Nozzle exit temperature: the source writes
     T4 = T3 - T3*eta_N*(1 - (p2/p3)^((g-1)/g)), verified verbatim (not
     an OCR slip) but physically anomalous for a 3->4 expansion. This
     module uses (p_a/p3) instead — nozzle fully expanded to ambient —
     a deliberate, documented deviation.
  2. Isp = T/(mdot_f*g), fuel flow (same-lecturer precedent elsewhere in
     the course).
  3. T02 = T2*(1+(gamma_c-1)/2*M2^2) — not given for this station, but
     the identical identity is derived by the same lecturer for the
     ramjet's diffuser.
  4. The eta_I -> p2 path is what the solver uses; the MIL-E-5007D
     total-pressure recovery is reported only as a reference value (the
     source never wires it into its own derivation chain).
  5. eta_P and eta_th use the source's own f<<1 forms, eta_P =
     2V1/(V1+V4) and eta_th = (V4^2-V1^2)/(2 f eta_b Q_R). Its full forms
     leave out the fuel's onboard kinetic energy and give eta_P > 1 at
     typical scramjet conditions (V4 only slightly above V1).

Combustor exit Mach M3 isn't given directly: the source's own T03/T02
relation (§2.2) is solved for M3 on the supersonic branch by bisection.
Too much heat for the given M2 thermally chokes the combustor (M3 would
need to drop below 1) — raised as an error, same fail-loud convention as
elsewhere. p3 uses gamma_c for both Mach terms exactly as transcribed.

Atmosphere is the project's ISA troposphere (0-11 km) only — real
scramjets fly higher, but the stratosphere isn't sourced (atmosphere.py).
"""

from dataclasses import dataclass, field

from . import constants as C
from .atmosphere import isa_troposphere, freestream_stagnation
from .gasstate import Station

G0 = 9.80665


@dataclass
class ScramjetConfig:
    altitude_m: float = 10000.0
    mach_flight: float = 6.0     # M1 — scramjets need roughly Mach 5+ (§3)

    # Intake: decelerates M1 -> M2, but M2 stays supersonic.
    mach_combustor_inlet: float = 2.5   # M2 — NOT IN SOURCE numerically
    eta_I: float = 0.90                  # intake isentropic efficiency — NOT IN SOURCE

    # Combustor
    f: float = 0.02                      # fuel-air ratio (source is f-driven, §2.2)
    eta_b: float = C.DEFAULTS["eta_b"]
    Q_R: float = C.DEFAULTS["Q_R"]

    # Nozzle
    eta_N: float = C.DEFAULTS["eta_N"]

    mdot_a: float = 1.0

    gamma_c: float = C.GAMMA_C
    cp_c: float = C.CP_C
    gamma_h: float = C.GAMMA_H
    cp_h: float = C.CP_H


@dataclass
class ScramjetResult:
    config: ScramjetConfig
    atmosphere: dict = field(default_factory=dict)
    intake: dict = field(default_factory=dict)
    combustor: dict = field(default_factory=dict)
    nozzle: dict = field(default_factory=dict)
    performance: dict = field(default_factory=dict)
    stations: dict = field(default_factory=dict)


def mil_e_5007d_recovery(M1: float) -> float:
    """p02/p01 = 1 (M<1); 1-0.776(M-1)^1.5 (1<M<5); 800/(M^4+935) (M>5). Ref §2.1."""
    if M1 <= 1.0:
        return 1.0
    if M1 <= 5.0:
        return 1.0 - 0.776 * (M1 - 1.0) ** 1.5
    return 800.0 / (M1 ** 4 + 935.0)


def rayleigh_temp_ratio(M2: float, M3: float, gamma_c: float, gamma_h: float) -> float:
    """T03/T02 = (M3/M2)^2 * [(1+gc*M2^2)/(1+gh*M3^2)]^2 * (1+(gh-1)/2*M3^2)/(1+(gc-1)/2*M2^2). Ref §2.2."""
    return ((M3 ** 2 / M2 ** 2)
            * ((1.0 + gamma_c * M2 ** 2) / (1.0 + gamma_h * M3 ** 2)) ** 2
            * (1.0 + 0.5 * (gamma_h - 1.0) * M3 ** 2) / (1.0 + 0.5 * (gamma_c - 1.0) * M2 ** 2))


def solve_combustor_exit_mach(target: float, M2: float, gamma_c: float, gamma_h: float) -> float:
    """Supersonic-branch M3 with rayleigh_temp_ratio(M2, M3) == target.

    On M3 > 1 the ratio falls monotonically as M3 rises, so bisect between
    1 and a large upper bound. Target above the M3 = 1 value means the
    combustor thermally chokes.
    """
    lo, hi = 1.0, 50.0
    if target > rayleigh_temp_ratio(M2, lo, gamma_c, gamma_h):
        raise ValueError(
            f"solve_scramjet: combustor thermally chokes — T03/T02={target:.4f} exceeds "
            f"the maximum heat addition a supersonic flow entering at M2={M2:.3f} can "
            f"absorb before reaching Mach 1. Lower the fuel-air ratio or raise M2."
        )
    if target < rayleigh_temp_ratio(M2, hi, gamma_c, gamma_h):
        raise ValueError(
            f"solve_scramjet: no supersonic combustor-exit Mach for T03/T02={target:.4f}."
        )
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if rayleigh_temp_ratio(M2, mid, gamma_c, gamma_h) > target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def solve_scramjet(cfg: ScramjetConfig) -> ScramjetResult:
    result = ScramjetResult(config=cfg)
    R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c
    R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h
    M1, M2 = cfg.mach_flight, cfg.mach_combustor_inlet

    if not (M2 > 1.0):
        raise ValueError(
            "solve_scramjet: combustor-inlet Mach M2 must be > 1 — a scramjet keeps the "
            "flow supersonic through the combustor (below that it's a ramjet)."
        )
    if not (M1 > M2):
        raise ValueError(
            "solve_scramjet: flight Mach M1 must exceed the combustor-inlet Mach M2 — the "
            "intake decelerates the flow; scramjets need roughly Mach 5+ to operate."
        )

    # --- Atmosphere / station 1 ---
    T1, p1 = isa_troposphere(cfg.altitude_m)
    V1 = M1 * (cfg.gamma_c * R_c * T1) ** 0.5
    T0a, p0a = freestream_stagnation(T1, p1, M1, cfg.gamma_c)
    result.atmosphere = {"T_a": T1, "p_a": p1, "V_flight": V1, "T0a": T0a, "p0a": p0a}

    # --- Intake (§2.1) ---
    gc = cfg.gamma_c
    T2 = T1 * (1.0 + 0.5 * (gc - 1.0) * M1 ** 2) / (1.0 + 0.5 * (gc - 1.0) * M2 ** 2)
    p2 = p1 * (1.0 + cfg.eta_I * (T2 / T1 - 1.0)) ** (gc / (gc - 1.0))
    A2_over_A1 = (M1 / M2) * ((1.0 + 0.5 * (gc - 1.0) * M1 ** 2)
                              / (1.0 + 0.5 * (gc - 1.0) * M2 ** 2)) ** ((gc + 1.0) / (2.0 * (gc - 1.0)))
    T02 = T2 * (1.0 + 0.5 * (gc - 1.0) * M2 ** 2)  # judgment call #3
    V2 = M2 * (gc * R_c * T2) ** 0.5
    result.intake = {"T2": T2, "p2": p2, "T02": T02, "A2_over_A1": A2_over_A1,
                     "M2": M2, "recovery_mil_e_5007d": mil_e_5007d_recovery(M1)}

    # --- Combustor (§2.2), per unit air mass flow ---
    f = cfg.f
    T03 = (f * cfg.eta_b * cfg.Q_R + cfg.cp_c * T02) / (cfg.cp_h * (1.0 + f))
    M3 = solve_combustor_exit_mach(T03 / T02, M2, gc, cfg.gamma_h)
    p3 = p2 * (1.0 + gc * M2 ** 2) / (1.0 + gc * M3 ** 2)
    T3 = T03 / (1.0 + 0.5 * (cfg.gamma_h - 1.0) * M3 ** 2)
    V3 = M3 * (cfg.gamma_h * R_h * T3) ** 0.5
    result.combustor = {"f": f, "T03": T03, "T03_over_T02": T03 / T02,
                        "M3": M3, "p3": p3, "T3": T3}

    # --- Nozzle (§2.3), expanded to ambient — judgment call #1 ---
    gh = cfg.gamma_h
    p4 = p1
    if p3 <= p4:
        raise ValueError(
            f"solve_scramjet: combustor-exit static pressure p3={p3:.1f} Pa is not above "
            f"ambient ({p4:.1f} Pa) — nothing left for the nozzle to expand."
        )
    T4 = T3 - T3 * cfg.eta_N * (1.0 - (p4 / p3) ** ((gh - 1.0) / gh))
    V4 = (2.0 * cfg.cp_h * (T03 - T4)) ** 0.5
    result.nozzle = {"T4": T4, "p4": p4, "V4": V4, "p_exit": p4, "T_exit": T4, "V_exit": V4}

    # --- Performance (§2.4) ---
    sp_thrust = (1.0 + f) * V4 - V1
    thrust = cfg.mdot_a * sp_thrust
    mdot_f = f * cfg.mdot_a
    tsfc = f / sp_thrust if sp_thrust > 0 else float("nan")
    # The source's own f<<1 forms (§2.4). Its full forms don't credit the
    # fuel's onboard kinetic energy, which for a scramjet (V4 only a bit
    # above V1) pushes eta_P above 1 — unphysical, so not used.
    eta_P = 2.0 * V1 / (V1 + V4)
    eta_th = (V4 ** 2 - V1 ** 2) / (2.0 * f * cfg.eta_b * cfg.Q_R) if f > 0 else None
    eta_o = eta_P * eta_th if (eta_P is not None and eta_th is not None) else None
    isp = thrust / (mdot_f * G0) if mdot_f > 0 else None
    result.performance = {
        "thrust": thrust, "specific_thrust": sp_thrust, "tsfc": tsfc, "f": f,
        "eta_propulsive": eta_P, "eta_thermal": eta_th, "eta_overall": eta_o,
        "isp_s": isp,
    }

    # --- Stations: 1 (freestream), 2, 3 (both supersonic), 4 (nozzle exit) ---
    result.stations = {
        "1": Station.from_static("1", T1, p1, V1, gc, cfg.cp_c, R_c),
        "2": Station.from_static("2", T2, p2, V2, gc, cfg.cp_c, R_c),
        "3": Station.from_static("3", T3, p3, V3, gh, cfg.cp_h, R_h),
        "4": Station.from_static("4", T4, p4, V4, gh, cfg.cp_h, R_h),
    }
    return result
