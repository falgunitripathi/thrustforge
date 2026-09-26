/**
 * "Load a real engine" presets — rough, public figures for well-known
 * engines, so students can see how close a textbook cycle model gets.
 *
 * Each preset is a config patch laid over the engine's defaults, plus the
 * published figures to compare against. Published numbers are the
 * manufacturer/type-sheet values as listed on each engine's Wikipedia
 * page; inputs that aren't published (turbine temperatures, some
 * airflows) are marked as our estimates in `note`.
 *
 * The model's atmosphere stops at 11 km, so high-flying engines are set
 * at sea-level take-off (where their published figures apply) or with
 * the altitude capped and a note saying so.
 */

/** Model quantities a published figure can be compared with. */
export const METRICS = {
  thrust: { label: "Thrust", unit: "kN", digits: 1, get: (r) => r.performance.thrust / 1e3 },
  tsfc: { label: "TSFC", unit: "g/(kN·s)", digits: 1, get: (r) => r.performance.tsfc * 1e6 },
  eshp: { label: "Equivalent shaft power", unit: "kW", digits: 0, get: (r) => r.performance.ESHP_W / 1e3 },
  shaft: { label: "Shaft power", unit: "kW", digits: 0, get: (r) => r.performance.Pload_W / 1e3 },
  sfc: { label: "SFC", unit: "g/kWh", digits: 0, get: (r) => r.performance.SFC_kg_per_kWh * 1e3 },
  bpr: { label: "Bypass ratio", unit: "", digits: 2, get: (r) => r.mixer?.beta ?? r.performance.beta },
};

const SEA_LEVEL_STATIC = { altitude_m: 0, mach_flight: 0 };

export const PRESETS = {
  turbojet: [
    {
      id: "jumo004",
      name: "Junkers Jumo 004B",
      aircraft: "Messerschmitt Me 262 (1944)",
      blurb: "The first jet engine in mass production: an 8-stage axial compressor with a pressure ratio of only 3.14.",
      patch: { ...SEA_LEVEL_STATIC, n_compressor_stages: 8, pi_c: 3.14, T04: 1048, mdot_a: 21.2, eta_c_stage: 0.82, eta_tt_stage: 0.85 },
      published: [{ metric: "thrust", value: 8.8 }],
      note: "Airflow (21.2 kg/s) and turbine temperature (1048 K) are our estimates; stage efficiencies are lowered to 0.82/0.85 for 1940s blading.",
    },
    {
      id: "j79dry",
      name: "GE J79-GE-17 (dry)",
      aircraft: "F-4 Phantom II, F-104 Starfighter",
      blurb: "A 1950s Mach 2 fighter engine: 17 compressor stages, pressure ratio 13.5, afterburner off (military power).",
      patch: { ...SEA_LEVEL_STATIC, n_compressor_stages: 17, pi_c: 13.5, T04: 1210, mdot_a: 77 },
      published: [{ metric: "thrust", value: 52.8 }, { metric: "tsfc", value: 24 }],
      note: "All inputs are published figures. The model comes out low on thrust and high on fuel use — it uses textbook stage losses, while the real J79 had variable stators that keep every stage near its best.",
    },
    {
      id: "j79ab",
      name: "GE J79-GE-17 (afterburner)",
      aircraft: "F-4 Phantom II, F-104 Starfighter",
      blurb: "The same J79 with the afterburner lit: about 50% more thrust for more than twice the fuel per newton.",
      patch: { ...SEA_LEVEL_STATIC, n_compressor_stages: 17, pi_c: 13.5, T04: 1210, mdot_a: 77, afterburner_on: true, T06_ab: 2000 },
      published: [{ metric: "thrust", value: 80 }, { metric: "tsfc", value: 55.7 }],
      note: "Afterburner exit temperature (2000 K) is our estimate.",
    },
  ],
  turbojet2: [
    {
      id: "olympus_dry",
      name: "Rolls-Royce/Snecma Olympus 593 Mk 610 (dry)",
      aircraft: "Concorde",
      blurb: "Concorde's two-spool turbojet at take-off without reheat: 7-stage LP and 7-stage HP compressors, overall pressure ratio 15.5.",
      patch: { ...SEA_LEVEL_STATIC, pi_LPC: 3.6, pi_HPC: 4.3, T05: 1450, mdot_a: 186 },
      published: [{ metric: "thrust", value: 139.4 }],
      note: "The 3.6 × 4.3 split of the 15.5 pressure ratio and the 1450 K turbine temperature are our estimates. Concorde cruised at Mach 2 near 17 km — above the 11 km this model's atmosphere reaches.",
    },
    {
      id: "olympus_reheat",
      name: "Rolls-Royce/Snecma Olympus 593 Mk 610 (reheat)",
      aircraft: "Concorde",
      blurb: "Take-off with reheat (afterburner) lit — Concorde used it for take-off and to push through Mach 1.",
      patch: { ...SEA_LEVEL_STATIC, pi_LPC: 3.6, pi_HPC: 4.3, T05: 1450, mdot_a: 186, afterburner_on: true, T08_ab: 1500 },
      published: [{ metric: "thrust", value: 169.2 }, { metric: "tsfc", value: 39 }],
      note: "Reheat exit temperature (1500 K) is our estimate: Concorde's reheat was mild, adding only about 20% thrust.",
    },
  ],
  turbofan_unmixed: [
    {
      id: "cfm56_7b",
      name: "CFM56-7B27 (take-off)",
      aircraft: "Boeing 737 Next Generation",
      blurb: "The world's best-selling jet engine at take-off: bypass ratio 5.1, overall pressure ratio 32.8.",
      patch: { ...SEA_LEVEL_STATIC, beta: 5.1, pi_f: 1.6, pi_LPC: 1.6, pi_HPC: 12.8, T05: 1600, mdot_a: 58 },
      published: [{ metric: "thrust", value: 121.4 }, { metric: "tsfc", value: 10.5, text: "10.1–10.9" }],
      note: "Total airflow 355 kg/s is published (so core flow 58 kg/s at BPR 5.1); the fan/booster/HPC split and 1600 K turbine temperature are our estimates.",
    },
    {
      id: "cfm56_5b_cruise",
      name: "CFM56-5B (cruise)",
      aircraft: "Airbus A320",
      blurb: "Cruising at 35,000 ft and Mach 0.78 — where an airliner engine spends most of its life, and where fuel use matters most.",
      patch: { altitude_m: 10700, mach_flight: 0.78, beta: 6, pi_f: 1.7, pi_LPC: 1.6, pi_HPC: 12, T05: 1450, mdot_a: 22, eta_d: 0.95 },
      published: [{ metric: "tsfc", value: 15.4 }],
      note: "Cruise airflow and turbine temperature are our estimates, so compare TSFC rather than thrust. Intake efficiency is raised to 0.95, typical of a subsonic airliner pod.",
    },
  ],
  turbofan_geared: [
    {
      id: "pw1133g",
      name: "Pratt & Whitney PW1133G (take-off)",
      aircraft: "Airbus A321neo",
      blurb: "A geared turbofan: a gearbox lets the huge fan turn slowly while the LP turbine spins fast, allowing bypass ratio 12.5.",
      patch: { ...SEA_LEVEL_STATIC, layout: "geared", beta: 12.5, pi_f: 1.4, pi_LPC: 2.2, pi_HPC: 14, T05: 1750, mdot_a: 44 },
      published: [{ metric: "thrust", value: 147.3 }],
      note: "Airflow isn't published, so the core flow (44 kg/s) is set to give about the published thrust; the pressure ratios and 1750 K turbine temperature are our estimates. Compare its TSFC with the CFM56 preset.",
    },
  ],
  turbofan_three_spool: [
    {
      id: "rb211_524",
      name: "Rolls-Royce RB211-524G/H (take-off)",
      aircraft: "Boeing 747-400, 767",
      blurb: "Rolls-Royce's three-spool design: fan, IP and HP spools each turn at their own best speed. Bypass ratio 4.3, overall pressure ratio 32.8.",
      patch: { ...SEA_LEVEL_STATIC, layout: "three_spool", beta: 4.3, pi_f: 1.6, pi_LPC: 4.5, pi_HPC: 4.5, T05: 1550, mdot_a: 136 },
      published: [{ metric: "thrust", value: 258, text: "253–264" }, { metric: "tsfc", value: 10.7, text: "10.3–11.0" }],
      note: "Airflow isn't published, so the core flow (136 kg/s) is set to give about the published thrust; the IP/HP split and 1550 K turbine temperature are our estimates.",
    },
  ],
  turbofan_mixed: [
    {
      id: "f100_dry",
      name: "Pratt & Whitney F100-PW-229 (dry)",
      aircraft: "F-15E Strike Eagle, F-16",
      blurb: "A low-bypass fighter turbofan: the bypass air and the core exhaust mix before one shared nozzle. Bypass ratio 0.36, overall pressure ratio 32.",
      patch: { ...SEA_LEVEL_STATIC, layout: "mixed", pi_f: 4.5, pi_LPC: 1, pi_HPC: 7.11, T05: 1600, mdot_a: 77, afterburner_on: false },
      published: [{ metric: "thrust", value: 79.1 }, { metric: "bpr", value: 0.36 }],
      note: "Total airflow 112 kg/s is published. In this model the bypass ratio comes out of the mixer's pressure balance, so the fan ratio (4.5) and turbine temperature (1600 K) are our estimates, chosen to land near the real bypass ratio.",
    },
    {
      id: "f100_ab",
      name: "Pratt & Whitney F100-PW-229 (afterburner)",
      aircraft: "F-15E Strike Eagle, F-16",
      blurb: "The same F100 with the afterburner lit behind the mixer — the textbook afterburning turbofan.",
      patch: { ...SEA_LEVEL_STATIC, layout: "mixed", pi_f: 4.5, pi_LPC: 1, pi_HPC: 7.11, T05: 1600, mdot_a: 77, afterburner_on: true, T08_ab: 1900 },
      published: [{ metric: "thrust", value: 129.6 }],
      note: "Afterburner exit temperature (1900 K) is our estimate.",
    },
  ],
  turboprop: [
    {
      id: "t56",
      name: "Allison T56-A-15",
      aircraft: "Lockheed C-130H Hercules",
      blurb: "The C-130's turboprop: a 14-stage axial compressor driving a four-blade propeller through a reduction gearbox.",
      patch: { altitude_m: 0, mach_flight: 0.05, n_compressor_stages: 14, pi_c: 9.5, T04: 1350, mdot_a: 14.7 },
      published: [{ metric: "eshp", value: 3660 }],
      note: "Pressure ratio (9.5), airflow (14.7 kg/s) and turbine temperature (1350 K) are commonly quoted figures, not type-sheet values. Mach 0.05 stands in for take-off — the turboprop model needs some forward speed.",
    },
  ],
  turboshaft: [
    {
      id: "t53",
      name: "Lycoming T53-L-13B",
      aircraft: "Bell UH-1 \"Huey\"",
      blurb: "The Vietnam-era Huey's engine: 5 axial stages plus a centrifugal stage, pressure ratio about 7.4.",
      patch: { n_compressor_stages: 6, pi_c: 7.4, T04: 1200, mdot_a: 4.85 },
      published: [{ metric: "shaft", value: 1044 }],
      note: "Pressure ratio and airflow are from the T53-L-701 sibling; turbine temperature (1200 K) is our estimate. This model treats the centrifugal stage as a 6th axial stage.",
    },
    {
      id: "t700",
      name: "GE T700/T6E",
      aircraft: "NHIndustries NH90",
      blurb: "A modern helicopter turboshaft: pressure ratio 17 from 5 axial stages and 1 centrifugal stage.",
      patch: { n_compressor_stages: 6, pi_c: 17, T04: 1500, mdot_a: 5.1 },
      published: [{ metric: "shaft", value: 1775 }, { metric: "sfc", value: 263 }],
      note: "Airflow isn't published, so it's set (5.1 kg/s) to give about the published power — compare the SFC. Turbine temperature (1500 K) is our estimate.",
    },
  ],
  propfan: [
    {
      id: "ge36_to",
      name: "GE36 UDF (take-off)",
      aircraft: "Flight-tested on a Boeing 727 and MD-80 (1986–88)",
      blurb: "The unducted fan: two rows of open, contra-rotating blades with an effective bypass ratio of about 35.",
      patch: { altitude_m: 0, mach_flight: 0.05, pi_IPC: 2.6, pi_HPC: 10, T05: 1600, mdot_a: 28 },
      published: [{ metric: "thrust", value: 110 }, { metric: "tsfc", value: 6.6 }],
      note: "Overall pressure ratio 26 is published; the 2.6 × 10 split, turbine temperature and core airflow are our estimates (airflow set to give about the published thrust).",
    },
    {
      id: "ge36_cruise",
      name: "GE36 UDF (cruise)",
      aircraft: "Designed for the Boeing 7J7 and MD-91/92",
      blurb: "Cruising at Mach 0.78 — the reason propfans exist: roughly 20-30% less fuel than the turbofans of their day.",
      patch: { altitude_m: 10700, mach_flight: 0.78, pi_IPC: 2.6, pi_HPC: 10, T05: 1500, mdot_a: 12, eta_d: 0.95 },
      published: [{ metric: "tsfc", value: 13.9 }],
      note: "Published cruise TSFC is for the demonstrator engine. Cruise airflow and turbine temperature are our estimates, so compare TSFC rather than thrust — and against the CFM56 cruise preset.",
    },
  ],
  turboramjet: [
    {
      id: "j58_ab",
      name: "Pratt & Whitney J58 (take-off, afterburner)",
      aircraft: "Lockheed SR-71 Blackbird",
      blurb: "The SR-71's engine at take-off, running as an afterburning turbojet: 9-stage compressor, pressure ratio 8.8.",
      patch: { ...SEA_LEVEL_STATIC, mode: "turbojet", pi_c: 8.8, T04: 1370, mdot_a: 136, afterburner_on: true, T06_ab: 1950 },
      published: [{ metric: "thrust", value: 151.2 }, { metric: "tsfc", value: 54 }],
      note: "Uninstalled thrust; airflow 136 kg/s (300 lb/s) is published, turbine and afterburner temperatures are our estimates. At Mach 3.2 cruise near 24 km — above this model's 11 km atmosphere — bypass bleed made it work much like a ramjet.",
    },
    {
      id: "j58_dry",
      name: "Pratt & Whitney J58 (take-off, dry)",
      aircraft: "Lockheed SR-71 Blackbird",
      blurb: "The same J58 with the afterburner off.",
      patch: { ...SEA_LEVEL_STATIC, mode: "turbojet", pi_c: 8.8, T04: 1370, mdot_a: 136, afterburner_on: false },
      published: [{ metric: "thrust", value: 111.2 }],
      note: "Uninstalled thrust; turbine temperature (1370 K) is our estimate.",
    },
  ],
  ramjet: [
    {
      id: "brahmos",
      name: "BrahMos (cruise)",
      aircraft: "BrahMos supersonic cruise missile",
      blurb: "A solid rocket boosts the missile to supersonic speed, then a liquid-fuel ramjet cruises it at about Mach 2.8.",
      patch: { altitude_m: 10000, mach_flight: 2.8 },
      published: [{ label: "Cruise speed", text: "Mach 2.8" }],
      note: "Only the flight condition is set: engine figures are classified. Watch how much ram compression (p02/p_a) Mach 2.8 alone gives.",
    },
  ],
  scramjet: [
    {
      id: "x51a",
      name: "Boeing X-51A Waverider",
      aircraft: "Pratt & Whitney Rocketdyne SJY61 scramjet",
      blurb: "In 2013 the X-51A flew on scramjet power for about 210 s, reaching Mach 5.1 on ordinary hydrocarbon (JP-7) fuel.",
      patch: { altitude_m: 11000, mach_flight: 5.1 },
      published: [{ label: "Top speed", text: "Mach 5.1" }],
      note: "Only the flight condition is set: engine figures aren't public. The real flight was near 18-21 km; this model's atmosphere stops at 11 km.",
    },
  ],
};

/** Which preset list applies: turbofan layouts each have their own. */
export function presetKey(engineType, config) {
  return engineType === "turbofan" ? `turbofan_${config.layout ?? "unmixed"}` : engineType;
}
