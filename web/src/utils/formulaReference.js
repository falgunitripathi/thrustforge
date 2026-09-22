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

export const ENGINE_FORMULAS = {
  turbojet: { name: "Turbojet", sections: TURBOJET_FORMULAS },
  turboprop: { name: "Turboprop", sections: TURBOPROP_FORMULAS },
  turboshaft: { name: "Turboshaft", sections: TURBOSHAFT_FORMULAS },
  turbofan: { name: "Turbofan (two-spool, unmixed)", sections: TURBOFAN_FORMULAS },
  propfan: { name: "Propfan (three-spool, unducted fan)", sections: PROPFAN_FORMULAS },
};
