/**
 * Turns a solver error into something a student can act on.
 *
 * Every engine's own up-front checks start "solveX:" and are already
 * written to name the fix, so those pass through (prefix stripped). The
 * physics helpers deeper down (nozzle, turbine, combustor) fail with
 * technical messages — "unchokedExitVelocity: non-physical (bracket < 0)"
 * — that name a variable, not a cause. Those are real "this design can't
 * work" cases, so each known pattern maps to a plain explanation.
 * Returns null when nothing useful can be said.
 */
const PATTERNS = [
  {
    test: /unchokedExitVelocity: non-physical|pa\/p0\d+=[\d.]+ >= 1|p_a should be <= p0/,
    text:
      "The gas reaches the nozzle at a LOWER pressure than the outside air, so it can't flow out and make " +
      "thrust. The turbine had to take so much energy to drive the compressor (and any fan or propeller) " +
      "that too little pressure was left. Try a higher compressor pressure ratio or turbine inlet " +
      "temperature, better component efficiencies, or a smaller load on the turbine (for a turbofan, a " +
      "lower bypass ratio or fan pressure ratio).",
  },
  {
    test: /turbinePressureRatio: non-physical|stagePressureRatioFromDT0: non-physical|T05s\/T04=/,
    text:
      "The turbine can't supply the work the compressor (and fan or propeller) needs at these settings. " +
      "This usually happens at high flight Mach, where ram heating makes the compressor's job much " +
      "bigger, or with a very low turbine inlet temperature. Lower the flight Mach number or the " +
      "pressure ratio, or raise the turbine inlet temperature.",
  },
  {
    test: /fuel_?[aA]ir_?[rR]atio: non-physical/,
    text:
      "The combustor temperature is too high for this fuel: even burning it perfectly can't heat the gas " +
      "that much. Lower the turbine or combustor exit temperature, or choose a fuel with a higher heating value.",
  },
  {
    test: /specific_thrust_val must be > 0/,
    text: "No useful thrust at these settings: the exhaust leaves no faster than the air came in. Raise the turbine inlet temperature or pressure ratio, or fly slower.",
  },
  {
    test: /mach_flight must be > 0/,
    text: "A turboprop needs some forward speed: its propeller thrust is worked out from the flight speed. Set the flight Mach number above 0.",
  },
  {
    test: /isaTroposphere/,
    text: "The altitude must be between 0 and 11,000 m (the part of the atmosphere this model covers).",
  },
];

export function explainError(message) {
  if (!message) return null;
  for (const p of PATTERNS) {
    if (p.test.test(message)) return p.text;
  }
  if (/^solve\w+:/.test(message)) {
    return message.replace(/^solve\w+:\s*/, "");
  }
  return null;
}
