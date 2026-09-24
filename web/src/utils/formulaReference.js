/**
 * The full formula set actually implemented for each engine, grouped by
 * component — the content behind the "Download formulas" export (see
 * formulasReport.js). Curated directly from each engine's own Python
 * module (aeropropsim/*.py) and its cited reference/*.md, so this
 * matches exactly what the app computes — not a re-derivation, and not
 * the unimplemented variants those reference files also describe (e.g.
 * the turboprop's twin-spool free-turbine case, or the turbofan's
 * mixed-flow/afterburning/geared/three-spool variants).
 *
 * Each entry: { label, formula, note? }. `formula` uses the same plain-
 * text convention as every FormulaLabel/FieldInfoLabel in the app
 * (Greek letters spelled out, subscripts as T04/p03 etc.) so it renders
 * through the same formulaText.jsx typesetting used everywhere else.
 */

const SHARED_INTAKE = {
  section: "Intake",
  entries: [
    {
      label: "Freestream stagnation state",
      formula: "T0a = T_a·[1+(gamma_c-1)/2·M^2], p0a = p_a·[1+(gamma_c-1)/2·M^2]^(gamma_c/(gamma_c-1))",
      note: "Isentropic deceleration from the ambient (static) atmosphere to stagnation conditions at flight Mach M.",
    },
    {
      label: "Intake exit (compressor face) state",
      formula: "T02 = T0a (adiabatic, unaffected by intake losses). p02 = p_a·[1+eta_d·(gamma_c-1)/2·M^2]^(gamma_c/(gamma_c-1))",
      note: "eta_d (intake efficiency, typical 0.70-0.90) scales the pressure-recovery term only — temperature is unaffected by intake losses.",
    },
  ],
};

const TURBOJET_FORMULAS = [
  SHARED_INTAKE,
  {
    section: "Compressor",
    entries: [
      {
        label: "Axial, per-stage pressure ratio",
        formula: "pi_i = (1 + eta_c·deltaT0/T01)^(gamma_c/(gamma_c-1))",
        note: "Stage-stacked (repeated) until the target overall pi_c is reached.",
      },
      {
        label: "Centrifugal, per-stage pressure ratio / temperature rise",
        formula: "pi_stage from sigma (slip factor) and blade tip speed U2; deltaT0/T01 = f(U2, a01, gamma_c)",
        note: "Used when compressor_type = centrifugal instead of axial stage-stacking.",
      },
    ],
  },
  {
    section: "Combustor",
    entries: [
      {
        label: "Fuel-air ratio",
        formula: "f = [(Cp_h/Cp_c)(T04/T03) - 1] / [(eta_b·Q_R)/(Cp_c·T03) - (Cp_h/Cp_c)(T04/T03)]",
        note: "Solved from the combustor's energy balance for the target TIT (T04).",
      },
      { label: "Combustor exit pressure", formula: "p04 = p03·(1 - delta_p_cc)" },
    ],
  },
  {
    section: "Shaft balance & turbine",
    entries: [
      {
        label: "Turbine temperature ratio (shaft balance)",
        formula: "T05/T04 = 1 - Cp_c·(T03-T02) / (lambda·eta_m·(1+f)·Cp_h·T04)",
        note: "Pure energy conservation: the turbine is sized to extract exactly the compressor's power demand.",
      },
      {
        label: "Turbine pressure ratio",
        formula: "p05/p04 = [1 - (1/eta_t)·(1-T05/T04)]^(gamma_h/(gamma_h-1))",
        note: "From the turbine's isentropic-efficiency definition, eta_t = (T04-T05)/(T04-T05s).",
      },
    ],
  },
  {
    section: "Nozzle",
    entries: [
      {
        label: "Critical (choking) pressure",
        formula: "p_c = p0·[1 - (1/eta_N)·(gamma_h-1)/(gamma_h+1)]^(gamma_h/(gamma_h-1))",
      },
      {
        label: "Choked exit velocity/temperature",
        formula: "T_exit = T0·2/(gamma_h+1), V_exit = sqrt(gamma_h·R_h·T_exit)",
        note: "When p_c >= p_a — the nozzle is choked and exit Mach = 1.",
      },
      {
        label: "Unchoked exit velocity",
        formula: "V_exit = sqrt(2·Cp_h·eta_N·T0·[1-(p_a/p0)^((gamma_h-1)/gamma_h)])",
      },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      { label: "Thrust", formula: "T = mdot_a·[(1+f)·V_exit - V_flight] + A_exit·(p_exit-p_a)" },
      { label: "Specific thrust", formula: "T/mdot_a = [(1+f)·V_exit - V_flight] + (A_exit/mdot_a)·(p_exit-p_a)" },
      { label: "TSFC (Thrust-Specific Fuel Consumption)", formula: "TSFC = f / (T/mdot_a)" },
      { label: "Thermal efficiency", formula: "eta_th = [(1+f)·V_exit^2/2 - V_flight^2/2] / (f·Q_R)" },
      { label: "Propulsive efficiency", formula: "eta_p = 2·(V_flight/V_exit) / (1 + V_flight/V_exit)" },
      { label: "Overall efficiency", formula: "eta_0 = eta_th · eta_p = T·V_flight / (mdot_f·Q_R)" },
    ],
  },
];

const TURBOPROP_FORMULAS = [
  SHARED_INTAKE,
  {
    section: "Compressor",
    entries: TURBOJET_FORMULAS[1].entries,
  },
  {
    section: "Combustor",
    entries: TURBOJET_FORMULAS[2].entries,
  },
  {
    section: "Turbine / nozzle power split (single-spool, alpha-split)",
    entries: [
      {
        label: "Turbine's total ideal enthalpy drop",
        formula: "delta_h = Cp_h·T04·[1 - (p_a/p04)^((gamma_h-1)/gamma_h)]",
      },
      {
        label: "Shaft vs. nozzle split",
        formula: "delta_h_ts = alpha·delta_h (shaft share), delta_h_ns = (1-alpha)·delta_h (nozzle share)",
        note: "alpha is a free design choice (typical 0.80-0.90), not solved for by default.",
      },
      { label: "Actual turbine specific work", formula: "delta_ht = eta_t·alpha·delta_h" },
      { label: "Nozzle exit velocity", formula: "ue = sqrt(2·eta_N·(1-alpha)·delta_h)" },
      {
        label: "Shaft power",
        formula: "Wshaft = eta_mt·(1+f-b)·delta_ht - delta_hc/eta_mc",
      },
      {
        label: "Propeller thrust",
        formula: "Tpr = mdot_a·eta_Pr·eta_g·Wshaft / V_flight",
        note: "eta_Pr: propeller efficiency (typical ~80%). eta_g: reduction-gearbox efficiency. Requires V_flight > 0.",
      },
      { label: "Nozzle (residual jet) thrust", formula: "Tn = mdot_a·[(1+f-b)·ue - V_flight]" },
      { label: "Total thrust", formula: "T_total = Tpr + Tn" },
      {
        label: "Mathematically optimal alpha (shown for comparison only)",
        formula: "alpha_opt = 1 - [V_flight^2/(2·delta_h)]·[eta_N/(eta_Pr^2·eta_g^2·eta_mt^2·eta_t^2)]",
      },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      {
        label: "Equivalent shaft power (ESHP)",
        formula: "ESHP = shaft power + Tn·V_flight/eta_Pr",
        note: "This project's SI rewrite of the source's imperial ESHP form — the residual jet's power expressed as if it went through the propeller.",
      },
      {
        label: "Equivalent specific fuel consumption (ESFC)",
        formula: "ESFC = mdot_f / ESHP",
      },
      { label: "TSFC (for comparison with other engines)", formula: "TSFC = f / (T_total/mdot_a)" },
    ],
  },
];

const TURBOSHAFT_FORMULAS = [
  SHARED_INTAKE,
  { section: "Compressor", entries: TURBOJET_FORMULAS[1].entries },
  { section: "Combustor", entries: TURBOJET_FORMULAS[2].entries },
  {
    section: "Turbine (full expansion to ambient)",
    entries: [
      {
        label: "Isentropic exit temperature",
        formula: "T05s = T04·(p_a/p04)^((gamma_h-1)/gamma_h)",
        note: "The turbine always expands all the way down to ambient pressure — there is no residual nozzle/jet at all.",
      },
      { label: "Actual turbine specific work", formula: "Wt = eta_t·Cp_h·(T04-T05s)" },
      { label: "Exit stagnation temperature", formula: "T05 = T04 - Wt/Cp_h  (with p05 = p_a by construction)" },
    ],
  },
  {
    section: "Shaft & load power",
    entries: [
      { label: "Compressor work", formula: "Wc = Cp_c·(T03-T02)" },
      { label: "Shaft power (past the compressor's own draw)", formula: "Wshaft = (1+f-b)·eta_mt·Wt - Wc/eta_mc" },
      {
        label: "Load power",
        formula: "Wload = eta_m·Wshaft, Pload = mdot_a·Wload",
        note: "eta_m: mechanical efficiency between the shaft and the actual load (e.g. rotor friction for a helicopter).",
      },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      {
        label: "Specific fuel consumption (SFC)",
        formula: "SFC = mdot_f / Pload",
        note: "Referenced to load power, by analogy with the turboprop's ESFC — not spelled out explicitly in the source for a turboshaft.",
      },
    ],
  },
];

const TURBOFAN_FORMULAS = [
  {
    section: "Intake (core stream only)",
    entries: SHARED_INTAKE.entries,
  },
  {
    section: "Fan, LPC, HPC",
    entries: [
      {
        label: "One-shot compressor-step form (used by fan, LPC, and HPC each)",
        formula: "T_out/T_in = 1 + (pi^((gamma_c-1)/gamma_c) - 1)/eta, p_out = p_in·pi",
        note: "Each of the fan/LPC (booster)/HPC is a single overall pressure-ratio/efficiency step here — no stage-stacking.",
      },
    ],
  },
  {
    section: "Combustor",
    entries: [
      { label: "Fuel-air ratio", formula: "f = [(Cp_h/Cp_c)(T05/T04) - 1] / [(eta_b·Q_R)/(Cp_c·T04) - (Cp_h/Cp_c)(T05/T04)]" },
      { label: "Combustor exit pressure", formula: "p05 = p04·(1 - delta_p_cc)" },
    ],
  },
  {
    section: "HPT (drives HPC) / LPT (drives fan + LPC)",
    entries: [
      {
        label: "HPT temperature/pressure ratio",
        formula: "T06/T05 = 1 - Cp_c·(T04-T03)/(lambda1·eta_m1·(1+f)·Cp_h·T05), p06/p05 = [1-(1/eta_HPT)(1-T06/T05)]^(gamma_h/(gamma_h-1))",
        note: "Algebraically identical to the turbojet's own shaft balance, just re-labelled stations.",
      },
      {
        label: "LPT temperature/pressure ratio",
        formula: "T07/T06 = 1 - [(1+beta)·Cp_c·(T010-T02) + Cp_c·(T03-T010)] / [lambda2·eta_m2·(1+f)·Cp_h·T06]",
        note: "Carries an extra bypass-ratio (beta) term the HPT balance doesn't have, since the LPT drives the fan too.",
      },
    ],
  },
  {
    section: "Hot & cold (fan) nozzles",
    entries: [
      { label: "Choking / exit velocity", formula: "Same choking-check formulas as the turbojet's nozzle, applied separately to each stream" },
      { label: "Hot-stream thrust", formula: "T_hot = mdot_a·[(1+f)·V9 - V_flight] + A9·(p9-p_a)" },
      { label: "Cold-stream thrust", formula: "T_cold = beta·mdot_a·[V11 - V_flight] + A11·(p11-p_a)" },
      { label: "Total thrust", formula: "T_total = T_hot + T_cold" },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      { label: "TSFC", formula: "TSFC = f / (T_total/mdot_a)" },
      {
        label: "Overall efficiency",
        formula: "eta_0 = T_total·V_flight / (mdot_f·Q_R)",
        note: "The source gives no decomposed thermal/propulsive split for the two-stream case — only this direct definition.",
      },
    ],
  },
];

const PROPFAN_FORMULAS = [
  {
    section: "Intake (core stream only)",
    entries: SHARED_INTAKE.entries,
  },
  {
    section: "IPC, HPC (gas-generator compressors)",
    entries: [
      {
        label: "One-shot compressor-step form (used by IPC and HPC each)",
        formula: "T_out/T_in = 1 + (pi^((gamma_c-1)/gamma_c) - 1)/eta, p_out = p_in·pi",
      },
    ],
  },
  {
    section: "Combustor",
    entries: [
      {
        label: "Fuel-air ratio",
        formula: "f = (1-b)·(Cp_h·T05 - Cp_c·T04) / (eta_b·Q_R - Cp_h·T05)",
        note: "Same energy balance as the turbojet's, with an extra (1-b) bleed prefactor.",
      },
      { label: "Combustor exit pressure", formula: "p05 = p04·(1 - delta_p_cc)" },
    ],
  },
  {
    section: "HPT (drives HPC) / IPT (drives IPC)",
    entries: [
      {
        label: "Bare energy balance (no lambda/eta_m term)",
        formula: "T06 = T05 - Cp_c/((1+f-b)·Cp_h)·(T04-T03)  [HPT];  T07 = T06 - Cp_c/((1+f-b)·Cp_h)·(T03-T02)  [IPT]",
        note: "The source states shaft mechanical efficiency is taken as 100% for both of these turbines.",
      },
      {
        label: "Pressure ratios",
        formula: "p06/p05 = [1-(1/eta_HPT)(1-T06/T05)]^(gamma_h/(gamma_h-1)), p07/p06 = [1-(1/eta_IPT)(1-T07/T06)]^(gamma_h/(gamma_h-1))",
      },
    ],
  },
  {
    section: "Unducted fan (UDF)",
    entries: [
      {
        label: "Fan inlet condition",
        formula: "T010 = T0a, p010 = p0a  (the freestream stagnation state directly — no intake diffuser ahead of the fan)",
      },
      {
        label: "Fan exit condition",
        formula: "T011/T010 = 1 + (pi_UDF^((gamma_c-1)/gamma_c) - 1)/eta_UDF, p011 = p010·pi_UDF",
      },
      { label: "Fan exhaust velocity", formula: "ue_UDF = sqrt(2·Cp_c·(T011-T12)), where T12 = T011·(p_a/p011)^((gamma_c-1)/gamma_c)" },
    ],
  },
  {
    section: "Free (power) turbine & hot nozzle",
    entries: [
      {
        label: "Alpha-split of the ideal expansion-to-ambient",
        formula: "T9s = T07·(p_a/p07)^((gamma_h-1)/gamma_h), T08 = T07 - eta_ft·alpha·(T07-T9s)",
        note: "alpha (typical 0.80-0.90, by analogy with the turboprop) is a fixed design input here, not solved for an optimum.",
      },
      { label: "Hot-nozzle exit velocity", formula: "ue_n = sqrt(2·Cp_h·eta_n·(T08-T9s))" },
      { label: "Hot-nozzle thrust", formula: "Tn = mdot_a·[(1+f-b)·ue_n - V_flight]" },
      {
        label: "Fan power split (solved)",
        formula: "beta·Cp_c·(T011-T010) = eta_m_UDF·(1+f-b)·Cp_h·(T07-T08)",
        note: "Solved for beta, not a configured input.",
      },
      { label: "Fan thrust", formula: "T_UDF = beta·mdot_a·(ue_UDF - V_flight)" },
      { label: "Total thrust", formula: "T_total = T_UDF + Tn" },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      { label: "TSFC", formula: "TSFC = f / (T_total/mdot_a)" },
      {
        label: "Propulsive efficiency (two-stream)",
        formula: "eta_P = T_total·V_flight / (T_total·V_flight + 0.5·mdot_a·[(ue_n-V_flight)^2 + beta·(ue_UDF-V_flight)^2])",
      },
      { label: "Overall efficiency", formula: "eta_0 = T_total·V_flight / (mdot_f·Q_R)" },
    ],
  },
];

// Ramjet — Ref: reference/ramjet.md.
// Stations: a = freestream, 2 = diffuser exit / combustor inlet,
// 4 = combustor exit / nozzle inlet, 9 = nozzle exit. No compressor or
// turbine; the flow is slowed to low subsonic speed before burning.
const RAMJET_FORMULAS = [
  {
    section: "Intake / diffuser (ram compression)",
    entries: [
      { label: "Flight speed", formula: "V = M·sqrt(gamma_c·R_c·T_a), with T_a, p_a from the ISA troposphere at the configured altitude" },
      { label: "Freestream stagnation state", formula: "T0a = T_a·(1 + (gamma_c-1)/2·M^2),  p0a = p_a·(1 + (gamma_c-1)/2·M^2)^(gamma_c/(gamma_c-1))" },
      { label: "Diffuser-exit stagnation temperature", formula: "T02 = T0a", note: "Adiabatic, no work: intake losses don't change stagnation temperature." },
      { label: "Diffuser-exit stagnation pressure", formula: "p02 = p_a·(1 + eta_d·(gamma_c-1)/2·M^2)^(gamma_c/(gamma_c-1))" },
      { label: "Ram pressure ratio / diffuser recovery", formula: "p02/p_a,  r_d = p02/p0a", note: "r_d is computed from eta_d, not set independently." },
    ],
  },
  {
    section: "Combustor (T04-driven)",
    entries: [
      { label: "Fuel-air ratio", formula: "f = (Cp_h·T04 - Cp_c·T02) / (eta_b·Q_R - Cp_h·T04)", note: "T04 is a configured input. It must be above T02, which rises with flight Mach." },
      { label: "Combustor-exit pressure", formula: "p04 = p02·(1 - delta_p_cc)" },
    ],
  },
  {
    section: "Nozzle",
    entries: [
      {
        label: "Exit velocity, fully expanded (default)",
        formula: "V9 = sqrt(2·Cp_h·eta_N·T04·[1 - (p_a/p04)^((gamma_h-1)/gamma_h)]),  p9 = p_a",
        note: "Convergent-divergent nozzle expanding all the way to ambient pressure. Also used by the convergent nozzle when it doesn't choke.",
      },
      { label: "Critical (choking) pressure", formula: "p_c = p04·[1 - (1/eta_N)·(gamma_h-1)/(gamma_h+1)]^(gamma_h/(gamma_h-1))", note: "A convergent nozzle chokes when p_c >= p_a (above about Mach 1.5 for a ramjet)." },
      { label: "Choked exit state (convergent only)", formula: "T9 = 2·T04/(gamma_h+1),  V9 = sqrt(gamma_h·R_h·T9),  p9 = p_c" },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      { label: "Specific thrust", formula: "T/mdot_a = [(1+f)·V9 - V] + (A9/mdot_a)·(p9 - p_a)", note: "The pressure term is zero for the fully expanded nozzle." },
      { label: "Thrust", formula: "T = mdot_a·(T/mdot_a)" },
      { label: "TSFC", formula: "TSFC = f / (T/mdot_a)" },
      { label: "Effective exhaust velocity", formula: "V_eff = (T/mdot_a + V)/(1+f)", note: "Equals V9 for the expanded nozzle; credits the pressure thrust of a choked one so the efficiencies stay meaningful." },
      { label: "Propulsive efficiency", formula: "eta_P = 2·(V/V_eff) / (1 + V/V_eff)" },
      { label: "Thermal efficiency", formula: "eta_th = [(1+f)·V_eff^2/2 - V^2/2] / (f·Q_R)" },
      { label: "Overall efficiency", formula: "eta_o = eta_P·eta_th" },
      { label: "Ideal-cycle check", formula: "T/mdot_a = M·sqrt(gamma·R·T_a)·[(1+f)·sqrt(T04/T_a)/sqrt(1 + (gamma-1)/2·M^2) - 1]", note: "With every efficiency 1 and no pressure loss the solver reproduces this closed form exactly (exit Mach = flight Mach)." },
    ],
  },
];

// Scramjet — Ref: reference/scramjet.md.
// Stations: 1 = freestream / intake inlet, 2 = combustor entrance,
// 3 = combustor exit / nozzle entrance, 4 = nozzle exit. No compressor
// or turbine; the flow stays supersonic through the combustor.
const SCRAMJET_FORMULAS = [
  {
    section: "Intake (ramp compression, M1 -> M2 > 1)",
    entries: [
      { label: "Freestream (station 1)", formula: "V1 = M1·sqrt(gamma_c·R_c·T1), with T1, p1 from the ISA troposphere at the configured altitude" },
      {
        label: "Combustor-entrance static temperature",
        formula: "T2 = T1·(1 + (gamma_c-1)/2·M1^2) / (1 + (gamma_c-1)/2·M2^2)",
        note: "M2 (combustor-entrance Mach, > 1) is a configured input.",
      },
      {
        label: "Combustor-entrance static pressure (used by the solver)",
        formula: "p2 = p1·(1 + eta_I·(T2/T1 - 1))^(gamma_c/(gamma_c-1))",
        note: "From the intake isentropic efficiency eta_I = (Tx - T1)/(T2 - T1).",
      },
      { label: "Area ratio", formula: "A2/A1 = (M1/M2)·[(1 + (gamma_c-1)/2·M1^2) / (1 + (gamma_c-1)/2·M2^2)]^((gamma_c+1)/(2·(gamma_c-1)))" },
      {
        label: "Combustor-entrance stagnation temperature",
        formula: "T02 = T2·(1 + (gamma_c-1)/2·M2^2)",
        note: "Not given for this station in the source; the same lecturer derives the identical identity for the ramjet's diffuser (judgment call #3).",
      },
      {
        label: "MIL-E-5007D total-pressure recovery (reference only)",
        formula: "p02/p01 = 800/(M1^4 + 935) for M1 > 5; 1 - 0.075·(M1-1)^1.35 for 1 < M1 < 5",
        note: "Published MIL-E-5007D constants (the source prints 0.776 and 1.5, which goes negative above Mach 2.2). Reported for comparison only — NOT used by the solver, which takes p2 from eta_I as the source's own derivation chain does (judgment call #4).",
      },
    ],
  },
  {
    section: "Combustor (supersonic, f-driven)",
    entries: [
      {
        label: "Combustor-exit stagnation temperature",
        formula: "T03 = (f·eta_b·Q_R + Cp_c·T02) / (Cp_h·(1+f))",
        note: "Per unit air mass flow. The fuel-air ratio f is a configured input — not solved from a target temperature.",
      },
      {
        label: "Combustor-exit Mach M3 (solved)",
        formula: "T03/T02 = (M3^2/M2^2)·[(1 + gamma_c·M2^2)/(1 + gamma_h·M3^2)]^2·(1 + (gamma_h-1)/2·M3^2)/(1 + (gamma_c-1)/2·M2^2)",
        note: "Solved for M3 on the supersonic (M3 > 1) branch by bisection. If T03/T02 exceeds this ratio's value at M3 = 1, the combustor thermally chokes and there is no solution.",
      },
      { label: "Combustor-exit static pressure", formula: "p3 = p2·(1 + gamma_c·M2^2) / (1 + gamma_c·M3^2)", note: "gamma_c in both Mach terms, exactly as transcribed from the source." },
      { label: "Combustor-exit static temperature", formula: "T3 = T03 / (1 + (gamma_h-1)/2·M3^2)" },
    ],
  },
  {
    section: "Nozzle (fully expanded to ambient)",
    entries: [
      {
        label: "Nozzle-exit static temperature",
        formula: "T4 = T3 - T3·eta_N·(1 - (p_a/p3)^((gamma_h-1)/gamma_h)), with p4 = p_a",
        note: "Deliberate deviation: the source writes (p2/p3) here, which is physically anomalous for a 3->4 expansion; this project uses (p_a/p3), i.e. the nozzle expanded fully to ambient (judgment call #1).",
      },
      { label: "Nozzle-exit velocity", formula: "V4 = sqrt(2·Cp_h·(T03 - T4))" },
    ],
  },
  {
    section: "Overall performance",
    entries: [
      { label: "Thrust / specific thrust", formula: "T = mdot_a·[(1+f)·V4 - V1],  T/mdot_a = (1+f)·V4 - V1" },
      { label: "TSFC", formula: "TSFC = mdot_f/T = f / (T/mdot_a)" },
      { label: "Propulsive efficiency", formula: "eta_P = 2·V1 / (V1 + V4)", note: "The source's own f<<1 form (judgment call #5)." },
      { label: "Thermal efficiency", formula: "eta_th = (V4^2 - V1^2) / (2·f·eta_b·Q_R)", note: "The source's own f<<1 form (judgment call #5)." },
      { label: "Overall efficiency", formula: "eta_o = eta_P·eta_th" },
      {
        label: "Specific impulse",
        formula: "Isp = T / (mdot_f·g), g = 9.80665 m/s^2",
        note: "Taken on fuel flow mdot_f — the source leaves mdot unsubscripted; same-lecturer precedent elsewhere in the course (judgment call #2).",
      },
    ],
  },
];

/**
 * Symbol glossary — the notation conventions used across every formula
 * above (and every FormulaLabel/FieldInfoLabel in the live app itself),
 * so a reader doesn't have to already know gas-turbine shorthand to
 * follow the formula list. Generic/shared symbols only; station-specific
 * subscript meanings (e.g. what "04" means for THIS engine) are listed
 * per engine in ENGINE_STATION_NOTES below, since they differ by engine.
 */
export const SYMBOL_GLOSSARY = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest at this point." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving air/gas." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving air/gas." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound." },
  { symbol: "V, U, u", meaning: "Velocity (flow speed or flight speed, depending on context)." },
  { symbol: "rho", meaning: "Density." },
  { symbol: "h, h0", meaning: "Static / stagnation specific enthalpy." },
  {
    symbol: "Subscript numbers (e.g. T04, p03)",
    meaning: "The station number the property is measured at — a fixed point along the engine's flow path. Station numbering is this engine's own (see the Station Analysis table in the app); station 'a' always means the freestream, well ahead of the engine.",
  },
  { symbol: "f", meaning: "Fuel-air ratio — mass of fuel burned per unit mass of air (mdot_fuel / mdot_a)." },
  { symbol: "b", meaning: "Bleed ratio — mass of air bled off (for cooling, anti-icing, etc.) per unit mass of inducted air (mdot_bleed / mdot_a)." },
  { symbol: "mdot, mdot_a", meaning: "Mass flow rate (kg/s) — mdot_a specifically means the air mass flow rate through the engine core." },
  { symbol: "Cp_c, Cp_h", meaning: "Specific heat at constant pressure, J/(kg·K) — Cp_c for the cold section (upstream of the combustor), Cp_h for the hot section (downstream of it)." },
  { symbol: "gamma_c, gamma_h", meaning: "Ratio of specific heats (Cp/Cv), dimensionless — same cold/hot split as Cp." },
  { symbol: "R", meaning: "Specific gas constant, J/(kg·K) — derived from Cp and gamma (R = Cp·(gamma-1)/gamma), not an independent input." },
  { symbol: "eta_x", meaning: "An efficiency (a fraction, 0-1) — which component it belongs to is given by the subscript, e.g. eta_d = intake/diffuser efficiency, eta_b = combustor efficiency, eta_t = turbine efficiency, eta_N = nozzle efficiency, eta_m = mechanical (shaft) efficiency." },
  { symbol: "pi_x", meaning: "A pressure ratio (dimensionless, >1) — which component it belongs to is given by the subscript, e.g. pi_c = overall compressor pressure ratio." },
  { symbol: "alpha", meaning: "A power/energy SPLIT fraction (0-1) — e.g. the fraction of a turbine's available energy sent to a shaft/propeller/fan rather than a residual jet. What exactly it splits depends on the engine — see that engine's own formulas above." },
  { symbol: "beta", meaning: "Engine-specific — a bypass ratio (turbofan) or a solved power-split fraction (propfan). See that engine's own formulas above for its exact meaning here." },
  { symbol: "lambda", meaning: "Fraction of turbine power driving the compressor (shaft-balance formulas) — a design input, not derived." },
];

/**
 * The physical gas-property constants every engine's physics uses by
 * default (see aeropropsim/constants.py) — all configurable in each
 * engine's own Advanced section, but these are the values used unless
 * changed.
 */
export const GAS_PROPERTY_CONSTANTS = [
  { symbol: "gamma_c", value: "1.400", meaning: "Cold-section ratio of specific heats (air, upstream of the combustor)." },
  { symbol: "Cp_c", value: "1005 J/(kg·K)", meaning: "Cold-section specific heat at constant pressure." },
  { symbol: "gamma_h", value: "1.333", meaning: "Hot-section ratio of specific heats (combustion products, downstream of the combustor)." },
  { symbol: "Cp_h", value: "1148 J/(kg·K)", meaning: "Hot-section specific heat at constant pressure." },
];

/**
 * Default efficiency/design values every engine starts from (Advanced
 * section) — the source's own typical ranges, or a clearly labelled
 * conventional placeholder where the source gives none. Not every
 * engine uses every one of these (e.g. eta_tt_stage doesn't apply to
 * the propfan, which uses eta_HPT/eta_IPT/eta_ft instead) — shown here
 * as the shared, common defaults across most of them.
 */
export const DEFAULT_VALUE_CONSTANTS = [
  { symbol: "eta_d", value: "0.80", meaning: "Intake/diffuser efficiency (typical range 0.70–0.90)." },
  { symbol: "eta_c_stage", value: "0.90", meaning: "Per-stage compressor isentropic/polytropic efficiency." },
  { symbol: "eta_b", value: "0.97", meaning: "Combustor efficiency (typical ~0.97)." },
  { symbol: "delta_p_cc_pct", value: "0.05 (5%)", meaning: "Combustor fractional total-pressure loss. Conventional placeholder — not a number the source gives directly." },
  { symbol: "Q_R", value: "43,000,000 J/kg (43 MJ/kg)", meaning: "Fuel heating value — the generic kerosene default. Pick another fuel (hydrogen, methane, JP-7, ...) in the app's Fuel section and this changes to that fuel's published lower heating value." },
  { symbol: "eta_m", value: "0.98", meaning: "Mechanical (shaft) efficiency between a turbine and what it drives." },
  { symbol: "eta_tt_stage", value: "0.90", meaning: "Per-stage axial turbine total-to-total isentropic efficiency. Conventional literature value — the source only gives a number for radial turbines." },
  { symbol: "eta_N", value: "0.95", meaning: "Nozzle efficiency (source: “high, ~0.95+, typical”)." },
];

export const ENGINE_FORMULAS = {
  turbojet: { name: "Turbojet", sections: TURBOJET_FORMULAS },
  turboprop: { name: "Turboprop", sections: TURBOPROP_FORMULAS },
  turboshaft: { name: "Turboshaft", sections: TURBOSHAFT_FORMULAS },
  turbofan: { name: "Turbofan (two-spool, unmixed)", sections: TURBOFAN_FORMULAS },
  propfan: { name: "Propfan (three-spool, unducted fan)", sections: PROPFAN_FORMULAS },
  ramjet: { name: "Ramjet", sections: RAMJET_FORMULAS },
  scramjet: { name: "Scramjet (supersonic-combustion ramjet)", sections: SCRAMJET_FORMULAS },
};
